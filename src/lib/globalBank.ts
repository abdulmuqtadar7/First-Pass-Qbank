import { makeId, validateQuestions } from './data'
import { supabase } from './supabase'
import type { Question, RawQuestion } from '../types/qbank'

export interface BankEntry { key: string; question: RawQuestion }
export interface GlobalBank { revision: number; entries: BankEntry[] }
export const EMPTY_BANK: GlobalBank = { revision: 0, entries: [] }
export const MAX_BATCH = 2000

// Whitelist fields, reuse the existing validator, and reject text PostgreSQL cannot store.
export function cleanQuestion(input: unknown): RawQuestion {
  const { valid, errors, rejected } = validateQuestions([input])
  if (rejected || valid.length !== 1) throw new Error(errors.join('; ') || 'Invalid question')
  const q = valid[0]
  const clean: RawQuestion = {
    system: q.system, concept_id: q.concept_id, concept_name: q.concept_name,
    tier: q.tier, angle: q.angle, stem: q.stem,
    option_A: q.option_A, option_B: q.option_B, option_C: q.option_C, option_D: q.option_D,
    ...(q.option_E ? { option_E: q.option_E } : {}),
    correct_option: q.correct_option, correct_explanation: q.correct_explanation,
    correct_fa_page: q.correct_fa_page, distractor_explanations: q.distractor_explanations,
    high_yield_pearl: q.high_yield_pearl, ...(q.topic_overview ? { topic_overview: q.topic_overview } : {}),
  }
  if (typeof clean.tier !== 'string' && (typeof clean.tier !== 'number' || !Number.isFinite(clean.tier))) throw new Error('Invalid tier')
  const check = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v.includes('\u0000')) throw new Error('Text contains an unsupported NUL character. Remove it before publishing.')
      try { encodeURIComponent(v) } catch { throw new Error('Text contains invalid Unicode.') }
    } else if (v && typeof v === 'object') Object.values(v).forEach(check)
  }
  check(clean)
  if (new TextEncoder().encode(JSON.stringify(clean)).length > 100_000) throw new Error('Question exceeds 100 KB')
  return clean
}

export function makeEntry(q: RawQuestion, id = makeId(q)): BankEntry {
  const key = encodeURIComponent(id)
  if (key.length > 2048) throw new Error('Question ID is too long')
  return { key, question: cleanQuestion(q) }
}

export function mergeShared(base: RawQuestion[], entries: BankEntry[]): Question[] {
  const map = new Map<string, Question>()
  for (const q of base) { const id = makeId(q); if (!map.has(id)) map.set(id, { ...q, id }) }
  for (const e of entries) {
    const id = decodeURIComponent(e.key)
    map.set(id, { ...e.question, id })
  }
  return [...map.values()]
}

export async function readGlobalBank(): Promise<GlobalBank> {
  if (!supabase) throw new Error('Cloud is not configured')
  const { data, error } = await supabase.rpc('firstpass_global_bank_read').abortSignal(AbortSignal.timeout(30000))
  if (error) throw new Error(error.message)
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.entries)) throw new Error('Invalid shared bank response')
  const seen = new Set<string>()
  const entries: BankEntry[] = data.entries.map((e: BankEntry) => {
    if (typeof e?.key !== 'string' || !e.key || seen.has(e.key)) throw new Error('Invalid or duplicate shared question key')
    const id = decodeURIComponent(e.key)
    if (encodeURIComponent(id) !== e.key) throw new Error('Invalid shared question key')
    seen.add(e.key)
    return { key: e.key, question: cleanQuestion(e.question) }
  })
  return { revision: data.revision, entries }
}

export async function publishGlobalBank(revision: number, entries: BankEntry[]): Promise<number> {
  if (!supabase) throw new Error('Cloud is not configured')
  if (!entries.length || entries.length > MAX_BATCH) throw new Error(`Choose 1–${MAX_BATCH} questions per publication`)
  const { data, error } = await supabase.rpc('firstpass_global_bank_publish', { p_revision: revision, p_entries: entries })
  if (error) throw new Error(error.message)
  if (!Number.isSafeInteger(data) || data !== revision + 1) throw new Error('Could not confirm publication. Reload before trying again.')
  return data as number
}

export function prepareUpload(input: unknown, shared: Question[], drafts: BankEntry[]): { entries: BankEntry[]; duplicates: number } {
  const raw = Array.isArray(input) ? input : input && typeof input === 'object' && Array.isArray((input as { questions?: unknown }).questions) ? (input as { questions: unknown[] }).questions : null
  if (!raw?.length) throw new Error('Upload a nonempty question array or a JSON object with a questions array.')
  if (raw.length > MAX_BATCH) throw new Error(`Maximum ${MAX_BATCH} questions per upload.`)
  const seen = new Set<string>()
  for (const q of shared) { seen.add(encodeURIComponent(q.id)); seen.add(encodeURIComponent(makeId(q))) }
  for (const e of drafts) { seen.add(e.key); seen.add(encodeURIComponent(makeId(e.question))) }
  let duplicates = 0
  const entries: BankEntry[] = []
  raw.forEach((item, index) => {
    try {
      const question = cleanQuestion(item)
      const e = makeEntry(question)
      if (seen.has(e.key)) { duplicates++; return }
      seen.add(e.key); entries.push(e)
    } catch (err) { throw new Error(`Question ${index + 1}: ${err instanceof Error ? err.message : 'Invalid question'}`) }
  })
  return { entries, duplicates }
}
