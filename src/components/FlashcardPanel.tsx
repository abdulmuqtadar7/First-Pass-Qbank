import { useEffect, useMemo, useState } from 'react'
import { useLearning, type Flashcard } from '../lib/learning'
import { useStore } from '../lib/store'
import { cardDeck, cardStatus, cardTextValid, delayLabel, GENERATION_BATCH, MAX_BACK, MAX_DECK, MAX_FRONT, pearlCandidates, PERSONAL_DECK, reviewDelay, type FlashcardRating } from '../lib/flashcards'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import { NoteSyncStatus } from './NoteEditor'
import StudyCardReader from './StudyCardReader'

const ratings: FlashcardRating[] = ['again', 'hard', 'good', 'easy']
const field = 'w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent'

export default function FlashcardPanel() {
  const { flashcards, gradeFlashcard, generateFlashcards, createFlashcard, editFlashcard, deleteFlashcard } = useLearning()
  const { questions, byId } = useStore()
  const [now, setNow] = useState(Date.now)
  const [deck, setDeck] = useState('')
  const [generateSystem, setGenerateSystem] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'review' | 'library'>('review')
  const [revealed, setRevealed] = useState('')
  const [editing, setEditing] = useState<Flashcard | 'new' | null>(null)
  const [page, setPage] = useState(0)
  const [reader, setReader] = useState<string | null>(null)
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(t) }, [])
  const systems = useMemo(() => [...new Set(questions.map(q => q.system))].sort(), [questions])
  const decks = useMemo(() => [...new Set([...systems, PERSONAL_DECK, ...flashcards.map(c => cardDeck(c, byId))])].sort(), [systems, flashcards, byId])
  const filtered = useMemo(() => flashcards.filter(c => !deck || cardDeck(c, byId) === deck), [flashcards, deck, byId])
  const due = useMemo(() => filtered.filter(c => c.dueAt <= Math.max(now, Date.now())).sort((a,b) => Number(!a.reviews) - Number(!b.reviews) || a.dueAt - b.dueAt || a.id.localeCompare(b.id)), [filtered, now])
  const current = due[0]
  const candidateCount = useMemo(() => pearlCandidates(questions, flashcards, generateSystem).length, [questions, flashcards, generateSystem])
  const matching = useMemo(() => { const term = query.trim().toLowerCase(); return filtered.filter(c => !term || `${c.front} ${c.back} ${cardDeck(c, byId)}`.toLowerCase().includes(term)) }, [filtered, query, byId])
  const pages = Math.max(1, Math.ceil(matching.length / 25))
  const safePage = Math.min(page, pages - 1)
  function exportCards() {
    const csvCell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`
    const csv = ['Front,Back', ...flashcards.map(c => [c.front,c.back].map(csvCell).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'qb360-flashcards.csv'; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="space-y-4">
    <section className={`${card} space-y-4 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={label}>Active recall</p><h2 className="mt-1 text-xl font-semibold">Flashcard decks</h2><p className="mt-1 text-sm text-muted">Remember a concept before revealing the answer.</p></div><button onClick={() => setEditing('new')} className={btnPrimary}>Create flashcard</button></div>
      <label className="block space-y-1"><span className={label}>Study deck</span><select aria-label="Flashcard deck" value={deck} className={field} onChange={e => {setDeck(e.target.value);setRevealed('');setPage(0)}}><option value="">All decks</option>{decks.map(d => <option key={d}>{d}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([['Due now',due.length],['New',filtered.filter(c => cardStatus(c)==='New').length],['Learning',filtered.filter(c => cardStatus(c)==='Learning').length],['Mastered',filtered.filter(c => cardStatus(c)==='Mastered').length]] as const).map(([name,n]) => <div key={name} className="rounded-xl border border-line bg-sunken/40 p-3"><p className={label}>{name}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{n}</p></div>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2"><NoteSyncStatus/><button disabled={!flashcards.length} onClick={exportCards} className={btnGhost}>Export CSV</button></div>
    </section>
    <details className={`${card} p-4 sm:p-5`}>
      <summary className="cursor-pointer font-semibold text-accent">Create cards from high-yield pearls</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted">One representative card per missing concept, using existing question content. Add up to {GENERATION_BATCH} at a time. No AI generation.</p>
      <select aria-label="Generate cards for system" className={field} value={generateSystem} onChange={e => setGenerateSystem(e.target.value)}><option value="">All systems</option>{systems.map(s => <option key={s}>{s}</option>)}</select>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted">{candidateCount} missing concepts</span><button className={btnGhost} disabled={!candidateCount} onClick={() => {generateFlashcards(questions,generateSystem);setDeck(generateSystem);setView('review');setRevealed('');setNow(Date.now())}}>Generate {Math.min(GENERATION_BATCH,candidateCount)} cards</button></div>
    </div></details>
    <div className="flex gap-2 rounded-xl border border-line bg-sunken p-1.5">{(['review','library'] as const).map(v => <button key={v} aria-pressed={view===v} onClick={() => {setView(v);setRevealed('')}} className={`flex-1 rounded-lg p-2.5 text-sm font-semibold ${view===v?'bg-surface text-accent shadow-sm':'text-muted'}`}>{v==='review'?'Daily revision':'Card library'}</button>)}</div>
    {view==='review' ? current ? <section className={`${card} overflow-hidden`}>
      <div className="border-b border-line p-5 text-center"><p className={label}>{cardDeck(current,byId)} · {cardStatus(current)}</p><h3 className="mt-5 whitespace-pre-wrap break-words text-xl font-semibold">{current.front}</h3></div>
      <div className="space-y-4 p-5 text-center">{revealed===current.id ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{current.back}</p> : <button className={btnPrimary} onClick={() => setRevealed(current.id)}>Reveal answer</button>}</div>
      {revealed===current.id && <div className="grid grid-cols-2 gap-2 border-t border-line p-4 sm:grid-cols-4">{ratings.map(r => <button key={r} onClick={() => {gradeFlashcard(current.id,r);setRevealed('');setNow(Date.now())}} className="rounded-xl border border-line bg-sunken p-3 text-sm font-semibold capitalize hover:border-accent"><span className="block">{r}</span><span className="mt-1 block text-xs font-normal text-muted">{delayLabel(reviewDelay(current,r))}</span></button>)}</div>}
    </section> : <section className={`${card} space-y-2 p-8 text-center`}><h3 className="font-semibold">{filtered.length?'All caught up':'No flashcards in this deck'}</h3><p className="text-sm text-muted">{filtered.length?'Come back when your next card is due.':'Create a personal card or generate cards from high-yield pearls.'}</p>{filtered.length>0 && <p className="text-xs text-muted">Next review: {new Date(filtered.reduce((min,c)=>Math.min(min,c.dueAt),Infinity)).toLocaleString()}</p>}</section> : <section className={`${card} space-y-3 p-4 sm:p-5`}>
      <input className={field} aria-label="Search flashcards" placeholder="Search flashcards..." value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}}/>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{matching.length} cards · Page {safePage+1} of {pages}</p><button type="button" className={btnPrimary} disabled={!matching.length} onClick={()=>setReader(matching[0]?.id ?? null)}>Read flashcards</button></div>
      {!matching.length && <p className="py-5 text-center text-sm text-muted">No matching flashcards</p>}
      {matching.slice(safePage*25,safePage*25+25).map(c=><article key={c.id} className="space-y-2 rounded-xl border border-line p-3"><p className={label}>{cardDeck(c,byId)} · {cardStatus(c)}</p><button type="button" onClick={()=>setReader(c.id)} className="block w-full rounded-xl border border-line bg-sunken/40 p-4 text-left hover:border-accent"><span className="block line-clamp-3 whitespace-pre-wrap break-words text-sm font-semibold">{c.front}</span><span className="mt-3 block text-xs font-semibold text-accent">Open flashcard →</span></button><p className="text-xs text-muted">{c.reviews} reviews · {c.dueAt<=now?'Due now':`Due ${new Date(c.dueAt).toLocaleString()}`}</p><div className="flex gap-2"><button className={btnGhost} onClick={()=>setEditing(c)}>Edit</button><button className={`${btnGhost} text-bad`} onClick={()=>{if(window.confirm('Delete this flashcard and its review history?')){deleteFlashcard(c.id);setRevealed('')}}}>Delete</button></div></article>)}
      <div className="flex justify-between"><button className={btnGhost} disabled={safePage===0} onClick={()=>setPage(safePage-1)}>Previous</button><button className={btnGhost} disabled={safePage+1>=pages} onClick={()=>setPage(safePage+1)}>Next</button></div>
    </section>}
    {reader !== null && <StudyCardReader mode="flashcard" initialId={reader} cards={matching.map(c=>({id:c.id,category:cardDeck(c,byId),title:c.front,text:c.back}))} onClose={()=>setReader(null)}/>}
    {editing && <CardEditor key={editing==='new'?'new':editing.id} initial={editing==='new'?undefined:editing} initialDeck={editing==='new'?deck||PERSONAL_DECK:cardDeck(editing,byId)} decks={decks} onCancel={()=>setEditing(null)} onSave={(front,back,name)=>{if(editing==='new'){createFlashcard(front,back,name);setDeck(name);setView('library');setQuery('');setPage(0)}else editFlashcard(editing.id,front,back,name);setEditing(null);setRevealed('');setNow(Date.now())}}/>}
    <p className="text-xs leading-relaxed text-muted">Mastered means at least three consecutive Good or Easy reviews and an interval of at least 14 days. This is a review heuristic, not a validated measure of exam readiness. Review ratings do not change question-bank statistics.</p>
  </div>
}

function CardEditor({ initial,initialDeck,decks,onCancel,onSave }: {initial?:Flashcard;initialDeck:string;decks:string[];onCancel:()=>void;onSave:(front:string,back:string,deck:string)=>void}) {
  const [front,setFront]=useState(initial?.front??'')
  const [back,setBack]=useState(initial?.back??'')
  const [deck,setDeck]=useState(initialDeck)
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onCancel}><form role="dialog" aria-modal="true" aria-label={initial?'Edit flashcard':'Create flashcard'} className={`${card} max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto p-5`} onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();if(cardTextValid(front,back,deck))onSave(front,back,deck)}}><h2 className="text-lg font-semibold">{initial?'Edit flashcard':'Create flashcard'}</h2><label className="block space-y-1"><span className={label}>Deck name</span><input className={field} list="fp-deck-options" maxLength={MAX_DECK} value={deck} onChange={e=>setDeck(e.target.value)} required/><datalist id="fp-deck-options">{decks.map(d=><option key={d} value={d}/>)}</datalist></label><label className="block space-y-1"><span className={label}>Front / prompt</span><textarea className={field} rows={3} maxLength={MAX_FRONT} value={front} onChange={e=>setFront(e.target.value)} required/></label><label className="block space-y-1"><span className={label}>Back / answer</span><textarea className={field} rows={5} maxLength={MAX_BACK} value={back} onChange={e=>setBack(e.target.value)} required/></label>{initial&&<p className="text-xs text-muted">Editing preserves this card's review schedule.</p>}<div className="flex flex-wrap gap-2"><button type="submit" disabled={!cardTextValid(front,back,deck)} className={btnPrimary}>Save flashcard</button><button type="button" className={btnGhost} onClick={onCancel}>Cancel</button></div></form></div>
}
