import type { Progress, Question, AdaptiveMode } from '../types/qbank'
import { conceptKey } from './sessionBuilder'

const DAY = 86_400_000
export type Mastery = 'mastered' | 'learning' | 'weak' | 'untouched'
type Schedule = Record<string, { dueAt: number; lastReviewed: number; intervalDays: number; repetitions: number }>
type Attempt = { id: string; at: number; correct: boolean; mode: string }
export interface ConceptInsight {
  key: string
  name: string
  system: string
  questions: Question[]
  status: Mastery
  dueAt: number | null
  due: boolean
  attempts: number
  accuracy: number
  lastAt: number
  introducedToday: boolean
}

/** Mastery is an estimate based on demonstrated answers, never skipped angles or confidence alone. */
export function analyzeConcepts(questions: readonly Question[], progress: Record<string, Progress>, schedule: Schedule, events: readonly Attempt[], now = Date.now()): ConceptInsight[] {
  const groups = new Map<string, Question[]>()
  const correctDays = new Map<string, Set<string>>()
  const todayAttempts = new Map<string, number>()
  const todayKey = new Date(now).toDateString()
  for (const e of events) {
    if (e.mode === 'review' || !Number.isFinite(e.at)) continue
    const day = new Date(e.at).toDateString()
    if (day === todayKey) todayAttempts.set(e.id, (todayAttempts.get(e.id) ?? 0) + 1)
    if (!e.correct) continue
    const days = correctDays.get(e.id) ?? new Set<string>()
    days.add(day)
    correctDays.set(e.id, days)
  }
  for (const q of questions) {
    const k = conceptKey(q)
    const list = groups.get(k)
    if (list) list.push(q)
    else groups.set(k, [q])
  }
  return [...groups].map(([key, list]) => {
    const answered = list.map(q => progress[q.id]).filter((p): p is Progress => !!p && p.attempts > 0)
    const latest = [...answered].sort((a,b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0]
    const attempts = answered.reduce((n,p) => n + p.attempts, 0)
    const correct = answered.reduce((n,p) => n + p.correct, 0)
    const accuracy = attempts ? correct / attempts : 0
    const correctAngles = answered.filter(p => p.lastCorrect === true).length
    const latestWrong = latest?.lastCorrect === false
    const hard = latest?.status === 'hard' && (!schedule[key] || schedule[key].repetitions === 0)
    const sufficient = list.length > 1 ? correctAngles >= 2 : (correctDays.get(list[0].id)?.size ?? 0) >= 2
    const status: Mastery = !attempts ? 'untouched' : latestWrong || hard ? 'weak'
      : sufficient && latest?.lastCorrect === true && accuracy >= .8 ? 'mastered' : 'learning'
    const lastAt = latest?.lastAt ?? 0
    // Older accounts may not have a schedule; derive a due date without mutating their data.
    const savedDue = schedule[key]?.dueAt
    const fallback = lastAt + (status === 'weak' ? 1 : status === 'mastered' ? 7 : 3) * DAY
    const dueAt = !attempts ? null : typeof savedDue === 'number' && Number.isFinite(savedDue) ? (status === 'weak' ? Math.min(savedDue, fallback) : savedDue) : fallback
    const introducedToday = attempts > 0 && attempts === list.reduce((n,q) => n + (todayAttempts.get(q.id) ?? 0), 0)
    return { introducedToday, key, name: list[0].concept_name || list[0].concept_id, system: list[0].system, questions: list, status, dueAt, due: dueAt !== null && dueAt <= now, attempts, accuracy, lastAt }
  })
}

export function masteryCounts(concepts: readonly ConceptInsight[]) {
  const counts = { mastered: 0, learning: 0, weak: 0, untouched: 0, due: 0, introducedToday: 0 }
  for (const c of concepts) { counts[c.status]++; if (c.due) counts.due++; if (c.introducedToday) counts.introducedToday++ }
  return counts
}

function questionRank(q: Question, progress: Record<string, Progress>, weak: boolean): number {
  const p = progress[q.id]
  if (weak && p?.lastCorrect === false) return 0
  if (weak && p?.status === 'hard') return 1
  if (!p?.attempts) return 2
  if (p.lastCorrect === false || p.status === 'hard') return 3
  return 4
}

/** One question per concept, due and weak concepts first; no unnecessary scheduled repetition in daily mode. */
export function adaptiveQueue(concepts: readonly ConceptInsight[], progress: Record<string, Progress>, mode: AdaptiveMode, size: number): string[] {
  const eligible = concepts.filter(c => mode === 'review' ? c.due : mode === 'weak' ? c.status === 'weak' : c.due || c.status === 'untouched')
  eligible.sort((a,b) => Number(b.due) - Number(a.due) || Number(b.status === 'weak') - Number(a.status === 'weak')
    || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.accuracy - b.accuracy || a.lastAt - b.lastAt || a.key.localeCompare(b.key))
  return eligible.slice(0, Math.max(0, Math.floor(size))).map(c => [...c.questions].sort((a,b) =>
    questionRank(a, progress, c.status === 'weak') - questionRank(b, progress, c.status === 'weak')
    || Number(String(a.tier) !== '1') - Number(String(b.tier) !== '1')
    || (progress[a.id]?.lastAt ?? 0) - (progress[b.id]?.lastAt ?? 0) || a.id.localeCompare(b.id))[0].id)
}

/** Estimate pace to first exposure of all untouched concepts, not exam readiness. */
export function studyPlan(counts: ReturnType<typeof masteryCounts>, goal: number, todayCount: number, examDate: string, now = Date.now()) {
  const today = new Date(now)
  const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const exam = /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? Date.parse(examDate + 'T00:00:00Z') : NaN
  const days = Number.isFinite(exam) && examDate >= localDate ? Math.max(1, Math.round((exam - Date.parse(localDate+'T00:00:00Z'))/DAY)+1) : null
  const newPerDay = days === null ? null : Math.ceil((counts.untouched + counts.introducedToday) / days)
  const target = Math.max(1, Math.round(goal) || 20, newPerDay === null ? 0 : todayCount + counts.due + Math.max(0, newPerDay - counts.introducedToday))
  const remaining = Math.max(0, target - todayCount)
  return { days, newPerDay, target, remaining, blockSize: Math.min(40, remaining, counts.due + counts.untouched) }
}
