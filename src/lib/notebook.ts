import type { StudyNote } from './learning'
import type { Question } from '../types/qbank'

export function listNotes(notes: Record<string, StudyNote>, byId: ReadonlyMap<string, Question>, query = '', system = '', pinnedOnly = false) {
  const needle = query.trim().toLowerCase()
  return Object.entries(notes).filter(([id, n]) => {
    if (!n || typeof n.text !== 'string' || !n.text.trim() || (pinnedOnly && !n.pinned)) return false
    const q = byId.get(id)
    if (system && (q?.system ?? 'Unavailable question') !== system) return false
    return !needle || `${q?.system ?? ''} ${q?.concept_name ?? ''} ${n.text} ${id}`.toLowerCase().includes(needle)
  }).sort((a,b) => Number(!!b[1].pinned) - Number(!!a[1].pinned) || b[1].updatedAt - a[1].updatedAt)
}

export function notesAsText(notes: Record<string, StudyNote>, byId: ReadonlyMap<string, Question>): string {
  return ['FirstPass — Personal notebook', ...listNotes(notes, byId).map(([id, note]) => {
    const q = byId.get(id)
    return `${note.pinned ? '[Pinned] ' : ''}${q?.system ?? 'Unavailable question'} — ${q?.concept_name ?? id}\nQuestion ID: ${id}\n${note.text}`
  })].join('\n\n---\n\n') + '\n'
}
