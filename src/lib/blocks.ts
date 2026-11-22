import type { BlockConfig, PersistedState, Question } from '../types/qbank'
import { fisherYates, selectSessionQuestions } from './sessionBuilder'

export const shuffle = fisherYates

export function eligible(
  questions: Question[],
  cfg: Pick<BlockConfig, 'filter' | 'systems'> & Partial<Pick<BlockConfig, 'tier' | 'angle'>>,
  state: PersistedState,
): Question[] {
  return questions.filter((q) => {
    if (cfg.systems.length && !cfg.systems.includes(q.system.toLowerCase())) return false
    if (cfg.tier && cfg.tier !== 'all' && String(q.tier) !== cfg.tier) return false
    if (cfg.angle && cfg.angle !== 'all' && q.angle !== cfg.angle) return false
    const p = state.progress[q.id]
    switch (cfg.filter) {
      case 'unanswered':
        return (!p || p.attempts === 0) && p?.status !== 'skipped'
      case 'incorrect':
        return !!p && (p.status === 'hard' || p.lastCorrect === false)
      case 'flagged':
        return state.flagged.includes(q.id)
      default:
        return true
    }
  })
}

export function buildBlock(questions: Question[], cfg: BlockConfig, state: PersistedState): Question[] {
  const pool = selectSessionQuestions(eligible(questions, cfg, state), cfg.coverageMode, state.progress)
  return cfg.size > 0 ? pool.slice(0, cfg.size) : pool
}

export function quickPick(questions: Question[], state: PersistedState, n = 10): string[] {
  const fresh: Question[] = []
  const weak: Question[] = []
  const rest: Question[] = []
  for (const q of questions) {
    const p = state.progress[q.id]
    if (p?.status === 'skipped') continue
    if (!p || p.attempts === 0) fresh.push(q)
    else if (p.status === 'hard' || p.lastCorrect === false) weak.push(q)
    else if (p.status !== 'mastered') rest.push(q)
  }
  let picked = [...shuffle(fresh), ...shuffle(weak), ...shuffle(rest)]
  if (!picked.length) picked = shuffle(questions.filter((q) => state.progress[q.id]?.status !== 'skipped'))
  return picked.slice(0, n).map((q) => q.id)
}
