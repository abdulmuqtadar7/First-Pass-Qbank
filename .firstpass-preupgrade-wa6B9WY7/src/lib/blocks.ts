import type { BlockConfig, PersistedState, Question } from '../types/qbank'

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function eligible(
  questions: Question[],
  cfg: Pick<BlockConfig, 'filter' | 'systems'>,
  state: PersistedState,
): Question[] {
  return questions.filter((q) => {
    if (cfg.systems.length && !cfg.systems.includes(q.system.toLowerCase())) return false
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
  const pool = shuffle(eligible(questions, cfg, state))
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
