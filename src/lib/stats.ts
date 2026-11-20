import type { Progress, Question } from '../types/qbank'

export function dateKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function computeStreak(dates: string[]): number {
  const set = new Set(dates)
  const cursor = new Date()
  if (!set.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!set.has(dateKey(cursor))) return 0
  }
  let n = 0
  while (set.has(dateKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

export interface Summary {
  total: number
  mastered: number
  skipped: number
  hard: number
  remaining: number
  attempts: number
  correct: number
  pct: number
}

export function summarize(qs: Question[], progress: Record<string, Progress>): Summary {
  let mastered = 0,
    skipped = 0,
    hard = 0,
    attempts = 0,
    correct = 0
  for (const q of qs) {
    const p = progress[q.id]
    if (!p) continue
    attempts += p.attempts
    correct += p.correct
    if (p.status === 'mastered') mastered++
    else if (p.status === 'skipped') skipped++
    else if (p.status === 'hard') hard++
  }
  const total = qs.length
  return {
    total,
    mastered,
    skipped,
    hard,
    remaining: total - mastered - skipped,
    attempts,
    correct,
    pct: total ? Math.round(((mastered + skipped) / total) * 100) : 0,
  }
}

export function conceptsMastered(qs: Question[], progress: Record<string, Progress>): number {
  const groups = new Map<string, Question[]>()
  for (const q of qs) {
    const k = `${q.system}|${q.concept_id}`
    groups.set(k, [...(groups.get(k) ?? []), q])
  }
  let n = 0
  groups.forEach((list) => {
    const st = list.map((q) => progress[q.id]?.status)
    if (st.every((s) => s === 'mastered' || s === 'skipped') && st.some((s) => s === 'mastered')) n++
  })
  return n
}

export function weakQuestions(qs: Question[], progress: Record<string, Progress>, flagged: string[]): Question[] {
  return qs.filter((q) => {
    const p = progress[q.id]
    return flagged.includes(q.id) || p?.status === 'hard' || (!!p && p.lastCorrect === false && p.status !== 'mastered')
  })
}
