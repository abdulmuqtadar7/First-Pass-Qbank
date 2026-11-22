import { BookOpen, BrainCircuit, Download, NotebookPen, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLearning } from '../lib/learning'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { Flashcard } from '../lib/learning'

export default function NotebookTab() {
  const { notes, saveNote, flashcards, gradeFlashcard } = useLearning()
  const { byId } = useStore()
  const [tab, setTab] = useState<'notes' | 'cards'>('notes')
  const [query, setQuery] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState('')
  const noteIds = useMemo(() => Object.entries(notes).filter(([id, n]) => n.text.trim() && byId.has(id))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt).map(([id]) => id), [notes, byId])
  const matchingNotes = noteIds.filter((id) => {
    const q = byId.get(id)
    return `${q?.concept_name} ${notes[id]?.text}`.toLowerCase().includes(query.toLowerCase())
  })
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
      <input aria-label="Search your notes" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved notes..." className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent" />
      {!matchingNotes.length && <div className={`${card} py-14 text-center`}><NotebookPen size={28} className="mx-auto mb-3 text-accent/70"/><p className="font-semibold">No notes yet</p><p className="mt-1 text-sm text-muted">Save a note from any question explanation.</p></div>}
      {matchingNotes.map((id) => {
        const q = byId.get(id)!
        return <article key={id} className={`${card} p-5`}><div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">{q.concept_name}</h2><span className="text-[11px] text-muted">{q.system}</span></div><textarea rows={3} aria-label={`Note for ${q.concept_name}`} value={notes[id].text} onChange={(e) => saveNote(id, e.target.value)} className="w-full resize-y rounded-lg border border-line bg-sunken/50 p-3 text-sm leading-relaxed outline-none focus:border-accent"/><p className="mt-2 text-[10px] text-muted">Changes save automatically.</p></article>
      })}
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
