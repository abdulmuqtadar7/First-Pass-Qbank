import baseJson from '../data/cardiovascular.json'
import type { OptionKey, Question, RawQuestion } from '../types/qbank'
import { OPTION_KEYS } from '../types/qbank'

export const SYSTEMS = [
  'Cardiovascular',
  'Neurology',
  'Renal',
  'Pharmacology',
  'Microbiology',
  'Pathology',
  'Biochemistry',
  'Immunology',
  'Respiratory',
  'GI',
  'Endocrine',
  'Reproductive',
  'Hematology/Oncology',
]

function hash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function makeId(q: RawQuestion): string {
  return `${q.concept_id}::${hash(q.stem + q.option_A + q.option_B)}`
}

export function toQuestions(raw: RawQuestion[]): Question[] {
  return raw.map((q) => ({ ...q, id: makeId(q) }))
}

const STR_KEYS = [
  'system',
  'concept_id',
  'concept_name',
  'angle',
  'stem',
  'option_A',
  'option_B',
  'option_C',
  'option_D',
  'correct_explanation',
  'high_yield_pearl',
] as const

export function validateQuestions(input: unknown): { valid: RawQuestion[]; errors: string[] } {
  const errors: string[] = []
  const valid: RawQuestion[] = []
  let arr: unknown[] = []
  if (Array.isArray(input)) arr = input
  else if (input && typeof input === 'object' && Array.isArray((input as { questions?: unknown }).questions))
    arr = (input as { questions: unknown[] }).questions
  else return { valid, errors: ['File must be a JSON array of questions.'] }

  arr.forEach((item, i) => {
    const o = item as Record<string, unknown>
    const tag = `#${i + 1}`
    if (!o || typeof o !== 'object') return errors.push(`${tag}: not an object`)
    for (const k of STR_KEYS) {
      if (typeof o[k] !== 'string' || !(o[k] as string).trim()) return errors.push(`${tag}: missing "${k}"`)
    }
    const co = o.correct_option
    if (typeof co !== 'string' || !OPTION_KEYS.includes(co as OptionKey))
      return errors.push(`${tag}: correct_option must be A-D`)
    const cfp = Number(o.correct_fa_page)
    if (!Number.isFinite(cfp)) return errors.push(`${tag}: correct_fa_page invalid`)
    const de = o.distractor_explanations as Record<string, { reason?: unknown; fa_page?: unknown }> | undefined
    if (!de) return errors.push(`${tag}: missing distractor_explanations`)
    const fixed: Record<string, { reason: string; fa_page: number }> = {}
    for (const k of OPTION_KEYS) {
      const d = de[k]
      if (!d || typeof d.reason !== 'string' || !Number.isFinite(Number(d.fa_page)))
        return errors.push(`${tag}: distractor_explanations.${k} invalid`)
      fixed[k] = { reason: d.reason, fa_page: Number(d.fa_page) }
    }
    valid.push({
      ...(o as unknown as RawQuestion),
      tier: (o.tier as string | number) ?? '2',
      correct_fa_page: cfp,
      distractor_explanations: fixed as RawQuestion['distractor_explanations'],
    })
  })
  return { valid, errors: errors.slice(0, 12) }
}

export const BASE_QUESTIONS: RawQuestion[] = validateQuestions(baseJson as unknown).valid
