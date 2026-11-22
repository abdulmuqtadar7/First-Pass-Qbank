import { BookOpen, CalendarClock, Clock3, History, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLearning } from '../lib/learning'
import { useStore } from '../lib/store'
import { btnGhost, card, label } from '../lib/ui'
import type { OptionKey } from '../types/qbank'

export default function HistoryTab({ onReview }: { onReview: (ids: string[], answers: Record<string, OptionKey>) => void }) {
  const { history } = useLearning()
  const { byId } = useStore()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => history.filter((h) => h.title.toLowerCase().includes(query.toLowerCase())), [history, query])

  function open(ids: string[], selections: Record<string, OptionKey | null>) {
    const prefill: Record<string, OptionKey> = {}
    for (const [id, selected] of Object.entries(selections)) if (selected) prefill[id] = selected
    onReview(ids.filter((id) => byId.has(id)), prefill)
  }

  return (
    <div className="space-y-6">
      <header>
        <p className={label}>Your practice archive</p>
        <h1 className="mt-2 font-display text-[39px] leading-tight tracking-[-.05em] sm:text-[50px]">Session history<span className="text-accent">.</span></h1>
        <p className="mt-2 text-sm text-muted">Every completed block stays available for review. Only sessions completed after this update appear here.</p>
      </header>
      <div className={`${card} grid grid-cols-3 divide-x divide-line overflow-hidden`}>
        <Stat name="Completed blocks" value={history.length} />
        <Stat name="Questions reviewed" value={history.reduce((sum, h) => sum + h.answered, 0)} />
        <Stat name="Average score" value={`${history.length ? Math.round(history.reduce((sum, h) => sum + h.correct / Math.max(h.mode === 'exam' ? h.ids.length : h.answered, 1), 0) / history.length * 100) : 0}%`} />
      </div>
      <input aria-label="Find previous sessions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search previous sessions..." className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent" />
      <div className="space-y-3">
        {!filtered.length && <div className={`${card} py-16 text-center`}><History size={32} className="mx-auto mb-3 text-accent/70"/><p className="font-semibold">No previous blocks yet</p><p className="mt-1 text-sm text-muted">Complete a session to create your first report.</p></div>}
        {filtered.map((h) => {
          const denominator = h.mode === 'exam' ? h.ids.length : h.answered
          const score = denominator ? Math.round(h.correct / denominator * 100) : 0
          return (
            <article key={h.id} className={`${card} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><BookOpen size={19}/></span>
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-bold">{h.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1"><CalendarClock size={12}/>{new Date(h.completedAt).toLocaleDateString()}</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={12}/>{Math.floor(h.elapsed / 60)} min</span>
                    <span>{h.mode === 'exam' ? 'Exam' : 'Tutor'} · {h.answered}/{h.ids.length} answered</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-5 sm:justify-end">
                <div className="text-right"><p className="text-2xl font-bold tabular-nums">{score}%</p><p className="text-[10px] text-muted">{h.correct} correct</p></div>
                <button onClick={() => open(h.ids, h.selections)} className={btnGhost}><RotateCcw size={14}/> Review</button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ name, value }: { name: string; value: number | string }) {
  return <div className="min-w-0 px-3 py-4 text-center sm:px-5"><p className="text-xl font-bold tabular-nums sm:text-2xl">{value}</p><p className="mt-1 text-[10px] text-muted sm:text-xs">{name}</p></div>
}
