export type DesktopDensity = 'compact' | 'comfortable' | 'spacious'

// Presentation preferences are intentionally local to this browser and account.
// They are not part of the learning snapshot or cloud revision protocol.
function key(userId: string, field: string) { return `firstpass_desktop_v1:${userId}:${field}` }
function read(userId: string, field: string) {
  try { return localStorage.getItem(key(userId, field)) } catch { return null }
}
export function readDesktopDensity(userId: string): DesktopDensity {
  const value = read(userId, 'density')
  return value === 'comfortable' || value === 'spacious' ? value : 'compact'
}
export function readDesktopSidebar(userId: string) { return read(userId, 'sidebar') === 'collapsed' }
export function writeDesktopPreference(userId: string, field: 'density' | 'sidebar', value: string) {
  try { localStorage.setItem(key(userId, field), value) } catch { /* browser storage unavailable */ }
}
