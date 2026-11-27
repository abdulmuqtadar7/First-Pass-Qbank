import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { conceptKey, selectSessionQuestions } from './sessionBuilder'
import type { Answer, Confidence, OptionKey, Progress, Question, Session, SessionMode } from '../types/qbank'
import { cardTextValid, GENERATION_BATCH, pearlCandidates, reviewedCard, type FlashcardRating } from './flashcards'
import { fieldKey, LEGACY_KEYS } from './accountStorage'

export const LEARNING_KEY = 'fp:learning:v1'
const DAY = 86_400_000

export interface ReviewItem {
  dueAt: number
  intervalDays: number
  repetitions: number
  lastReviewed: number
}

export interface AttemptEvent {
  id: string
  at: number
  correct: boolean
  seconds: number
  mode: SessionMode
}

export interface HistoryEntry {
  id: string
  title: string
  completedAt: number
  mode: SessionMode
  ids: string[]
  selections: Record<string, OptionKey | null>
  times: Record<string, number>
  elapsed: number
  correct: number
  answered: number
}

export interface ActiveSession {
  session: Session
  queue: string[]
  position: number
  answers: Record<string, Answer>
  ratings: Record<string, Confidence>
  times: Record<string, number>
  startedAt: number
  updatedAt: number
}

export interface StudyNote { text: string; updatedAt: number; pinned?: boolean }
export interface Flashcard {
  id: string
  questionId: string
  front: string
  back: string
  dueAt: number
  intervalDays: number
  reviews: number
  deck?: string
  recallStreak?: number
  lastReviewed?: number
}

export interface LearningSettings {
  dailyGoal: number
  examDate: string
}

export interface LearningState {
  schedule: Record<string, ReviewItem>
  attempts: AttemptEvent[]
  history: HistoryEntry[]
  active: ActiveSession | null
  notes: Record<string, StudyNote>
  flashcards: Flashcard[]
  settings: LearningSettings
}

function defaults(): LearningState {
  return {
    schedule: {}, attempts: [], history: [], active: null,
    notes: {}, flashcards: [], settings: { dailyGoal: 20, examDate: '' },
  }
}

function load(userId: string): LearningState {
  const fallback = defaults()
  try {
    const value = JSON.parse(localStorage.getItem(fieldKey(userId, 'learning')) || 'null') as Partial<LearningState> | null
    if (!value || typeof value !== 'object') return fallback
    return {
      schedule: value.schedule && typeof value.schedule === 'object' ? value.schedule : {},
      attempts: Array.isArray(value.attempts) ? value.attempts : [],
      history: Array.isArray(value.history) ? value.history : [],
      active: value.active?.session && Array.isArray(value.active.queue) ? value.active : null,
      notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
      flashcards: Array.isArray(value.flashcards) ? value.flashcards : [],
      settings: { ...fallback.settings, ...value.settings },
    }
  } catch { return fallback }
}

interface LearningContextValue extends LearningState {
  setActive: (snapshot: ActiveSession | null) => void
  recordAttempt: (q: Question, correct: boolean, seconds: number, mode: SessionMode) => void
  rateConcept: (q: Question, rating: Confidence) => void
  recordHistory: (entry: Omit<HistoryEntry, 'id' | 'completedAt'>) => void
  saveNote: (id: string, text: string) => void
  deleteNote: (id: string) => void
  toggleNotePin: (id: string) => void
  addFlashcard: (question: Question) => void
  gradeFlashcard: (id: string, rating: FlashcardRating) => void
  generateFlashcards: (questions: readonly Question[], system: string) => void
  createFlashcard: (front: string, back: string, deck: string) => void
  editFlashcard: (id: string, front: string, back: string, deck: string) => void
  deleteFlashcard: (id: string) => void
  setSettings: (settings: Partial<LearningSettings>) => void
  clearLearningProgress: () => void
}

const Context = createContext<LearningContextValue | null>(null)

