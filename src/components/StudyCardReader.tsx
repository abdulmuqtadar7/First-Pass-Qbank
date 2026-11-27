import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLearning } from '../lib/learning'
import { localKey } from '../lib/revisionPlanner'
import { btnGhost, btnPrimary, label } from '../lib/ui'

export interface ReadingCard {
  id: string
  category: string
  title: string
  text: string
}

export default function StudyCardReader({ cards, initialId, mode, onClose }: {
  cards: ReadingCard[]; initialId: string; mode: 'note' | 'flashcard'; onClose: () => void
}) {
  const {markNoteRead,settings}=useLearning()
  const [selected, setSelected] = useState(initialId)
  const [revealed, setRevealed] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const index = Math.max(0, cards.findIndex(c => c.id === selected))
  const current = cards[index]
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    el.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { el.close(); document.body.style.overflow = previous }
  }, [])
  useEffect(() => { scroller.current?.scrollTo({top: 0}) }, [current?.id, revealed])
  function move(delta: number) {
    const next = cards[index + delta]
    if (!next) return
    setSelected(next.id)
    setRevealed(false)
  }
  const isFlashcard = mode === 'flashcard'
  return <dialog ref={dialog} aria-label={isFlashcard ? 'Flashcard reader' : 'Note reader'} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose() } }} onKeyDown={e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1) }
  }} className="m-auto max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-2xl overflow-hidden rounded-[26px] border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60">
    <div className="flex max-h-[90dvh] min-w-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4"><div><p className={label}>{isFlashcard ? 'Flashcard reader' : 'Personal note reader'}</p><p className="mt-1 text-sm font-semibold tabular-nums">{current ? `${index+1} of ${cards.length}` : 'No cards available'}</p></div><button autoFocus type="button" aria-label="Close reader" className={btnGhost} onClick={onClose}><X size={18}/></button></header>
      <div className="h-1 shrink-0 bg-sunken" aria-hidden="true"><div className="h-full bg-accent" style={{width: `${cards.length ? (index+1)/cards.length*100 : 0}%`}}/></div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        {current ? <article className="min-h-[230px] rounded-[22px] border border-line bg-sunken/40 p-5 sm:p-8">
          <p className={`${label} break-words`}>{current.category || 'Personal'}</p>
          <h2 className="mt-3 whitespace-pre-wrap break-words text-xl font-semibold leading-snug sm:text-2xl">{current.title}</h2>
          {isFlashcard && !revealed ? <div className="mt-8 flex justify-center"><button type="button" className={btnPrimary} onClick={()=>setRevealed(true)}>Reveal answer</button></div> : <div className="mt-5 border-t border-line pt-5"><p className="whitespace-pre-wrap break-words text-[16px] leading-[1.85] sm:text-[18px]">{current.text}</p>{isFlashcard && <button type="button" className={`${btnGhost} mt-6`} onClick={()=>setRevealed(false)}>Hide answer</button>}{!isFlashcard && <button type="button" className={`${btnGhost} mt-6`} disabled={settings.plannerActivity?.[localKey(new Date())]?.notes.includes(current.id)} onClick={()=>markNoteRead(current.id)}>{settings.plannerActivity?.[localKey(new Date())]?.notes.includes(current.id)?'Read today':'Mark read today'}</button>}</div>}
        </article> : <p className="p-6 text-center text-muted">There are no matching cards.</p>}
      </div>
      <footer className="shrink-0 space-y-3 border-t border-line p-4 sm:px-6"><div className="grid grid-cols-2 gap-3"><button type="button" className={btnGhost} disabled={!current || index===0} onClick={()=>move(-1)}><ChevronLeft size={17}/> Previous card</button><button type="button" className={btnPrimary} disabled={!current || index+1>=cards.length} onClick={()=>move(1)}>Next card <ChevronRight size={17}/></button></div><p className="text-center text-xs text-muted">{isFlashcard ? 'Read-only browsing · Review schedule is unchanged.' : 'Read-only browsing · Your saved notes are unchanged.'}</p></footer>
    </div>
  </dialog>
}
