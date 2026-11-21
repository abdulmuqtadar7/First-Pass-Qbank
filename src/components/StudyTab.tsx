import { ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, Flame, Layers3, Play, Plus, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { quickPick } from '../lib/blocks'
import { SYSTEMS } from '../lib/data'
import { getIcon } from '../lib/meta'
import { buildSystemSession, countConcepts } from '../lib/sessionBuilder'
import { computeStreak, conceptsMastered, summarize, weakQuestions } from '../lib/stats'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, iconBtn, label } from '../lib/ui'
import type { CoverageMode, SessionMode, SessionSource } from '../types/qbank'
import BlockBuilder from './BlockBuilder'
import CoverageSelector from './CoverageSelector'

interface Props {
  onStart: (ids: string[], title: string, mode?: SessionMode, source?: SessionSource) => void
}

export default function StudyTab({ onStart }: Props) {
  const { questions, state, todayCount, dailyGoal } = useStore()
  const [builder, setBuilder] = useState(false)
  const [launcher, setLauncher] = useState<string | null>(null)
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('core_concepts')
  const { progress } = state

  const overall = summarize(questions, progress)
  const mastered = conceptsMastered(questions, progress)
  const totalConcepts = useMemo(() => countConcepts(questions), [questions])
  const due = useMemo(() => weakQuestions(questions, progress, state.flagged).length, [questions, progress, state.flagged])
  const streak = computeStreak(state.studyDates)
  const goalPct = Math.min(100, Math.round((todayCount / dailyGoal) * 100))

  const systems = useMemo(() => {
    const names = [...SYSTEMS]
    for (const q of questions) if (!names.some((n) => n.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
    const all = names.map((name) => {
      const qs = questions.filter((q) => q.system.toLowerCase() === name.toLowerCase())
      const answered = qs.filter((q) => (progress[q.id]?.attempts ?? 0) > 0).length
      return { name, qs, answered, concepts: countConcepts(qs), sum: summarize(qs, progress) }
    })
    return [...all.filter((s) => s.qs.length > 0), ...all.filter((s) => s.qs.length === 0)]
  }, [questions, progress])

  const selected = systems.find((s) => s.name === launcher)
  useEffect(() => {
    if (!launcher) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLauncher(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [launcher])

  function launch(name: string) {
    const ids = buildSystemSession(questions, name, coverageMode, progress).map((q) => q.id)
    onStart(ids, name, 'tutor', { kind: 'system', system: name, coverageMode })
    setLauncher(null)
  }

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={`${label} flex items-center gap-2`}><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Your study desk</p>
          <h1 className="mt-2 text-[29px] font-bold tracking-[-.055em] sm:text-[36px]">Good to have you back<span className="text-accent">.</span></h1>
          <p className="mt-1 text-[13px] text-muted">Pick up where you left off. Every question is a step forward.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted shadow-sm"><Flame size={14} className="text-orange-500" /> {streak}-day streak</span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <section className={`${card} relative overflow-hidden bg-[linear-gradient(135deg,var(--surface),var(--sunken))] p-6 sm:p-8`}>
          <div className="fine-grid pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full opacity-35 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-accent"><Sparkles size={12} /> Ready when you are</div>
            <h2 className="mt-5 max-w-md text-[26px] font-bold leading-[1.13] tracking-[-.06em] sm:text-[34px]">Build real recall.<br/><span className="text-muted">One session at a time.</span></h2>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">Focused clinical questions, clean explanations and every First Aid concept — without the noise.</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button onClick={() => onStart(quickPick(questions, state, 10), 'Quick block', 'tutor')} disabled={!questions.length} className={btnPrimary}><Play size={15} fill="currentColor" /> Quick 10-question drill</button>
              <button onClick={() => setBuilder(true)} className={btnGhost}><Plus size={16} /> Custom block</button>
            </div>
          </div>
        </section>

        <section className={`${card} flex flex-col justify-between overflow-hidden p-6`}>
          <div>
            <div className="flex items-center justify-between"><p className={label}>Your momentum</p><span className="rounded-lg bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent">Today</span></div>
            <div className="mt-6 flex items-end gap-3">
              <span className="text-[58px] font-semibold leading-none tracking-[-.075em] tabular-nums">{todayCount}</span>
              <div className="pb-1.5 text-[12px] leading-5 text-muted">/ {dailyGoal} questions<br/>daily goal</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken"><motion.div initial={{ width: 0 }} animate={{ width: `${goalPct}%` }} className="h-full rounded-full bg-accent" /></div>
            <p className="mt-2 text-[11px] text-muted">{todayCount >= dailyGoal ? 'Daily goal complete. Outstanding work.' : `${Math.max(0, dailyGoal - todayCount)} more to reach your daily goal`}</p>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-5">
            <MiniMetric icon={<CheckCircle2 size={14} />} name="Readiness" value={`${overall.pct}%`} />
            <MiniMetric icon={<BookOpen size={14} />} name="Concepts" value={`${mastered}/${totalConcepts}`} />
            <MiniMetric icon={<Layers3 size={14} />} name="Review due" value={String(due)} />
          </div>
        </section>
      </div>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={label}>Question library</p>
            <h2 className="mt-1.5 text-[22px] font-bold tracking-[-.045em]">Explore systems</h2>
            <p className="mt-1 text-[12px] text-muted">Choose complete concept coverage or go deep with every clinical angle.</p>
          </div>
          <span className="rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-muted">{questions.length.toLocaleString()} total questions</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {systems.map(({ name, qs, answered, concepts, sum }) => {
            const Icon = getIcon(name)
            const available = qs.length > 0
            const answeredPct = available ? Math.round((answered / qs.length) * 100) : 0
            return (
              <motion.button key={name} whileHover={available ? { y: -3 } : undefined} whileTap={available ? { scale: 0.99 } : undefined} disabled={!available} onClick={() => setLauncher(name)} className={`${card} group relative min-h-[190px] overflow-hidden p-5 text-left transition-colors ${available ? 'hover:border-accent/30' : 'opacity-55'}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent/10 bg-accent/8 text-accent"><Icon size={21} strokeWidth={1.8} /></span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors group-hover:bg-sunken group-hover:text-accent">{available ? <ArrowUpRight size={17} /> : <Plus size={14} />}</span>
                </span>
                <span className="mt-4 block text-[15px] font-bold tracking-tight">{name}</span>
                <span className="mt-1.5 block text-[11px] text-muted">{available ? `${qs.length.toLocaleString()} Total Qs · ${concepts.toLocaleString()} Unique Concepts` : 'Coming soon'}</span>
                <span className="mt-5 flex items-center justify-between font-mono text-[10px] tabular-nums text-muted"><span>{available ? `${answered} studied` : 'No questions yet'}</span><span>{available ? `${sum.pct}% mastered` : ''}</span></span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sunken"><motion.span initial={false} animate={{ width: `${answeredPct}%` }} className="block h-full rounded-full bg-accent" /></span>
              </motion.button>
            )
          })}
        </div>
      </section>

      <AnimatePresence>
        {selected && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0 bg-[#0b0d11]/65 backdrop-blur-[5px]" onClick={() => setLauncher(null)} />
            <motion.div role="dialog" aria-modal="true" aria-label={`${selected.name} practice setup`} initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} className="surface-float relative z-10 w-full max-w-xl overflow-hidden rounded-t-3xl border border-line bg-surface sm:rounded-3xl">
              <div className="flex items-start justify-between border-b border-line px-6 py-5">
                <div><p className={label}>System deck / Practice setup</p><h2 className="mt-2 text-[23px] font-bold tracking-[-.05em]">{selected.name}</h2><p className="mt-1 text-xs text-muted">Every session starts with a fresh random queue.</p></div>
                <button onClick={() => setLauncher(null)} aria-label="Close practice setup" className={`${iconBtn} border border-line bg-sunken`}><X size={17} /></button>
              </div>
              <div className="space-y-5 p-6">
                <CoverageSelector value={coverageMode} onChange={setCoverageMode} total={selected.qs.length} concepts={selected.concepts} />
                <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sunken/55 p-3 text-[11px] leading-relaxed text-muted"><Sparkles size={16} className="mt-0.5 shrink-0 text-accent" /> Unanswered angles are prioritized, followed by high-yield Tier 1 questions. Answer options remain in A–E order.</div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line bg-sunken/40 px-6 py-4">
                <span className="font-mono text-[11px] tabular-nums text-muted">{(coverageMode === 'core_concepts' ? selected.concepts : selected.qs.length).toLocaleString()} questions queued</span>
                <button onClick={() => launch(selected.name)} className={btnPrimary}>Start studying <ArrowRight size={16} /></button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BlockBuilder open={builder} onClose={() => setBuilder(false)} onStart={onStart} />
    </div>
  )
}

function MiniMetric({ icon, name, value }: { icon: ReactNode; name: string; value: string }) {
  return <div className="min-w-0"><div className="flex items-center gap-1.5 text-muted">{icon}<span className="truncate text-[10px]">{name}</span></div><p className="mt-2 truncate text-[17px] font-bold tracking-tight tabular-nums">{value}</p></div>
}
