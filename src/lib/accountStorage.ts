import type { PersistedState, RawQuestion } from '../types/qbank'
import type { LearningState } from './learning'
import type { DoctorAvatar } from '../components/DoctorWalk'

// The original keys are deliberately never removed or rewritten during migration.
export const LEGACY_KEYS = {
  state: 'fp:state:v1',
  imported: 'fp:imported:v1',
  daily: 'fp:daily:v1',
  learning: 'fp:learning:v1',
  theme: 'ui_theme',
  avatar: 'ui_doctor_avatar',
} as const

export type AccountField = keyof typeof LEGACY_KEYS

export const scopedKey = (userId: string, key: string): string => `fp:account:${userId}:${key}`
export const fieldKey = (userId: string, field: AccountField): string => scopedKey(userId, LEGACY_KEYS[field])
export const pendingKey = (userId: string): string => scopedKey(userId, 'pending-cloud-sync:v1')

export interface AccountSnapshot {
  schema: 1
  state: PersistedState
  imported: RawQuestion[]
  daily: Record<string, number>
  learning: LearningState
  avatar: DoctorAvatar | null
}

export function emptySnapshot(): AccountSnapshot {
  return {
    schema: 1,
    state: { progress: {}, flagged: [], studyDates: [], theme: 'light' },
    imported: [], daily: {},
    learning: { schedule: {}, attempts: [], history: [], active: null, notes: {},
      flashcards: [], settings: { dailyGoal: 20, examDate: '' } },
    avatar: null,
  }
}

function parse(raw: string | null): unknown {
  try { return raw === null ? null : JSON.parse(raw) } catch { return null }
}

export function readSnapshot(userId?: string): AccountSnapshot {
  const get = (field: AccountField) => localStorage.getItem(userId ? fieldKey(userId, field) : LEGACY_KEYS[field])
  const fallback = emptySnapshot()
  const rawState = parse(get('state'))
  const rawLearning = parse(get('learning'))
  const rawImported = parse(get('imported'))
  const rawDaily = parse(get('daily'))
  const theme = get('theme')
  const avatar = get('avatar')
  const state = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
    ? { ...fallback.state, ...rawState as Partial<PersistedState> } : fallback.state
  const learning = rawLearning && typeof rawLearning === 'object' && !Array.isArray(rawLearning)
    ? { ...fallback.learning, ...rawLearning as Partial<LearningState> } : fallback.learning
  return {
    schema: 1,
    state: { ...state, theme: theme === 'dark' || theme === 'light' ? theme : state.theme },
    learning: { ...learning, settings: { ...fallback.learning.settings, ...learning.settings } },
    imported: Array.isArray(rawImported) ? rawImported as RawQuestion[] : [],
    daily: rawDaily && typeof rawDaily === 'object' && !Array.isArray(rawDaily)
      ? rawDaily as Record<string, number> : {},
    avatar: avatar === 'male' || avatar === 'female' ? avatar : null,
  }
}

export function isSnapshot(value: unknown): value is AccountSnapshot {
  if (!value || typeof value !== 'object') return false
  const x = value as Partial<AccountSnapshot>
  return x.schema === 1 && !!x.state && typeof x.state.progress === 'object' &&
    !!x.learning && Array.isArray(x.learning.attempts) && Array.isArray(x.imported) &&
    !!x.daily && typeof x.daily === 'object' && (x.avatar === null || x.avatar === 'male' || x.avatar === 'female')
}

export function hasAccountCache(userId: string): boolean {
  return localStorage.getItem(fieldKey(userId, 'state')) !== null
}

export function hasLegacyProgress(): boolean {
  const s = readSnapshot()
  return Object.keys(s.state.progress).length > 0 || s.state.flagged.length > 0 ||
    s.learning.attempts.length > 0 || s.learning.history.length > 0 ||
    Object.keys(s.learning.notes).length > 0 || s.learning.flashcards.length > 0 ||
    s.learning.active !== null || s.imported.length > 0 || Object.keys(s.daily).length > 0 ||
    s.avatar !== null
}

/** A completed import writes only namespaced keys. It never changes legacy progress. */
export function saveSnapshot(userId: string, snapshot: AccountSnapshot): void {
  const entries: [AccountField, string][] = [
    ['state', JSON.stringify(snapshot.state)],
    ['imported', JSON.stringify(snapshot.imported)],
    ['daily', JSON.stringify(snapshot.daily)],
    ['learning', JSON.stringify(snapshot.learning)],
    ['theme', snapshot.state.theme],
    ['avatar', snapshot.avatar ?? ''],
  ]
  for (const [field, value] of entries) localStorage.setItem(fieldKey(userId, field), value)
}

export function setPending(userId: string, pending: boolean): void {
  try { localStorage.setItem(pendingKey(userId), pending ? 'true' : 'false') } catch { /* Quota/private mode */ }
}

export function isPending(userId: string): boolean {
  return localStorage.getItem(pendingKey(userId)) === 'true'
}

export function downloadLegacyBackup(): void {
  const storage: Record<string, string | null> = {}
  for (const key of Object.values(LEGACY_KEYS)) storage[key] = localStorage.getItem(key)
  const json = JSON.stringify({ app: 'FirstPass Q-Bank', version: 2,
    source: 'browser progress before accounts', exportedAt: new Date().toISOString(), storage }, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `firstpass-original-progress-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
