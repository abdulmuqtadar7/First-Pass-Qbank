export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E'
export const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E']

export interface DistractorExplanation {
  reason: string
  fa_page: number
}

export interface RawQuestion {
  system: string
  concept_id: string
  concept_name: string
  tier: string | number
  angle: string
  stem: string
  option_A: string
  option_B: string
  option_C: string
  option_D: string
  option_E?: string
  correct_option: OptionKey
  correct_explanation: string
  correct_fa_page: number
  distractor_explanations: Record<'A' | 'B' | 'C' | 'D', DistractorExplanation> & {
    E?: DistractorExplanation
  }
  high_yield_pearl: string
  /** Optional multi-line Markdown-style First Aid topic summary (bullets, **bold**, "Heading:" lines). */
  topic_overview?: string
}

export interface Question extends RawQuestion {
  id: string
}

export type Status = 'mastered' | 'hard' | 'skipped'
export type Confidence = 'hard' | 'good' | 'easy'
export type Theme = 'light' | 'dark'

export interface Progress {
  status?: Status
  attempts: number
  correct: number
  wrong: number
  lastCorrect?: boolean
  lastAt?: number
}

export interface PersistedState {
  progress: Record<string, Progress>
  flagged: string[]
  studyDates: string[]
  theme: Theme
}

export type SessionMode = 'tutor' | 'exam' | 'review'
export type FilterKey = 'all' | 'unanswered' | 'incorrect' | 'flagged'

export interface Session {
  ids: string[]
  title: string
  mode: SessionMode
  prefill?: Record<string, OptionKey>
}

export interface BlockConfig {
  mode: 'tutor' | 'exam'
  filter: FilterKey
  systems: string[]
  size: number
}

export interface Answer {
  selected: OptionKey | null
  struck: OptionKey[]
}