export function LearningProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [data, setData] = useState<LearningState>(() => load(userId))

  useLayoutEffect(() => {
    try { localStorage.setItem(fieldKey(userId, 'learning'), JSON.stringify(data)) }
    catch (error) { console.error('[FirstPass] Could not save extended learning data', error) }
  }, [data, userId])

  const setActive = useCallback((snapshot: ActiveSession | null) => {
    setData((s) => ({ ...s, active: snapshot }))
  }, [])

  const recordAttempt = useCallback((q: Question, correct: boolean, seconds: number, mode: SessionMode) => {
    const now = Date.now()
    setData((s) => {
      const key = conceptKey(q)
      const prev = s.schedule[key]
      // Only a later recall can grow the interval; repeated same-day answers do not.
      const spacedRecall = !!prev && now >= prev.dueAt && prev.repetitions > 0
      const intervalDays = correct ? (spacedRecall ? Math.min(90, Math.max(3, Math.round(prev.intervalDays * 2))) : Math.max(3, prev?.intervalDays ?? 3)) : 1
      const repetitions = correct ? (spacedRecall || !prev?.repetitions ? (prev?.repetitions ?? 0) + 1 : prev.repetitions) : 0
      return {
        ...s,
        attempts: [...s.attempts.slice(-14_999), { id: q.id, at: now, correct, seconds: Math.max(0, seconds), mode }],
        schedule: {
          ...s.schedule,
          [key]: { dueAt: now + intervalDays * DAY, intervalDays,
            repetitions, lastReviewed: now },
        },
      }
    })
  }, [])

  const rateConcept = useCallback((q: Question, rating: Confidence) => {
    const now = Date.now()
    setData((s) => {
      const key = conceptKey(q)
      const prev = s.schedule[key]
      // Rating refines the interval for the answer already recorded; no extra repetition.
      const intervalDays = rating === 'hard' ? 1 : rating === 'good'
        ? Math.max(3, prev?.intervalDays ?? 3) : Math.max(7, prev?.intervalDays ?? 7)
      return { ...s, schedule: { ...s.schedule, [key]: {
        dueAt: now + intervalDays * DAY, intervalDays,
        repetitions: rating === 'hard' ? 0 : prev?.repetitions ?? 0,
        lastReviewed: now,
      } } }
    })
  }, [])

  const recordHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'completedAt'>) => {
    setData((s) => ({ ...s, history: [{ ...entry, id: crypto.randomUUID(), completedAt: Date.now() }, ...s.history].slice(0, 120) }))
  }, [])

  const saveNote = useCallback((id: string, value: string) => {
    setData((s) => {
      if (s.notes[id]?.text === value) return s
      return { ...s, notes: { ...s.notes, [id]: { ...s.notes[id], text: value, updatedAt: Date.now() } } }
    })
  }, [])

  const deleteNote = useCallback((id: string) => {
    setData((s) => {
      if (!Object.prototype.hasOwnProperty.call(s.notes, id)) return s
      const notes = { ...s.notes }; delete notes[id]
      return { ...s, notes }
    })
  }, [])

  const toggleNotePin = useCallback((id: string) => {
    setData((s) => {
      const note = s.notes[id]
      if (!note?.text.trim()) return s
      return { ...s, notes: { ...s.notes, [id]: { ...note, pinned: !note.pinned } } }
    })
  }, [])

  const addFlashcard = useCallback((q: Question) => {
    setData((s) => {
      if (s.flashcards.some((c) => c.questionId === q.id)) return s
      return { ...s, flashcards: [...s.flashcards, {
        id: crypto.randomUUID(), questionId: q.id, front: q.concept_name,
        back: q.high_yield_pearl, dueAt: Date.now(), intervalDays: 0, reviews: 0,
      }] }
    })
  }, [])

  const generateFlashcards = useCallback((questions: readonly Question[], system: string) => {
    const now = Date.now()
    setData(s => {
      const candidates = pearlCandidates(questions, s.flashcards, system).slice(0, GENERATION_BATCH)
      if (!candidates.length) return s
      return { ...s, flashcards: [...s.flashcards, ...candidates.map(q => ({
        id: crypto.randomUUID(), questionId: q.id, front: q.concept_name,
        back: q.high_yield_pearl, dueAt: now, intervalDays: 0, reviews: 0,
      }))] }
    })
  }, [])

  const createFlashcard = useCallback((front: string, back: string, deck: string) => {
    if (!cardTextValid(front, back, deck)) return
    const next: Flashcard = { id: crypto.randomUUID(), questionId: '', front: front.trim(), back: back.trim(), deck: deck.trim(), dueAt: Date.now(), intervalDays: 0, reviews: 0 }
    setData(s => ({ ...s, flashcards: [...s.flashcards, next] }))
  }, [])

  const editFlashcard = useCallback((id: string, front: string, back: string, deck: string) => {
    if (!cardTextValid(front, back, deck)) return
    setData(s => ({ ...s, flashcards: s.flashcards.map(c => c.id === id ? { ...c, front: front.trim(), back: back.trim(), deck: deck.trim() } : c) }))
  }, [])

  const deleteFlashcard = useCallback((id: string) => {
    setData(s => ({ ...s, flashcards: s.flashcards.filter(c => c.id !== id) }))
  }, [])

  const gradeFlashcard = useCallback((id: string, rating: FlashcardRating) => {
    const now = Date.now()
    setData(s => ({ ...s, flashcards: s.flashcards.map(c => c.id === id ? reviewedCard(c, rating, now) : c) }))
  }, [])

  const setSettings = useCallback((settings: Partial<LearningSettings>) => {
    setData((s) => ({ ...s, settings: { ...s.settings, ...settings } }))
  }, [])

  const clearLearningProgress = useCallback(() => {
    setData((s) => ({ ...s, schedule: {}, attempts: [], history: [], active: null, flashcards: [] }))
  }, [])

  const value = useMemo(() => ({ ...data, setActive, recordAttempt, rateConcept,
    recordHistory, saveNote, deleteNote, toggleNotePin, addFlashcard, gradeFlashcard, generateFlashcards, createFlashcard, editFlashcard, deleteFlashcard, setSettings, clearLearningProgress }),
  [data, setActive, recordAttempt, rateConcept, recordHistory, saveNote, deleteNote, toggleNotePin, addFlashcard, gradeFlashcard, generateFlashcards, createFlashcard, editFlashcard, deleteFlashcard, setSettings, clearLearningProgress])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLearning(): LearningContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('useLearning must be inside LearningProvider')
  return context
}

export function dueConceptQuestions(questions: Question[], schedule: Record<string, ReviewItem>, progress: Record<string, Progress>): Question[] {
  const now = Date.now()
  const pool = questions.filter((q) => schedule[conceptKey(q)]?.dueAt <= now)
  return selectSessionQuestions(pool, 'core_concepts', progress)
}

export function progressExport(userId: string): void {
  const keys = Object.keys(LEGACY_KEYS) as (keyof typeof LEGACY_KEYS)[]
  const payload: Record<string, string | null> = {}
  for (const field of keys) payload[LEGACY_KEYS[field]] = localStorage.getItem(fieldKey(userId, field))
  const blob = new Blob([JSON.stringify({ app: 'FirstPass Q-Bank', version: 3, exportedAt: new Date().toISOString(), userId, storage: payload }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `firstpass-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
