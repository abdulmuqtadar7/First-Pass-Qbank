import type { DistractorExplanation, OptionKey, RawQuestion } from '../types/qbank'

export function hasOptionE(q: RawQuestion): boolean {
  return typeof q.option_E === 'string' && q.option_E.trim().length > 0
}

export function optionKeysOf(q: RawQuestion): OptionKey[] {
  return hasOptionE(q) ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D']
}

export function optionText(q: RawQuestion, k: OptionKey): string {
  switch (k) {
    case 'A':
      return q.option_A
    case 'B':
      return q.option_B
    case 'C':
      return q.option_C
    case 'D':
      return q.option_D
    case 'E':
      return q.option_E ?? ''
  }
}

export function distractorOf(q: RawQuestion, k: OptionKey): DistractorExplanation {
  return q.distractor_explanations[k] ?? { reason: '', fa_page: q.correct_fa_page }
}
