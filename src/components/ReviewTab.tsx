import { ArrowRight, BookOpen, CalendarClock, Flag, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { getIcon } from '../lib/meta'
import { distractorOf, optionKeysOf } from '../lib/options'
import { weakQuestions } from '../lib/stats'
import { useStore } from '../lib/store'
import { dueConceptQuestions, useLearning } from '../lib/learning'
import { btnPrimary, card, label, tag } from '../lib/ui'
import type { SessionMode } from '../types/qbank'

export default function ReviewTab({ onStart }: { onStart: (ids: string[], title: string, mode?: SessionMode) => void }) {
  const { questions, state } = useStore()
  const { schedule } = useLearning()
  const [query, setQuery] = useState('')
  const { progress, flagged } = state

  const weak = useMemo(() => weakQuestions(questions, progress, flagged), [questions, progress, flagged])
  const due = useMemo(() => dueConceptQuestions(questions, schedule, progress), [questions, schedule, progress])
  const results = useMemo(() => {
    const s = query.trim().toLowerCase()
    if (!s) return []
    const num = s.replace(/^p\.?\s*/, '')
    const isNum = /^\d+$/.test(num)
    return questions.filter((q) => {
      if (isNum) {
        const n = Number(num)
        return q.correct_fa_page === n || optionKeysOf(q).some((k) => distractorOf(q, k).fa_page === n)
      }
      return [q.concept_name, q.concept_id, q.stem, q.correct_explanation, q.high_yield_pearl,
        q.option_A, q.option_B, q.option_C, q.option_D, q.option_E ?? ''].some((value) => value.toLowerCase().includes(s))
    })
  }, [query, questions])

  const missed = weak.filter((q) => progress[q.id]?.lastCorrect === false).length
  const hard = weak.filter((q) => progress[q.id]?.status === 'hard').length
  const flaggedCount = weak.filter((q) => flagged.includes(q.id)).length

  return (
    <div className="space-y-9">
      <header><p className={`${label} flex items-center gap-2`}><RotateCcw size={13} className="text-accent" /> Active recall / Review</p><h1 className="mt-2 font-display text-[38px] leading-tight tracking-[-.055em] sm:text-[49px]">Strengthen your weak spots<span className="text-accent">.</span></h1><p className="mt-1 text-[13px] text-muted">Turn missed questions into permanent knowledge.</p></header>

      <section className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-3 divide-x divide-line">
          <Metric name="Again / Hard" value={hard} /><Metric name="Missed" value={missed} /><Metric name="Bookmarked" value={flaggedCount} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-sunken/50 px-5 py-5 sm:px-6">
          <div><p className="text-[13px] font-semibold">Your personalized review queue</p><p className="mt-1 text-[11px] text-muted">Missed, flagged and hard concepts are grouped here automatically.</p></div>
          <button disabled={!weak.length} onClick={() => onStart(weak.map((q) => q.id), 'Weak drill', 'tutor')} className={btnPrimary}>Review {weak.length} questions <ArrowRight size={15} /></button>
        </div>
      </section>

      <section className={`${card} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><CalendarClock size={19}/></span><div><p className="text-[13px] font-semibold">Spaced repetition · Due today</p><p className="mt-1 text-xs text-muted">{due.length} concepts are ready for another recall session.</p></div></div>
        <button disabled={!due.length} onClick={() => onStart(due.map((q) => q.id), 'Spaced Review', 'tutor')} className={btnPrimary}>Review {due.length} due <ArrowRight size={14}/></button>
      </section>

      <section className="space-y-4">
        <div><p className={label}>Library search</p><h2 className="mt-1.5 text-[22px] font-bold tracking-[-.04em]">Find a concept</h2><p className="mt-1 text-[12px] text-muted">Search topics, question stems, answer explanations, or First Aid pages.</p></div>
        <div className="relative"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search concepts or page numbers…" className="surface-card h-13 w-full rounded-xl border border-line bg-surface pl-12 pr-12 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent/50" />{query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-sunken"><X size={15} /></button>}</div>

        <AnimatePresence mode="wait">
          {query.trim() ? <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3"><div className="flex items-center justify-between"><p className={label}>{results.length} matching questions</p><button disabled={!results.length} onClick={() => onStart(results.map((q) => q.id), `Search: ${query.trim()}`, 'tutor')} className="flex items-center gap-1 text-[12px] font-semibold text-accent disabled:opacity-40">Drill all matches <ArrowRight size={14} /></button></div><ul className={`${card} divide-y divide-line overflow-hidden`}>{results.slice(0, 40).map((q) => { const Icon = getIcon(q.system); return <li key={q.id}><button onClick={() => onStart([q.id], q.concept_name, 'tutor')} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/60"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/8 text-accent"><Icon size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{q.concept_name}</span><span className="mt-1 block truncate text-[11px] text-muted">{q.system} · {q.angle.replace(/_/g, ' ')} · Tier {q.tier}</span></span>{flagged.includes(q.id) && <Flag size={14} className="shrink-0 text-accent" fill="currentColor" />}<span className={tag}>p. {q.correct_fa_page}</span><ArrowRight size={15} className="text-muted" /></button></li> })}{results.length === 0 && <li className="p-9 text-center text-[13px] text-muted">No matching concepts found.</li>}</ul>{results.length > 40 && <p className="text-center text-[11px] text-muted">Showing the first 40 results. Refine your search for more.</p>}</motion.div>
          : <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} flex flex-col items-center justify-center gap-2 px-5 py-10 text-center`}><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent"><BookOpen size={20} /></span><p className="mt-2 text-[13px] font-semibold">Every concept at your fingertips</p><p className="max-w-sm text-[12px] leading-relaxed text-muted">Search your entire question collection — or use the review queue above to focus on the concepts that need another look.</p><Sparkles size={15} className="mt-1 text-accent/70" /></motion.div>}
        </AnimatePresence>
      </section>
    </div>
  )
}

function Metric({ name, value }: { name: string; value: number }) {
  return <div className="p-5 sm:p-7"><p className={label}>{name}</p><p className="mt-3 text-[33px] font-bold tracking-[-.055em] tabular-nums sm:text-[44px]">{value}</p></div>
}
