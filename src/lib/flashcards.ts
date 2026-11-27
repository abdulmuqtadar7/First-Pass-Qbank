import type { Flashcard } from './learning'
import type { Question } from '../types/qbank'
import { conceptKey } from './sessionBuilder'

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy'
export const DAY_MS = 86_400_000
export const GENERATION_BATCH = 50
export const PERSONAL_DECK = 'Personal'
export const MAX_FRONT = 500
export const MAX_BACK = 4000
export const MAX_DECK = 100

export function cardDeck(card: Flashcard, byId: ReadonlyMap<string, Question>): string {
  return card.deck?.trim() || byId.get(card.questionId)?.system || PERSONAL_DECK
}

export function reviewDelay(card: Flashcard, rating: FlashcardRating): number {
  const previous = Number.isFinite(card.intervalDays) ? Math.max(0, card.intervalDays) : 0
  switch (rating) {
    case 'again': return 10 * 60_000
    case 'hard': return Math.min(365, Math.max(1, Math.round(previous * 1.2))) * DAY_MS
    case 'good': return Math.min(365, Math.max(3, Math.round(previous * 2))) * DAY_MS
    case 'easy': return Math.min(365, Math.max(7, Math.round(previous * 2.5))) * DAY_MS
  }
}
export function reviewedCard(card: Flashcard, rating: FlashcardRating, now: number): Flashcard {
  if (card.dueAt > now) return card
  const delay = reviewDelay(card, rating)
  const streak = rating === 'again' || rating === 'hard' ? 0 : (card.recallStreak ?? 0) + 1
  return { ...card, dueAt: now + delay, intervalDays: delay / DAY_MS, reviews: card.reviews + 1,
    recallStreak: streak, lastReviewed: now }
}
export function cardStatus(card: Flashcard): 'New' | 'Learning' | 'Mastered' {
  if (!card.reviews) return 'New'
  return (card.recallStreak ?? 0) >= 3 && card.intervalDays >= 14 ? 'Mastered' : 'Learning'
}
export function delayLabel(ms: number): string {
  return ms < DAY_MS ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / DAY_MS)}d`
}

/** Existing linked cards take precedence. Generate one representative pearl per missing concept. */
export function pearlCandidates(questions: readonly Question[], cards: readonly Flashcard[], system: string): Question[] {
  const byId = new Map(questions.map(q => [q.id, q]))
  const linked = new Set(cards.map(c => c.questionId))
  const seen = new Set(cards.flatMap(c => { const q = byId.get(c.questionId); return q ? [conceptKey(q)] : [] }))
  const result: Question[] = []
  const sorted = [...questions].sort((a,b) => Number(String(a.tier) !== '1') - Number(String(b.tier) !== '1'))
  for (const q of sorted) {
    if ((system && q.system !== system) || linked.has(q.id) || !cardTextValid(q.concept_name, q.high_yield_pearl, q.system)) continue
    const key = conceptKey(q)
    if (seen.has(key)) continue
    seen.add(key); result.push(q)
  }
  return result
}

export function cardTextValid(front: string, back: string, deck: string): boolean {
  return !!front.trim() && !!back.trim() && !!deck.trim() && front.length <= MAX_FRONT && back.length <= MAX_BACK && deck.length <= MAX_DECK
}
