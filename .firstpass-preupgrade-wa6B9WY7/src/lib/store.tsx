import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Confidence, PersistedState, Progress, Question, RawQuestion } from '../types/qbank'
import { BASE_QUESTIONS, makeId, toQuestions, validateQuestions } from './data'
import { dateKey } from './stats'

const STATE_KEY = 'fp:state:v1'
const IMPORT_KEY = 'fp:imported:v1'
const DAILY_KEY = 'fp:daily:v1'
export const DAILY_GOAL = 20

const blank = (): Progress => ({ attempts: 0, correct: 0, wrong: 0 })

function loadState(): PersistedState {
  const fallback: PersistedState = {
    progress: {},
    flagged: [],
    studyDates: [],
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  }
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    return s ? { ...fallback, ...s } : fallback
  } catch {
    return fallback
  }
}

function loadImported(): RawQuestion[] {
  try {
    return validateQuestions(JSON.parse(localStorage.getItem(IMPORT_KEY) || '[]')).valid
  } catch {
    return []
  }
}

function loadDaily(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DAILY_KEY) || '{}')
  } catch {
    return {}
  }
}

interface Store {
  questions: Question[]
  byId: Map<string, Question>
  state: PersistedState
  importedCount: number
  todayCount: number
  dailyGoal: number
  importQuestions: (raw: RawQuestion[]) => { added: number; duplicates: number }
  clearImported: () => void
  recordAnswer: (id: string, correct: boolean) => void
  setConfidence: (id: string, level: Confidence) => void
  toggleFlag: (id: string) => void
  resetProgress: () => void
  toggleTheme: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const [imported, setImported] = useState<RawQuestion[]>(loadImported)
  const [daily, setDaily] = useState<Record<string, number>>(loadDaily)

  const questions = useMemo(() => {
    const map = new Map<string, Question>()
    for (const q of toQuestions([...BASE_QUESTIONS, ...imported])) if (!map.has(q.id)) map.set(q.id, q)
    return [...map.values()]
  }, [imported])

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])

  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
  }, [state])

  useEffect(() => {
    localStorage.setItem(IMPORT_KEY, JSON.stringify(imported))
  }, [imported])

  useEffect(() => {
    localStorage.setItem(DAILY_KEY, JSON.stringify(daily))
  }, [daily])

  const importQuestions = useCallback(
    (raw: RawQuestion[]) => {
      const existing = new Set(questions.map((q) => q.id))
      const fresh: RawQuestion[] = []
      let duplicates = 0
      for (const r of raw) {
        const id = makeId(r)
        if (existing.has(id)) duplicates++
        else {
          existing.add(id)
          fresh.push(r)
        }
      }
      if (fresh.length) setImported((prev) => [...prev, ...fresh])
      return { added: fresh.length, duplicates }
    },
    [questions],
  )

  const clearImported = useCallback(() => setImported([]), [])

  const recordAnswer = useCallback((id: string, correct: boolean) => {
    const today = dateKey()
    setDaily((d) => ({ ...d, [today]: (d[today] ?? 0) + 1 }))
    setState((s) => {
      const p = s.progress[id] ?? blank()
      return {
        ...s,
        studyDates: s.studyDates.includes(today) ? s.studyDates : [...s.studyDates, today],
        progress: {
          ...s.progress,
          [id]: {
            ...p,
            attempts: p.attempts + 1,
            correct: p.correct + (correct ? 1 : 0),
            wrong: p.wrong + (correct ? 0 : 1),
            lastCorrect: correct,
            lastAt: Date.now(),
          },
        },
      }
    })
  }, [])

  const setConfidence = useCallback(
    (id: string, level: Confidence) => {
      setState((s) => {
        const progress = { ...s.progress }
        const cur = progress[id] ?? blank()
        progress[id] = { ...cur, status: level === 'hard' ? 'hard' : 'mastered' }
        if (level === 'easy') {
          const q = byId.get(id)
          if (q) {
            for (const o of questions) {
              if (o.concept_id === q.concept_id && o.id !== id) {
                const p = progress[o.id]
                if (!p || p.attempts === 0) progress[o.id] = { ...(p ?? blank()), status: 'skipped' }
              }
            }
          }
        }
        return { ...s, progress }
      })
    },
    [byId, questions],
  )

  const toggleFlag = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      flagged: s.flagged.includes(id) ? s.flagged.filter((x) => x !== id) : [...s.flagged, id],
    }))
  }, [])

  const resetProgress = useCallback(() => {
    setState((s) => ({ ...s, progress: {}, flagged: [], studyDates: [] }))
    setDaily({})
  }, [])

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))
  }, [])

  const value: Store = {
    questions,
    byId,
    state,
    importedCount: imported.length,
    todayCount: daily[dateKey()] ?? 0,
    dailyGoal: DAILY_GOAL,
    importQuestions,
    clearImported,
    recordAnswer,
    setConfidence,
    toggleFlag,
    resetProgress,
    toggleTheme,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used inside StoreProvider')
  return c
}
