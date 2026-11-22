import { ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight, Flame, Layers3, Play, Plus, RotateCcw, Sparkles, Target, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { quickPick } from '../lib/blocks'
import { SYSTEMS } from '../lib/data'
import { dueConceptQuestions, useLearning } from '../lib/learning'
import { getIcon } from '../lib/meta'
import { buildSystemSession, countConcepts } from '../lib/sessionBuilder'
import { computeStreak, conceptsMastered, summarize, weakQuestions } from '../lib/stats'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { CoverageMode, SessionMode, SessionSource } from '../types/qbank'
import BlockBuilder from './BlockBuilder'
import CoverageSelector from './CoverageSelector'
import { DoctorWalk, type DoctorAvatar } from './DoctorWalk'

interface Props {
  onStart: (ids: string[], title: string, mode?: SessionMode, source?: SessionSource) => void
  onResume: () => void
  hasSavedSession: boolean
  avatar: DoctorAvatar
  variant?: 'home' | 'practice'
}

export default function StudyTab({ onStart, onResume, hasSavedSession, avatar, variant = 'home' }: Props) {
  const { questions, state, todayCount } = useStore()
  const { schedule, settings } = useLearning()
  const { progress } = state
  const [builder, setBuilder] = useState(false)
  const [launcher, setLauncher] = useState<string | null>(null)
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('core_concepts')
  const totalConcepts = useMemo(() => countConcepts(questions), [questions])
  const mastered = useMemo(() => conceptsMastered(questions, progress), [questions, progress])
  const streak = computeStreak(state.studyDates)
  const goal = Math.max(1, settings.dailyGoal)
  const goalPct = Math.min(100, Math.round((todayCount / goal) * 100))
  const due = useMemo(() => new Set([...dueConceptQuestions(questions, schedule, progress), ...weakQuestions(questions, progress, state.flagged)].map((q) => q.id)).size, [questions, schedule, progress, state.flagged])

  const systems = useMemo(() => {
    const names = [...SYSTEMS]
    for (const q of questions) if (!names.some((name) => name.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
    return names.map((name) => {
      const qs = questions.filter((q) => q.system.toLowerCase() === name.toLowerCase())
      const answered = qs.filter((q) => (progress[q.id]?.attempts ?? 0) > 0).length
      const mostRecent = Math.max(0, ...qs.map((q) => progress[q.id]?.lastAt ?? 0))
      return { name, qs, answered, concepts: countConcepts(qs), mostRecent, sum: summarize(qs, progress) }
    }).sort((a, b) => Number(!!b.qs.length) - Number(!!a.qs.length))
  }, [questions, progress])

  const featured = useMemo(() => [...systems].filter((s) => s.qs.length).sort((a, b) => b.mostRecent - a.mostRecent)[0], [systems])
  const selected = systems.find((s) => s.name === launcher)

  useEffect(() => {
    if (!launcher) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLauncher(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [launcher])

  function openSystem(name: string, mode: CoverageMode = coverageMode) {
    setCoverageMode(mode)
    setLauncher(name)
  }

  function startSystem(name: string) {
    const ids = buildSystemSession(questions, name, coverageMode, progress).map((q) => q.id)
    onStart(ids, name, 'tutor', { kind: 'system', system: name, coverageMode })
    setLauncher(null)
  }

  const systemDeck = (
    <section className="space-y-5" id="system-deck">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[.24em] text-accent">Your clinical library</p><h2 className="mt-2 font-display text-[34px] leading-none tracking-[-.055em] sm:text-[42px]">Explore systems<span className="text-accent">.</span></h2><p className="mt-2 text-[13px] text-muted">Every system. Every unique First Aid concept. Your pace.</p></div>
        <span className="rounded-full border border-line bg-surface px-4 py-2 text-[11px] font-semibold text-muted shadow-sm">{questions.length.toLocaleString()} total questions · {totalConcepts.toLocaleString()} concepts</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {systems.map(({ name, qs, answered, concepts, sum }, index) => {
          const Icon = getIcon(name)
          const available = qs.length > 0
          return <motion.button key={name} whileHover={available ? { y: -5 } : undefined} whileTap={available ? { scale: .99 } : undefined} disabled={!available} onClick={() => openSystem(name)} className={`journey-system-card group relative min-h-[218px] overflow-hidden rounded-[27px] border border-line p-6 text-left transition-all ${available ? 'hover:border-accent/40' : 'opacity-45'}`}>
            <div className={`journey-system-glow journey-glow-${index % 4}`} />
            <div className="relative flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f1e8ff] text-[#8145d8] shadow-[inset_0_1px_#ffffff] dark:bg-[#3d3052] dark:text-[#c9a6ff]"><Icon size={23} strokeWidth={1.8} /></span><span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface/80 text-muted transition group-hover:text-accent"><ArrowUpRight size={16} /></span></div>
            <h3 className="relative mt-6 text-[18px] font-bold tracking-tight">{name}</h3>
            <p className="relative mt-1.5 text-[11px] font-medium text-muted">{available ? `${qs.length.toLocaleString()} Total Qs · ${concepts.toLocaleString()} Unique Concepts` : 'Coming soon'}</p>
            <div className="relative mt-5 flex items-center justify-between text-[11px] font-semibold text-muted"><span>{available ? `${answered} questions studied` : 'No questions yet'}</span><span>{available ? `${sum.pct}% mastered` : ''}</span></div>
            <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[#eae0f3] dark:bg-[#382d47]"><motion.div initial={false} animate={{ width: `${qs.length ? Math.round(answered / qs.length * 100) : 0}%` }} className="h-full rounded-full bg-[linear-gradient(90deg,#ae85ff,#7136d6)]" /></div>
          </motion.button>
        })}
      </div>
    </section>
  )

  return <div className="space-y-10 md:space-y-14">
    {variant === 'home' ? <>
      <section className="relative">
        <div className="journey-scene relative isolate overflow-hidden rounded-[30px] sm:rounded-[40px]">
          <div className="journey-mountain mountain-one" /><div className="journey-mountain mountain-two" /><div className="journey-mountain mountain-three" /><div className="journey-ground" />
          <div className="journey-streak relative z-10">
            <p className="font-bold uppercase tracking-[.27em] text-[#8357cb] dark:text-[#d7baff]">Your study journey</p>
            <div className="journey-streak-number font-display tabular-nums">{streak}</div>
            <h1 className="font-bold uppercase tracking-[.12em] text-[#29265c] dark:text-[#e8ddff]">Day streak</h1>
            <p className="mt-5 max-w-[260px] font-reading text-[18px] italic leading-[1.45] text-[#4c437e] dark:text-[#c7b7e1] sm:text-[23px]">Keep going. You are building mastery.</p>
            <span className="mt-6 block h-1.5 w-14 rounded-full bg-[#bd9aff]" />
          </div>
          <span aria-hidden="true" className="journey-doctor-shadow" />
          <DoctorWalk avatar={avatar} className="journey-big-doctor absolute z-[5]" />
          <div className="journey-float-stats relative z-10">
            <div className="journey-stat-card flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f2eaff] text-[#9a67ef]"><Layers3 size={23}/></span><div><p className="whitespace-nowrap text-[24px] font-bold leading-none tracking-tight text-[#272254] dark:text-[#efe6ff]">{mastered} <span className="font-light text-[#827599]">/ {totalConcepts}</span></p><p className="mt-1 text-[12px] text-[#736b8c] dark:text-[#bea8d6]">Concepts mastered</p></div></div>
            <div className="journey-stat-card goal-card flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff0e9] text-[#f08d7f]"><Target size={23}/></span><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-[#736b8c] dark:text-[#bea8d6]">Daily goal</p><p className="mt-1 text-[24px] font-bold leading-none text-[#272254] dark:text-[#efe6ff]">{todayCount} <span className="font-light text-[#827599]">/ {goal} questions</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eaddf0] dark:bg-[#493b60]"><motion.div animate={{ width: `${goalPct}%` }} className="h-full rounded-full bg-[#8942e9]" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} /></div></div></div>
            <div className="journey-stat-card milestone-card flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0e9] text-[#fb8b67]"><Flame size={22}/></span><div><p className="text-[12px] text-[#736b8c] dark:text-[#bea8d6]">Next streak milestone</p><p className="text-[18px] font-bold text-[#272254] dark:text-[#efe6ff]">{streak < 7 ? 7 : Math.ceil((streak + 1) / 7) * 7} days <span className="font-normal text-muted">ahead</span></p></div></div>
          </div>
        </div>
        <div className="journey-mobile-goal relative z-20 mt-3 flex items-center gap-4 rounded-[25px] border border-white/90 bg-surface/85 px-5 py-4 shadow-[0_10px_30px_-18px_#83609e66] md:hidden"><span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-[#fff0e9] text-[#f08d7f]"><Target size={24}/></span><div className="min-w-0 flex-1"><p className="text-[12px] text-muted">Daily goal</p><p className="mt-0.5 text-[23px] font-bold text-ink">{todayCount} <span className="font-light">/ {goal} questions</span></p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eaddf0]"><motion.div animate={{ width: `${goalPct}%` }} className="h-full rounded-full bg-[#8942e9]" /></div></div></div>
        <div className="journey-actions relative z-20 grid gap-3 lg:grid-cols-[1fr_1fr_1.04fr]">
          <button onClick={() => featured && openSystem(featured.name)} disabled={!featured} className="journey-action-card group flex min-h-24 items-center gap-4 rounded-[26px] p-4 text-left disabled:opacity-50 sm:p-5"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,#f2e5ff,#e9d0ff)] text-[#753ac7]"><BookOpen size={28}/></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-muted">Pick up where you left off</span><span className="mt-1 block truncate text-[16px] font-bold tracking-tight">{featured ? `Continue ${featured.name}` : 'Import questions to begin'}</span></span><ChevronRight size={19} className="shrink-0 text-[#8c5ad0] transition group-hover:translate-x-1" /></button>
          <button onClick={() => featured && openSystem(featured.name, 'core_concepts')} disabled={!featured} className="journey-action-card group flex min-h-24 items-center gap-4 rounded-[26px] p-4 text-left disabled:opacity-50 sm:p-5"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,#ffebdf,#ffdcf2)] text-[#b66b9e]"><Layers3 size={28}/></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-muted">1 question per concept</span><span className="mt-1 block text-[16px] font-bold tracking-tight">Complete Coverage</span></span><ChevronRight size={19} className="shrink-0 text-[#8c5ad0] transition group-hover:translate-x-1" /></button>
          <button onClick={() => hasSavedSession ? onResume() : featured && openSystem(featured.name)} disabled={!featured && !hasSavedSession} className="journey-start-button group flex min-h-24 items-center justify-center gap-3 rounded-full px-5 text-[20px] font-extrabold text-white shadow-[0_14px_30px_-16px_#5d23b99c] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-16px_#5d23b9cc] active:translate-y-0 disabled:opacity-50"><Play size={20} fill="currentColor" />{hasSavedSession ? 'Resume Studying' : 'Start Studying'}<ArrowRight size={17} className="opacity-60 transition-transform group-hover:translate-x-1" /></button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[26px] border border-[#e9def4] bg-surface/70 px-5 py-4 shadow-sm dark:border-line sm:px-7"><div><p className="text-[13px] font-bold">Ready for a focused sprint?</p><p className="mt-0.5 text-[11px] text-muted">{due ? `${due} questions ready for review` : 'Fresh questions are waiting for you'} · Every block starts shuffled.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => onStart(quickPick(questions, state, 10), 'Quick block', 'tutor')} disabled={!questions.length} className={btnGhost}><Play size={14}/> Quick 10</button><button onClick={() => setBuilder(true)} className={btnGhost}><Plus size={15}/> Custom block</button></div></div>
      {systemDeck}
    </> : <>
      <header className="rounded-[32px] bg-[linear-gradient(115deg,#f3eaff,#ffefe9)] px-6 py-10 dark:bg-[linear-gradient(115deg,#30243e,#29212f)] sm:px-10 sm:py-12"><p className="text-[11px] font-bold uppercase tracking-[.25em] text-accent">Practice / Make every question count</p><h1 className="mt-3 font-display text-[42px] leading-tight tracking-[-.06em] sm:text-[58px]">Choose your next challenge<span className="text-accent">.</span></h1><p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">A focused session, a full system, or a custom multi-angle exam. Your questions are always randomized.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setBuilder(true)} className={btnPrimary}><Plus size={17}/> Build custom session</button><button disabled={!questions.length} onClick={() => onStart(quickPick(questions, state, 10), 'Quick block', 'tutor')} className={btnGhost}><Play size={15}/> Quick 10-question drill</button>{hasSavedSession && <button onClick={onResume} className={btnGhost}><RotateCcw size={15}/> Resume session</button>}</div></header>
      <section className={`${card} p-5 sm:p-7`}><p className={label}>Your preferred coverage mode</p><p className="mb-4 mt-2 text-[13px] text-muted">You can refine this separately when launching any system.</p><CoverageSelector value={coverageMode} onChange={setCoverageMode} total={questions.length} concepts={totalConcepts}/></section>
      {systemDeck}
    </>}

    <AnimatePresence>
      {selected && <motion.div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0 bg-[#211333]/65 backdrop-blur-md" onClick={() => setLauncher(null)} />
        <motion.div role="dialog" aria-modal="true" aria-label={`${selected.name} practice setup`} initial={{ opacity: 0, y: 25, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} className="surface-float relative z-10 w-full max-w-xl overflow-hidden rounded-t-[32px] border border-line bg-surface sm:rounded-[32px]">
          <header className="flex items-start justify-between border-b border-line bg-[linear-gradient(110deg,#f8f1ff,#fff6ef)] px-6 py-6 dark:bg-[linear-gradient(110deg,#332741,#272231)]"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-accent">System deck / Practice setup</p><h2 className="mt-2 font-display text-[31px] tracking-[-.05em]">{selected.name}</h2><p className="mt-1 text-[12px] text-muted">{selected.qs.length.toLocaleString()} Total Qs · {selected.concepts.toLocaleString()} Unique Concepts</p></div><button aria-label="Close practice setup" onClick={() => setLauncher(null)} className="rounded-full border border-line bg-surface p-2 text-muted"><X size={17}/></button></header>
          <div className="space-y-4 p-6"><CoverageSelector value={coverageMode} onChange={setCoverageMode} total={selected.qs.length} concepts={selected.concepts}/><p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted"><Sparkles size={16} className="shrink-0 text-accent" />Unanswered angles and high-yield Tier 1 questions are prioritized. All sessions are shuffled automatically.</p></div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/50 px-6 py-4"><span className="text-[11px] font-semibold text-muted"><CheckCircle2 size={14} className="mr-1 inline text-good"/>{(coverageMode === 'core_concepts' ? selected.concepts : selected.qs.length).toLocaleString()} questions ready</span><button onClick={() => startSystem(selected.name)} className={btnPrimary}>Start studying <ArrowRight size={16}/></button></footer>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
    <BlockBuilder open={builder} onClose={() => setBuilder(false)} onStart={onStart}/>
  </div>
}
