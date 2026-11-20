import type { OptionKey, Question, RawQuestion } from '../types/qbank'
import { OPTION_KEYS } from '../types/qbank'

export const SYSTEMS = [
  'Cardiovascular',
  'Neurology',
  'Psychiatry',
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

const ALIASES: Record<string, string> = {
  'behavioral science': 'Psychiatry',
  'behavioral sciences': 'Psychiatry',
  'behavioural science': 'Psychiatry',
  'behavioral science/psychiatry': 'Psychiatry',
  'psychiatry/behavioral science': 'Psychiatry',
  'psychiatry & behavioral science': 'Psychiatry',
  'psychiatry and behavioral science': 'Psychiatry',
  psych: 'Psychiatry',
  cardio: 'Cardiovascular',
  cardiology: 'Cardiovascular',
  neuro: 'Neurology',
  nephrology: 'Renal',
  'renal/urinary': 'Renal',
  pharm: 'Pharmacology',
  pulmonary: 'Respiratory',
  gastrointestinal: 'GI',
  gastroenterology: 'GI',
  'gi/nutrition': 'GI',
  endocrinology: 'Endocrine',
  'reproductive system': 'Reproductive',
  'heme/onc': 'Hematology/Oncology',
  hematology: 'Hematology/Oncology',
  'hematology & oncology': 'Hematology/Oncology',
  'hematology and oncology': 'Hematology/Oncology',
}

export function normalizeSystem(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  return ALIASES[k] ?? SYSTEMS.find((s) => s.toLowerCase() === k) ?? raw.trim()
}

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

export function validateQuestions(input: unknown): { valid: RawQuestion[]; errors: string[]; rejected: number } {
  const errors: string[] = []
  const valid: RawQuestion[] = []
  let rejected = 0
  let arr: unknown[] = []
  if (Array.isArray(input)) arr = input
  else if (input && typeof input === 'object' && Array.isArray((input as { questions?: unknown }).questions))
    arr = (input as { questions: unknown[] }).questions
  else return { valid, errors: ['File must be a JSON array of questions.'], rejected: 1 }

  arr.forEach((item, i) => {
    const o = item as Record<string, unknown>
    const tag = `#${i + 1}`
    const fail = (msg: string) => {
      rejected++
      errors.push(`${tag}: ${msg}`)
    }
    if (!o || typeof o !== 'object') return fail('not an object')
    for (const k of STR_KEYS) {
      if (typeof o[k] !== 'string' || !(o[k] as string).trim()) return fail(`missing "${k}"`)
    }
    const hasE = typeof o.option_E === 'string' && (o.option_E as string).trim().length > 0
    const co = o.correct_option
    const allowed: OptionKey[] = hasE ? OPTION_KEYS : OPTION_KEYS.filter((k) => k !== 'E')
    if (typeof co !== 'string' || !allowed.includes(co as OptionKey)) return fail('correct_option invalid for this option count')
    const cfp = Number(o.correct_fa_page)
    if (!Number.isFinite(cfp)) return fail('correct_fa_page invalid')
    const de = o.distractor_explanations as Record<string, { reason?: unknown; fa_page?: unknown }> | undefined
    if (!de) return fail('missing distractor_explanations')
    const fixed: Record<string, { reason: string; fa_page: number }> = {}
    for (const k of allowed) {
      const d = de[k]
      if (!d || typeof d.reason !== 'string' || !Number.isFinite(Number(d.fa_page)))
        return fail(`distractor_explanations.${k} invalid`)
      fixed[k] = { reason: d.reason, fa_page: Number(d.fa_page) }
    }
    const q = {
      ...(o as unknown as RawQuestion),
      system: normalizeSystem(o.system as string),
      tier: (o.tier as string | number) ?? '2',
      correct_fa_page: cfp,
      distractor_explanations: fixed as RawQuestion['distractor_explanations'],
    }
    if (!hasE) delete q.option_E
    valid.push(q)
  })
  return { valid, errors: errors.slice(0, 12), rejected }
}

export interface BundledFile {
  name: string
  count: number
  rejected: number
}

export const BUNDLED_FILES: BundledFile[] = []

const modules = import.meta.glob<unknown>('../data/*.json', { eager: true, import: 'default' })

function loadBundled(): RawQuestion[] {
  const seen = new Set<string>()
  const out: RawQuestion[] = []
  for (const path of Object.keys(modules).sort()) {
    const { valid, errors, rejected } = validateQuestions(modules[path])
    let added = 0
    for (const q of valid) {
      const id = makeId(q)
      if (!seen.has(id)) {
        seen.add(id)
        out.push(q)
        added++
      }
    }
    BUNDLED_FILES.push({ name: path.split('/').pop() ?? path, count: added, rejected })
    if (errors.length) console.warn(`[FirstPass] ${path}: ${rejected} rejected`, errors)
  }
  return out
}

export const BASE_QUESTIONS: RawQuestion[] = loadBundled()
