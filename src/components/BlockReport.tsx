import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, RotateCcw, Sparkles, Target } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { btnGhost, btnPrimary, card, label, tag } from '../lib/ui'
import type { Answer, OptionKey, Question, SessionMode } from '../types/qbank'

interface Props {
  questions: Question[]
  answers: Record<string, Answer>
  times: Record<string, number>
  mode: SessionMode
  elapsed: number
  isMock?: boolean
  onReview: (ids: string[], prefill: Record<string, OptionKey>) => void
  onRestart: () => void
  onExit: () => void
}

const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export default function BlockReport({ questions, answers, times, mode, elapsed, isMock, onReview, onRestart, onExit }: Props) {
  const rows = useMemo(() => questions.map((q) => ({ q, selected: answers[q.id]?.selected ?? null, seconds: times[q.id] ?? 0 })), [questions, answers, times])
  const answered = rows.filter((r) => r.selected !== null)
  const correct = rows.filter((r) => r.selected === r.q.correct_option)
  const denom = mode === 'exam' ? rows.length : answered.length
  const percent = denom ? Math.round(correct.length / denom * 100) : 0
  const totalTime = rows.reduce((sum, r) => sum + r.seconds, 0)
  const avg = isMock ? (answered.length ? Math.round(answered.reduce((sum,r)=>sum+r.seconds,0)/answered.length) : 0) : answered.length ? Math.round(totalTime / answered.length) : 0

  const concepts = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>()
    for (const r of rows) {
      if (mode !== 'exam' && r.selected === null) continue
      const current = map.get(r.q.concept_name) ?? { correct: 0, total: 0 }
      current.total++
      if (r.selected === r.q.correct_option) current.correct++
      map.set(r.q.concept_name, current)
    }
    return [...map.entries()].sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
  }, [rows, mode])

  const systems = useMemo(() => {
    const map = new Map<string, {correct:number; total:number; answered:number}>()
    for (const r of rows) { const name=r.q.system; const item=map.get(name)??{correct:0,total:0,answered:0}; item.total++; item.correct+=Number(r.selected===r.q.correct_option);item.answered+=Number(r.selected!==null);map.set(name,item) }
    return [...map.entries()].sort((a,b)=>a[1].correct/a[1].total-b[1].correct/b[1].total)
  }, [rows])
  const missed = rows.filter((r) => mode === 'exam' ? r.selected !== r.q.correct_option : r.selected !== null && r.selected !== r.q.correct_option)
  const prefill: Record<string, OptionKey> = {}
  for (const row of rows) if (row.selected) prefill[row.q.id] = row.selected
  const scoreTone = percent >= 70 ? 'text-good' : percent < 50 ? 'text-bad' : 'text-accent'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas text-ink">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-[max(2rem,env(safe-area-inset-top))] sm:px-6 sm:pt-12">
        <header className="flex items-center justify-between"><div><p className={label}>Session complete</p><h1 className="mt-2 text-[27px] font-bold tracking-[-.055em]">{isMock ? 'Your mock exam report' : 'Your session report'}<span className="text-accent">.</span></h1></div><button onClick={onExit} className={btnGhost}><ArrowLeft size={15} /> Back</button></header>

        <section className={`${card} relative overflow-hidden bg-[linear-gradient(135deg,var(--surface),var(--sunken))] p-7 sm:p-9`}>
          <div className="fine-grid pointer-events-none absolute -right-14 -top-10 h-60 w-60 opacity-30 [mask-image:radial-gradient(circle,black,transparent_75%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-6"><div><p className={`${label} flex items-center gap-2`}><Sparkles size={13} className="text-accent" /> Your result</p><p className={`mt-3 text-[78px] font-semibold leading-none tracking-[-.08em] tabular-nums ${scoreTone}`}>{percent}<span className="ml-1 text-[35px] font-normal">%</span></p><p className="mt-3 text-[12px] text-muted">{correct.length} of {denom} correct {mode === 'exam' ? `· ${rows.length - answered.length} unanswered` : ''}</p></div><span className="grid h-20 w-20 place-items-center rounded-3xl border border-accent/15 bg-accent/8 text-accent"><CheckCircle2 size={36} strokeWidth={1.5} /></span></div>
        </section>

        <div className="grid grid-cols-3 gap-3"><Metric Icon={Clock3} title={isMock ? "Avg / answered" : "Avg / Question"} value={`${avg}s`} /><Metric Icon={Clock3} title="Time used" value={fmt(elapsed)} /><Metric Icon={Target} title="Answered" value={`${answered.length}/${rows.length}`} /></div>

        {isMock && <section className={`${card} space-y-4 p-6`}><h2 className="text-lg font-bold">System performance</h2><p className="text-xs text-muted">Lowest-scoring systems first · unanswered questions count as incorrect.</p>{systems.map(([name,r])=><div key={name}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{name}</span><span>{r.correct}/{r.total} · {Math.round(100*r.correct/r.total)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent" style={{width:`${100*r.correct/r.total}%`}}/></div><p className="mt-1 text-xs text-muted">{r.answered} answered · {r.total-r.answered} unanswered</p></div>)}</section>}
        <section className={`${card} overflow-hidden`}><div className="border-b border-line px-6 py-5"><p className={label}>Knowledge map</p><h2 className="mt-1 text-[17px] font-bold tracking-tight">Concept accuracy</h2></div><ul className="divide-y divide-line px-6">{concepts.length === 0 && <li className="py-7 text-[13px] text-muted">No answers recorded yet.</li>}{concepts.map(([name, item]) => { const p = Math.round(item.correct / item.total * 100); return <li key={name} className="py-4"><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[13px] font-semibold">{name}</span><span className={tag}>{item.correct}/{item.total}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"><motion.div initial={{ width: 0 }} whileInView={{ width: `${p}%` }} viewport={{ once: true }} className={`h-full rounded-full ${p >= 70 ? 'bg-good' : p < 50 ? 'bg-bad' : 'bg-accent'}`} /></div></li> })}</ul></section>

        <div className="flex flex-col gap-2 sm:flex-row"><button disabled={!missed.length} onClick={() => onReview(missed.map((r) => r.q.id), prefill)} className={`${btnPrimary} flex-1`}>Review missed ({missed.length}) <ArrowRight size={15} /></button><button onClick={() => onReview(rows.map((r) => r.q.id), prefill)} className={`${btnGhost} flex-1`}>Review all</button><button onClick={onRestart} className={`${btnGhost} flex-1`}><RotateCcw size={15} /> New random session</button></div>
      </div>
    </div>
  )
}

function Metric({ Icon, title, value }: { Icon: typeof Clock3; title: string; value: string }) {
  return <div className={`${card} p-4 sm:p-5`}><div className="flex items-center gap-1.5 text-[10px] text-muted"><Icon size={13} /> {title}</div><p className="mt-3 text-[20px] font-bold tracking-tight tabular-nums sm:text-[24px]">{value}</p></div>
}
