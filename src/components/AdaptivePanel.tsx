import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useLearning } from '../lib/learning'
import { adaptiveQueue, analyzeConcepts, masteryCounts, studyPlan, type Mastery } from '../lib/adaptive'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { AdaptiveMode, SessionMode, SessionSource } from '../types/qbank'

const STATES: { key: Mastery; title: string; color: string }[] = [
  { key: 'mastered', title: 'Mastered', color: 'bg-good' },
  { key: 'learning', title: 'Learning', color: 'bg-accent' },
  { key: 'weak', title: 'Weak', color: 'bg-bad' },
  { key: 'untouched', title: 'Untouched', color: 'bg-muted/35' },
]

export default function AdaptivePanel({ onStart }: { onStart?: (ids: string[], title: string, mode?: SessionMode, source?: SessionSource) => void }) {
  const { questions, state, todayCount } = useStore()
  const { schedule, attempts, settings, setSettings } = useLearning()
  const [now, setNow] = useState(Date.now)
  const [showRules, setShowRules] = useState(false)
  const [showConcepts, setShowConcepts] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const concepts = useMemo(() => analyzeConcepts(questions, state.progress, schedule, attempts, now), [questions, state.progress, schedule, attempts, now])
  const counts = masteryCounts(concepts)
  const plan = studyPlan(counts, settings.dailyGoal, todayCount, settings.examDate, now)
  const bySystem = useMemo(() => {
    const groups = new Map<string, typeof concepts>()
    for (const c of concepts) { const list = groups.get(c.system) ?? []; list.push(c); groups.set(c.system, list) }
    return [...groups].map(([system, list]) => ({ system, total: list.length, counts: masteryCounts(list) }))
  }, [concepts])
  function launch(mode: AdaptiveMode, size: number) {
    const ids = adaptiveQueue(concepts, state.progress, mode, size)
    const title = mode === 'daily' ? 'Daily adaptive practice' : mode === 'review' ? 'Smart spaced review' : 'Weak concept practice'
    if (ids.length) onStart?.(ids, title, 'tutor', { kind: 'adaptive', mode, size })
  }
  return <section className={`${card} space-y-5 p-5 sm:p-7`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={label}>Adaptive learning</p><h2 className="mt-1 font-display text-[27px] font-bold tracking-tight">{onStart ? 'Your smart study plan' : 'Concept mastery'}</h2><p className="mt-1 text-xs text-muted">Based on actual recall, not just questions marked Easy.</p></div><button className={btnGhost} onClick={() => setShowRules(v => !v)}>{showRules ? 'Hide criteria' : 'How it works'}</button></div>
    {showRules && <div className="rounded-xl border border-line bg-sunken p-4 text-xs leading-6 text-muted">Untouched: no recorded attempt. Weak: most recent answer incorrect or marked Again. Mastered: latest answer correct, at least 80% lifetime accuracy and correct latest answers on at least two distinct questions (single-question topics need correct attempts on two recorded dates). Other attempted concepts are Learning. Due dates are separate from mastery. These are study estimates, not a validated exam-readiness score.</div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{STATES.map(s => <div key={s.key} className="rounded-xl bg-sunken p-4"><p className="flex items-center gap-2 text-xs text-muted"><span className={`h-2 w-2 rounded-full ${s.color}`} />{s.title}</p><p className="mt-2 text-2xl font-bold tabular-nums">{counts[s.key].toLocaleString()}</p></div>)}</div>
    <div className="flex h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={STATES.map(s => `${s.title}: ${counts[s.key]}`).join(', ')}>{STATES.map(s => <span key={s.key} className={s.color} style={{ width: `${concepts.length ? counts[s.key] / concepts.length * 100 : 0}%` }} />)}</div>
    {onStart && <>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line p-4"><p className={label}>Due for recall</p><p className="mt-2 text-2xl font-bold tabular-nums">{counts.due}</p><p className="text-xs text-muted">Scheduled concepts</p></div><div className="rounded-xl border border-line p-4"><p className={label}>Today's target</p><p className="mt-2 text-2xl font-bold tabular-nums">{todayCount} / {plan.target}</p><p className="text-xs text-muted">Recorded attempts</p></div><div className="rounded-xl border border-line p-4"><p className={label}>Next block</p><p className="mt-2 text-2xl font-bold tabular-nums">{plan.blockSize}</p><p className="text-xs text-muted">One question per concept</p></div></div>
      <div className="flex flex-wrap items-end gap-4"><label className="flex flex-col gap-1 text-xs text-muted">Daily goal<input className="w-24 rounded-lg border border-line bg-surface p-2 text-ink" type="number" min={1} max={500} value={settings.dailyGoal} onChange={e => setSettings({dailyGoal: Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1)))})}/></label><label className="flex flex-col gap-1 text-xs text-muted">Exam date (optional)<input className="rounded-lg border border-line bg-surface p-2 text-ink" type="date" value={settings.examDate} onChange={e => setSettings({examDate:e.target.value})}/></label><p className="max-w-md text-xs leading-5 text-muted">{plan.newPerDay === null ? 'Set an exam date to estimate your first-pass coverage pace.' : `Aim for about ${plan.newPerDay} new concepts per day across ${plan.days} study days, plus due reviews. This is a coverage estimate, not a guarantee of exam readiness.`}</p></div>
      <div className="flex flex-wrap gap-2"><button className={btnPrimary} disabled={!plan.blockSize} onClick={() => launch('daily', plan.blockSize)}>Start daily practice ({plan.blockSize})</button><button className={btnGhost} disabled={!counts.due} onClick={() => launch('review', 40)}>Review due ({Math.min(40, counts.due)})</button><button className={btnGhost} disabled={!counts.weak} onClick={() => launch('weak', 40)}>Focus weak ({Math.min(40, counts.weak)})</button></div>
      <p className="text-xs text-muted">{plan.remaining === 0 ? 'Daily target reached. You can still review due or weak concepts.' : !plan.blockSize ? 'No new or due concepts right now. Use Focus weak or your regular study modes for extra practice.' : 'Due concepts come first, then untouched concepts. Blocks are capped at 40 questions.'}</p>
    </>}
    <div className="space-y-3"><p className={label}>Mastery by system</p>{bySystem.map(s => <div key={s.system} className="space-y-1"><div className="flex justify-between gap-2 text-xs"><span className="font-semibold">{s.system}</span><span className="text-muted">{s.counts.mastered} / {s.total} mastered · {s.counts.due} due</span></div><div className="flex h-1.5 overflow-hidden rounded-full bg-sunken">{STATES.map(x => <span key={x.key} className={x.color} style={{width:`${s.counts[x.key]/s.total*100}%`}} />)}</div></div>)}</div>
    <button className={btnGhost} onClick={() => setShowConcepts(v => !v)}>{showConcepts ? 'Hide concept details' : 'View weak and due concepts'}</button>
    {showConcepts && <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">{concepts.filter(c => c.due || c.status === 'weak').sort((a,b) => Number(b.due)-Number(a.due) || (a.dueAt ?? Infinity)-(b.dueAt ?? Infinity)).map(c => <div className="flex justify-between gap-3 p-3 text-xs" key={c.key}><span><span className="block font-semibold">{c.name}</span><span className="text-muted">{c.system}</span></span><span className="text-right text-muted">{c.status} · {c.due ? 'Due now' : c.dueAt ? new Date(c.dueAt).toLocaleDateString() : 'Not scheduled'}<br/>{Math.round(c.accuracy*100)}% correct</span></div>)}{!counts.due && !counts.weak && <p className="p-4 text-xs text-muted">No weak or due concepts yet.</p>}</div>}
  </section>
}
