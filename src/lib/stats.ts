import type { Progress, Question } from '../types/qbank'
import { conceptKey } from './sessionBuilder'

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
  // A concept is secured if any one representative is marked mastered.
  const mastered = new Set<string>()
  for (const q of qs) if (progress[q.id]?.status === 'mastered') mastered.add(conceptKey(q))
  return mastered.size
}

export function weakQuestions(qs: Question[], progress: Record<string, Progress>, flagged: string[]): Question[] {
  const flags = new Set(flagged)
  return qs.filter((q) => {
    const p = progress[q.id]
    return flags.has(q.id) || p?.status === 'hard' || (!!p && p.lastCorrect === false && p.status !== 'mastered')
  })
}
