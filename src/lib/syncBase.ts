import { isSnapshot, scopedKey, type AccountSnapshot } from './accountStorage'

// Internal reconciliation metadata, not an export or a user-accessible backup.
// One acknowledged cloud revision per account. Never use it to restore progress.
const key = (id: string) => scopedKey(id, 'sync-ancestor:v1')
export interface SyncBase { revision: number; snapshot: AccountSnapshot }
export function readSyncBase(id: string): SyncBase | null {
  try {
    const x = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as SyncBase | null
    return x && Number.isSafeInteger(x.revision) && x.revision >= 1 && isSnapshot(x.snapshot) ? x : null
  } catch { return null }
}
export function writeSyncBase(id: string, revision: number, snapshot: AccountSnapshot): void {
  try {
    if (revision < 1) localStorage.removeItem(key(id))
    else localStorage.setItem(key(id), JSON.stringify({ revision, snapshot }))
  } catch {
    // A stale base is worse than no base. If storage is full, keep ordinary local
    // progress intact and require a safe choice for an ambiguous later conflict.
    try { localStorage.removeItem(key(id)) } catch { /* storage unavailable */ }
  }
}
