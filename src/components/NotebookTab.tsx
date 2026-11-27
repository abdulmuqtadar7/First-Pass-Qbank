import { BookOpen, BrainCircuit, Download, NotebookPen, RotateCcw, Pin, Trash2, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLearning } from '../lib/learning'
import { listNotes, notesAsText } from '../lib/notebook'
import { optionKeysOf, optionText } from '../lib/options'
import { NoteSyncStatus } from './NoteEditor'
import type { Question } from '../types/qbank'
import type { StudyNote } from '../lib/learning'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { Flashcard } from '../lib/learning'

export default function NotebookTab() {
  const { notes, saveNote, deleteNote, toggleNotePin, flashcards, gradeFlashcard } = useLearning()
  const { byId } = useStore()
  const [tab, setTab] = useState<'notes' | 'cards'>('notes')
  const [query, setQuery] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState('')
  const [system, setSystem] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const allNotes = useMemo(() => listNotes(notes, byId), [notes, byId])
  const systems = useMemo(() => [...new Set(allNotes.map(([id]) => byId.get(id)?.system ?? 'Unavailable question'))].sort(), [allNotes, byId])
  const matchingNotes = useMemo(() => listNotes(notes, byId, query, system, pinnedOnly), [notes, byId, query, system, pinnedOnly])
  function exportNotes() {
    const url = URL.createObjectURL(new Blob([notesAsText(notes, byId)], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'firstpass-personal-notes.txt'
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const due = flashcards.filter((c) => c.dueAt <= Date.now())
  const cardToStudy: Flashcard | undefined = due.find((c) => c.id === selected) ?? due[0]

  function grade(k: 'hard' | 'good' | 'easy') {
    if (!cardToStudy) return
    gradeFlashcard(cardToStudy.id, k)
    setSelected('')
    setRevealed(false)
  }

  function exportCards() {
    const csv = ['Front,Back', ...flashcards.map((c) => [c.front, c.back].map((value) => `"${value.replace(/"/g, '""')}"`).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'firstpass-flashcards.csv'
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="space-y-6">
    <header><p className={label}>Make knowledge stick</p><h1 className="mt-2 font-display text-[39px] leading-tight tracking-[-.05em] sm:text-[50px]">Your notebook<span className="text-accent">.</span></h1><p className="mt-2 text-sm text-muted">Save concise notes and convert explanations into review cards as you study.</p></header>
    <div className="flex gap-2 rounded-xl border border-line bg-sunken p-1.5">
      {([['notes','Notes',NotebookPen],['cards','Flashcards',BrainCircuit]] as const).map(([id, name, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${tab === id ? 'bg-surface text-accent shadow-sm' : 'text-muted'}`}><Icon size={15}/>{name}</button>)}
    </div>
    {tab === 'notes' ? <>
      <section className={`${card} space-y-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{allNotes.length} saved notes · {allNotes.filter(([, n]) => n.pinned).length} pinned</p><button type="button" onClick={exportNotes} disabled={!allNotes.length} className={btnGhost}><Download size={14}/> Export all notes</button></div>
        <input aria-label="Search your notes" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes, systems or concepts..." className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent" />
        <div className="flex flex-wrap items-center gap-3"><select aria-label="Filter by system" value={system} onChange={e => setSystem(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"><option value="">All systems</option>{systems.map(name => <option key={name} value={name}>{name}</option>)}</select><button type="button" aria-pressed={pinnedOnly} onClick={() => setPinnedOnly(v => !v)} className={`${btnGhost} ${pinnedOnly ? 'border-accent text-accent' : ''}`}><Pin size={14}/> Pinned only</button></div>
        <NoteSyncStatus />
      </section>
      {!matchingNotes.length && <div className={`${card} py-14 text-center`}><NotebookPen size={28} className="mx-auto mb-3 text-accent/70"/><p className="font-semibold">{allNotes.length ? 'No matching notes' : 'No notes yet'}</p><p className="mt-1 text-sm text-muted">{allNotes.length ? 'Try another search or reset your filters.' : 'Save a personal note while studying any question.'}</p>{allNotes.length > 0 && <button className={`${btnGhost} mt-4`} onClick={() => { setQuery(''); setSystem(''); setPinnedOnly(false) }}>Clear filters</button>}</div>}
      {matchingNotes.map(([id, note]) => <NotebookEntry key={id} id={id} note={note} q={byId.get(id)} onSave={saveNote} onDelete={deleteNote} onPin={toggleNotePin} />)}
    </> : <>
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}><p className="text-sm text-muted"><span className="font-bold text-ink">{due.length}</span> cards due · {flashcards.length} created</p><button onClick={exportCards} disabled={!flashcards.length} className={btnGhost}><Download size={14}/> Export CSV</button></div>
      {!cardToStudy ? <div className={`${card} py-14 text-center`}><BookOpen size={29} className="mx-auto mb-3 text-accent/70"/><p className="font-semibold">All caught up</p><p className="mt-1 text-sm text-muted">Create a card from an explanation, or come back when a card is due.</p></div> : <div className={`${card} overflow-hidden`}>
        <div className="border-b border-line p-5"><p className={label}>Recall this concept</p><h2 className="mt-5 text-center text-[24px] font-bold tracking-tight">{cardToStudy.front}</h2></div>
        <div className="p-6 text-center">
          {revealed ? <p className="mx-auto max-w-xl whitespace-pre-line text-[15px] leading-relaxed">{cardToStudy.back}</p> : <button onClick={() => setRevealed(true)} className={btnPrimary}>Reveal answer <RotateCcw size={14}/></button>}
        </div>
        {revealed && <div className="grid grid-cols-3 gap-2 border-t border-line p-4">{(['hard','good','easy'] as const).map((rating) => <button key={rating} onClick={() => grade(rating)} className="rounded-lg border border-line bg-sunken px-2 py-3 text-sm font-semibold capitalize transition-colors hover:border-accent hover:text-accent">{rating === 'hard' ? 'Again' : rating}</button>)}</div>}
      </div>}
    </>}
  </div>
}

function NotebookEntry({ id, note, q, onSave, onDelete, onPin }: {
  id: string; note: StudyNote; q?: Question; onSave: (id: string, text: string) => void; onDelete: (id: string) => void; onPin: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  return <article className={`${card} space-y-3 p-5`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className={label}>{q?.system ?? 'Unavailable question'}</p><h2 className="mt-1 break-words font-semibold">{q?.concept_name ?? id}</h2></div><button type="button" onClick={() => onPin(id)} aria-pressed={!!note.pinned} className={`${btnGhost} ${note.pinned ? 'text-accent' : ''}`}><Pin size={14}/>{note.pinned ? 'Pinned' : 'Pin'}</button></div>
    {editing ? <><textarea aria-label="Edit personal note" rows={5} value={draft} onChange={e => setDraft(e.target.value)} className="w-full resize-y rounded-xl border border-line bg-sunken/50 p-3 text-sm outline-none focus:border-accent"/><div className="flex flex-wrap gap-2"><button type="button" className={btnPrimary} disabled={!draft.trim()} onClick={() => { onSave(id, draft); setEditing(false) }}>Save changes</button><button type="button" className={btnGhost} onClick={() => setEditing(false)}>Cancel</button></div></> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.text}</p>}
    <div className="flex flex-wrap items-center gap-2"><button type="button" className={btnGhost} disabled={editing} onClick={() => { setDraft(note.text); setEditing(true) }}><Pencil size={14}/> Edit</button><button type="button" className={`${btnGhost} text-bad`} onClick={() => { if (window.confirm('Delete this personal note? Your question progress will remain unchanged.')) onDelete(id) }}><Trash2 size={14}/> Delete</button></div>
    {q ? <details className="rounded-xl border border-line bg-sunken/40 p-3"><summary className="cursor-pointer text-sm font-semibold text-accent">View original question</summary><div className="mt-4 space-y-3 text-sm leading-relaxed"><p className="whitespace-pre-wrap">{q.stem}</p><ul className="space-y-2">{optionKeysOf(q).map(k => <li key={k} className={k === q.correct_option ? 'font-semibold text-good' : 'text-muted'}>{k}. {optionText(q,k)} {k === q.correct_option && '✓'}</li>)}</ul><p className="whitespace-pre-wrap">{q.correct_explanation}</p><p className="text-xs text-muted">Read-only review · Does not affect your progress or saved session.</p></div></details> : <p className="text-xs text-muted">The original question is not currently available. Your note is still preserved.</p>}
  </article>
}
