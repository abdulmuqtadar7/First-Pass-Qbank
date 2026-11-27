import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useLearning } from '../lib/learning'
import { performanceInsights, type WindowDays } from '../lib/performance'
import { card, label } from '../lib/ui'

const pct = (n: number | null) => n === null ? '—' : `${n}%`
const count = (n: number) => n.toLocaleString()
function Metric({name,value,detail}:{name:string;value:string;detail:string}) {
  return <div className="min-w-0 rounded-2xl bg-sunken p-4"><p className={label}>{name}</p><p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p><p className="mt-1 text-[11px] leading-relaxed text-muted">{detail}</p></div>
}
function Bar({value}:{value:number|null}) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent" style={{width:`${value??0}%`}}/></div>
}
export default function PerformancePanel(){
  const {questions,state}=useStore(), {attempts,schedule,history}=useLearning()
  const [days,setDays]=useState<WindowDays>(30)
  const x=useMemo(()=>performanceInsights(questions,state.progress,schedule,attempts,history,days),[questions,state.progress,schedule,attempts,history,days])
  const delta=x.current.accuracy!==null && x.prior.accuracy!==null ? x.current.accuracy-x.prior.accuracy : null
  return <section className="space-y-4" aria-label="Advanced performance analytics">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className={label}>Advanced analytics</p><h2 className="mt-1 text-[23px] font-bold tracking-tight">Understand your performance.</h2></div><div className="flex gap-1 rounded-full border border-line bg-sunken p-1" role="group" aria-label="Analytics period">{([7,30,90] as const).map(d=><button key={d} type="button" aria-pressed={days===d} onClick={()=>setDays(d)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${days===d?'bg-surface text-ink shadow-sm':'text-muted'}`}>{d}D</button>)}</div></div>
    <div className={`${card} p-5 sm:p-6`}>
      <p className={label}>Practice trends · Last {days} days</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric name="Accuracy" value={pct(x.current.accuracy)} detail={delta===null?'No comparable previous period':`${delta>0?'+':''}${delta} percentage points vs prior ${days} days`}/>
        <Metric name="Attempts" value={count(x.current.total)} detail={`${count(x.current.unique)} distinct questions`}/>
        <Metric name="Active days" value={`${x.activeDays}/${days}`} detail="Days with recorded answers"/>
        <Metric name="Avg. seconds / Q" value={x.current.average===null?'—':String(x.current.average)} detail={`${count(x.current.timedCount)} timed observations`}/>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Daily accuracy</h3><span className="text-[11px] text-muted">0–100% · Blank = no answers</span></div>
      <div className="mt-3 flex h-32 items-end gap-px rounded-xl border border-line bg-sunken/40 p-2" role="img" aria-label={`Daily accuracy for last ${days} days; ${x.activeDays} active days`}>
        {x.trend.map(d=><div key={d.key} className="relative flex h-full min-w-0 flex-1 items-end" title={`${d.key}: ${pct(d.accuracy)}, ${d.correct}/${d.total} correct`}>{d.accuracy!==null&&<div className="w-full rounded-t-sm bg-accent/80" style={{height:`${Math.max(2,d.accuracy)}%`}}/>}</div>)}
      </div><div className="mt-2 flex justify-between text-[10px] text-muted"><span>{x.trend[0]?.key}</span><span>Today</span></div>
      {!x.current.total&&<p className="mt-3 text-xs text-muted">No recorded answer events in this period. Start a practice block to build a trend.</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">Includes repeated tutor and submitted exam answers, not review mode. Exam answers are dated at submission. Older activity may be unavailable; lifetime progress is separate.</p>
    </div>
    <div className={`${card} p-5 sm:p-6`}>
      <p className={label}>Study consistency</p><h3 className="mt-1 text-lg font-bold">12-week activity</h3>
      <div className="mt-4 flex gap-2"><div className="grid shrink-0 grid-rows-7 gap-1 text-[9px] text-muted" aria-hidden="true">{['M','T','W','T','F','S','S'].map((d,i)=><span key={i} className="flex items-center">{d}</span>)}</div><div className="grid flex-1 grid-flow-col grid-cols-12 grid-rows-7 gap-1" role="img" aria-label="Study activity heatmap, Monday to Sunday, last twelve calendar weeks">{x.heatmap.map((d,i)=><div key={i} title={d?`${d.key}: ${d.total} attempts`:'Future date'} className={`aspect-square max-h-7 rounded-sm ${!d?'bg-transparent':d.total===0?'bg-sunken border border-line':d.total<5?'bg-accent/25':d.total<15?'bg-accent/50':d.total<30?'bg-accent/75':'bg-accent'}`}/>)}</div></div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-[10px] text-muted"><span>Attempts / day:</span>{[['0','bg-sunken border border-line'],['1–4','bg-accent/25'],['5–14','bg-accent/50'],['15–29','bg-accent/75'],['30+','bg-accent']].map(([n,c])=><span key={n} className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded-sm ${c}`}/>{n}</span>)}</div>
    </div>
    <div className={`${card} p-5 sm:p-6`}><p className={label}>Preparation indicator · Current bank only</p><div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-lg font-bold">Exam readiness</h3><span className="text-3xl font-bold tabular-nums text-accent">{x.readiness===null?'Not enough data':`${x.readiness}/100`}</span></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><Metric name="Concept coverage" value={pct(x.coverage)} detail="40% of indicator · attempted concepts"/><Metric name="Concept mastery" value={pct(x.mastery)} detail="40% · demonstrated mastery"/><Metric name="Recent accuracy" value={pct(x.readinessAccuracy)} detail="20% · last 30 days, current bank"/></div>
      {x.readiness===null&&<p className="mt-3 text-xs text-muted">Requires 30 recent recorded answers across at least 10 concepts. Currently {x.readinessAttempts}/30 answers and {x.recentConceptCount}/10 concepts.</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">A heuristic study indicator, not a validated readiness score or pass probability. Repeated questions can raise accuracy; current bank coverage does not equal coverage of an entire exam syllabus.</p>
    </div>
    <div className={`${card} p-5 sm:p-6`}><p className={label}>Lifetime · Current question bank</p><h3 className="mt-1 text-lg font-bold">System performance</h3>
      <div className="mt-3 divide-y divide-line">{x.systems.map(s=><div key={s.name} className="space-y-2 py-4"><div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-semibold">{s.name}</span><span className="text-xs tabular-nums text-muted">{pct(s.accuracy)} accuracy · {count(s.attempts)} attempts</span></div><div className="grid grid-cols-2 gap-4"><div><p className="mb-1 text-[11px] text-muted">Coverage {s.covered}/{s.total}</p><Bar value={s.coverage}/></div><div><p className="mb-1 text-[11px] text-muted">Mastery {s.mastered}/{s.total}</p><Bar value={s.mastery}/></div></div><p className="text-[11px] text-muted">{s.weak} weak · {s.due} due for review</p></div>)}</div>
      {!x.systems.length&&<p className="mt-3 text-xs text-muted">No systems available.</p>}
    </div>
    <div className={`${card} p-5 sm:p-6`}><p className={label}>Exam pace · Last {days} days</p><h3 className="mt-1 text-lg font-bold">Time management</h3><div className="mt-4 grid grid-cols-2 gap-3"><Metric name="Tutor seconds / Q" value={x.tutor.average===null?'—':String(x.tutor.average)} detail={`${x.tutor.timedCount} recorded answers`}/><Metric name="Exam seconds / Q" value={x.timed.average===null?'—':String(x.timed.average)} detail={`${x.timed.timedCount} submitted answers`}/><Metric name="Exam block score" value={pct(x.exam.score)} detail={`${x.exam.blocks} completed blocks · unanswered count as incorrect`}/><Metric name="Exam completion" value={pct(x.exam.total?Math.round(x.exam.answered/x.exam.total*100):null)} detail={`${x.exam.answered}/${x.exam.total} questions answered`}/></div><p className="mt-3 text-[11px] text-muted">Timing uses recorded whole seconds; paused sessions and skipped questions may affect comparison. No fixed exam pace is assumed. Completed-block history retains up to 120 sessions.</p></div>
    <div className={`${card} p-5 sm:p-6`}><p className={label}>Next steps</p><h3 className="mt-1 text-lg font-bold">What to improve</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">{x.recommendations.map(r=><li key={r}>{r}</li>)}</ul></div>
  </section>
}
