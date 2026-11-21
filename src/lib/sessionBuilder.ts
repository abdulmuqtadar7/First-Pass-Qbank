import type { CoverageMode, Progress, Question } from '../types/qbank'

/** Randomize the question queue, never the A-E options inside each question. */
export function fisherYates<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ')
}

/** For older imports without a concept_name, remove recognizable angle suffixes. */
export function conceptIdPrefix(id: string): string {
  const initial = id.trim().split(/::|[:/#]/, 1)[0]
  const withoutAngle = initial.replace(/[-_](?:angle|variant|diagnosis|pathophysiology|management|adverse[-_]?effect|[a-e]|v|q)[-_]?\d*$/i, '')
  // Preserve basic IDs like CV-001; CV-001-02 is a common angle-specific ID.
  const withoutOrdinal = withoutAngle.split(/[-_]/).length >= 3 ? withoutAngle.replace(/[-_]\d{1,2}$/, '') : withoutAngle
  return withoutOrdinal || initial
}

/** System scoping prevents equally named concepts in different systems from merging. */
export function conceptKey(q: Question): string {
  const name = typeof q.concept_name === 'string' ? q.concept_name.trim() : ''
  const identity = name ? `name:${normalize(name)}` : `id:${normalize(conceptIdPrefix(q.concept_id)) || q.id}`
  return `${normalize(q.system)}\u0000${identity}`
}

export function countConcepts(questions: readonly Question[]): number {
  return new Set(questions.map(conceptKey)).size
}

function candidateOrder(a: Question, b: Question, progress: Record<string, Progress>): number {
  const pa = progress[a.id]
  const pb = progress[b.id]
  // Respect Easy / Skip Similar without dropping a topic from complete coverage.
  const skipDifference = Number(pa?.status === 'skipped') - Number(pb?.status === 'skipped')
  if (skipDifference) return skipDifference

  // Fresh, unattempted angles take precedence; Tier 1 breaks those ties.
  const freshDifference = Number((pa?.attempts ?? 0) > 0) - Number((pb?.attempts ?? 0) > 0)
  if (freshDifference) return freshDifference
  const tierDifference = Number(String(a.tier).trim() !== '1') - Number(String(b.tier).trim() !== '1')
  if (tierDifference) return tierDifference

  const attemptsDifference = (pa?.attempts ?? 0) - (pb?.attempts ?? 0)
  if (attemptsDifference) return attemptsDifference
  // After every angle has been attempted, revisit the least recently seen.
  return (pa?.lastAt ?? 0) - (pb?.lastAt ?? 0)
}

/** Each system/unique concept contributes exactly one question in coverage mode. */
export function selectSessionQuestions(
  questions: readonly Question[],
  coverageMode: CoverageMode,
  progress: Record<string, Progress>,
): Question[] {
  if (coverageMode === 'all') return fisherYates(questions)

  const groups = new Map<string, Question[]>()
  for (const q of questions) {
    const key = conceptKey(q)
    const existing = groups.get(key)
    if (existing) existing.push(q)
    else groups.set(key, [q])
  }

  const representatives: Question[] = []
  for (const group of groups.values()) {
    // Shuffling before a stable sort randomizes genuine ties between angles.
    const ranked = fisherYates(group).sort((a, b) => candidateOrder(a, b, progress))
    representatives.push(ranked[0])
  }
  return fisherYates(representatives)
}

export function buildSystemSession(
  questions: readonly Question[],
  system: string,
  coverageMode: CoverageMode,
  progress: Record<string, Progress>,
): Question[] {
  const pool = questions.filter((q) => q.system.toLowerCase() === system.toLowerCase())
  return selectSessionQuestions(pool, coverageMode, progress)
}
