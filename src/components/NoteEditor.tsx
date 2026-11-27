import { useLearning } from '../lib/learning'
import { useCloudSync } from '../lib/cloudSync'
import { label } from '../lib/ui'
import type { Question } from '../types/qbank'

export function NoteSyncStatus() {
  const { status, retry } = useCloudSync()
  const message = status === 'saved' ? 'Saved to cloud' : status === 'conflict' ? 'Sync conflict — resolve before switching devices' : status === 'offline' ? 'Cloud sync paused — retry' : 'Saving to cloud…'
  return <button type="button" onClick={retry} disabled={status === 'conflict'} className={`text-left text-[11px] ${status === 'saved' ? 'text-good' : 'text-muted'}`} aria-live="polite">{message}</button>
}

export default function NoteEditor({ q }: { q: Question }) {
  const { notes, saveNote } = useLearning()
  return <div className="space-y-2">
    <label className={label} htmlFor={`fp-note-${q.id}`}>Your private note · {q.concept_name}</label>
    <textarea id={`fp-note-${q.id}`} value={notes[q.id]?.text ?? ''} onChange={e => saveNote(q.id, e.target.value)} rows={3} placeholder="What should your future self remember?" className="w-full resize-y rounded-xl border border-line bg-sunken/40 p-3 text-[13px] leading-relaxed outline-none focus:border-accent" />
    <NoteSyncStatus />
  </div>
}
