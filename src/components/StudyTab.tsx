import { ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Flame, Layers3, Play, Plus, Sparkles, Target, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { analyzeConcepts, masteryCounts } from '../lib/adaptive'
import { quickPick } from '../lib/blocks'
import { useCloudSync } from '../lib/cloudSync'
import { SYSTEMS } from '../lib/data'
import { useLearning } from '../lib/learning'
import { getIcon } from '../lib/meta'
import { buildSystemSession, countConcepts } from '../lib/sessionBuilder'
import { computeStreak, summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { CoverageMode, SessionMode, SessionSource } from '../types/qbank'
import BlockBuilder from './BlockBuilder'
import AdaptivePanel from './AdaptivePanel'
import RevisionPlanner from './RevisionPlanner'
import CoverageSelector from './CoverageSelector'
import { DoctorWalk, type DoctorAvatar } from './DoctorWalk'

interface Props {
  onStart: (ids: string[], title: string, mode?: SessionMode, source?: SessionSource) => void
  onResume: () => void
  avatar: DoctorAvatar
  onBrowse?: () => void
  onFlashcards?: () => void
  onNotes?: () => void
  onExam?: () => void
  variant?: 'home' | 'practice'
}

export default function StudyTab({ onStart, onResume, avatar, onBrowse, onFlashcards, onNotes, onExam, variant = 'home' }: Props) {
  const { questions, state, todayCount } = useStore()
  const { schedule, settings, attempts, active, setActive, flashcards } = useLearning()
  const { status: syncStatus, retry } = useCloudSync()
  const { progress } = state
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [builder, setBuilder] = useState(false)
  const [launcher, setLauncher] = useState<string | null>(null)
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('core_concepts')
  const totalConcepts = useMemo(() => countConcepts(questions), [questions])
  const mastered = useMemo(() => masteryCounts(analyzeConcepts(questions, progress, schedule, attempts)).mastered, [questions, progress, schedule, attempts])
  const streak = computeStreak(state.studyDates)
  const goal = Math.max(1, settings.dailyGoal)
  const goalPct = Math.min(100, Math.round((todayCount / goal) * 100))

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

  const availableSystems = systems.filter(s => s.qs.length > 0)
  const unavailableCount = systems.length - availableSystems.length
  const visibleSystems = variant === 'home' ? availableSystems.slice(0, 3) : showUnavailable ? systems : availableSystems
  const systemDeck = (
    <section className="space-y-3" id="system-deck">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-bold tracking-tight">Explore systems</h2><p className="mt-1 text-xs text-muted">{questions.length.toLocaleString()} questions · {totalConcepts.toLocaleString()} concepts</p></div>
        {variant === 'home' && <button className={btnGhost} onClick={onBrowse}>View all <ChevronRight size={14}/></button>}

      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleSystems.map(({ name, qs, answered, concepts, sum }, index) => {
          const Icon = getIcon(name)
          const available = qs.length > 0
          return <motion.button key={name} whileHover={available ? { y: -5 } : undefined} whileTap={available ? { scale: .99 } : undefined} disabled={!available} onClick={() => openSystem(name)} className={`journey-system-card group relative min-h-[144px] overflow-hidden rounded-2xl border border-line p-4 text-left transition-all ${available ? 'hover:border-accent/40' : 'opacity-45'}`}>
            <div className={`journey-system-glow journey-glow-${index % 4}`} />
            <div className="relative flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f1e8ff] text-[#8145d8] shadow-[inset_0_1px_#ffffff] dark:bg-[#3d3052] dark:text-[#c9a6ff]"><Icon size={23} strokeWidth={1.8} /></span><span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface/80 text-muted transition group-hover:text-accent"><ArrowUpRight size={16} /></span></div>
            <h3 className="relative mt-3 text-[16px] font-bold tracking-tight">{name}</h3>
            <p className="relative mt-1.5 text-[11px] font-medium text-muted">{available ? `${qs.length.toLocaleString()} Total Qs · ${concepts.toLocaleString()} Unique Concepts` : 'Coming soon'}</p>
            <div className="relative mt-3 flex items-center justify-between text-[11px] font-semibold text-muted"><span>{available ? `${answered} questions studied` : 'No questions yet'}</span><span>{available ? `${sum.pct}% marked complete` : ''}</span></div>
            <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[#eae0f3] dark:bg-[#382d47]"><motion.div initial={false} animate={{ width: `${qs.length ? Math.round(answered / qs.length * 100) : 0}%` }} className="h-full rounded-full bg-[linear-gradient(90deg,#ae85ff,#7136d6)]" /></div>
          </motion.button>
        })}
      </div>
      {variant === 'practice' && unavailableCount > 0 && <button className={btnGhost} aria-expanded={showUnavailable} onClick={()=>setShowUnavailable(v=>!v)}>{showUnavailable ? 'Hide' : 'Show'} coming soon ({unavailableCount})</button>}
    </section>
  )

  const savedCount = active?.queue.filter(id => !!active.answers[id]?.selected).length ?? 0
  const savedTotal = active?.queue.length ?? 0
  const syncText = syncStatus === 'saved' ? 'Saved to cloud · ready to switch devices' : syncStatus === 'conflict' ? 'Sync conflict · resolve before switching devices' : syncStatus === 'offline' ? 'Cloud unavailable · retry before switching devices' : 'Saving to cloud… keep this page open'
  return <div className="space-y-5 md:space-y-6">
    {active && <section aria-label="Unfinished study session" className={`${card} space-y-4 rounded-[26px] p-5 sm:p-7`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className={label}>Continue where you left off</p><h2 className="mt-1 text-lg font-bold tracking-tight">{active.session.title}</h2><p className="mt-1 text-xs text-muted">{active.session.source?.kind === 'adaptive' ? 'Adaptive practice' : active.session.mode === 'exam' ? 'Timed exam · timer paused while away' : 'Tutor mode'} · Question {Math.min(active.position + 1, savedTotal)} of {savedTotal}</p></div>
        <span className="rounded-full bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">{savedCount} / {savedTotal} answered</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent" style={{ width: `${savedTotal ? savedCount / savedTotal * 100 : 0}%` }}/></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className={`text-xs font-medium ${syncStatus === 'saved' ? 'text-good' : 'text-muted'}`}>{syncText}</p><div className="flex flex-wrap gap-2">{syncStatus === 'offline' && <button onClick={retry} className={btnGhost}>Retry sync</button>}<button className={btnGhost} onClick={() => { if (window.confirm('Discard this unfinished session? Recorded tutor progress stays saved; unsubmitted exam answers will be lost.')) setActive(null) }}>Discard session</button><button onClick={onResume} className={btnPrimary}><Play size={15}/> Resume session</button></div></div>
    </section>}
    {variant === 'home' ? <>
      <section className="relative isolate overflow-hidden rounded-[26px] border border-line bg-[linear-gradient(115deg,#f3eaff,#fff4ed)] p-5 dark:bg-[linear-gradient(115deg,#30243e,#29212f)] sm:p-7">
        <div className="relative z-10 max-w-[70%] sm:max-w-[75%]">
          <p className={label}>Your study journey</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">Ready to study?</h1>
          <p className="mt-2 text-sm text-muted">{active ? 'Pick up where you left off.' : 'Small steps. Stronger concepts.'}</p>
          {!active && <button onClick={() => featured && openSystem(featured.name)} disabled={!featured} className={`${btnPrimary} mt-4`}><Play size={16}/> Start studying</button>}
        </div>
        <DoctorWalk avatar={avatar} className="absolute bottom-0 right-0 top-2 w-[30%] sm:w-[25%]" small />
      </section>
      <section className={`${card} grid grid-cols-3 divide-x divide-line overflow-hidden`} aria-label="Study summary">
        <div className="min-w-0 p-3 sm:p-5"><Flame size={17} className="text-accent"/><p className="mt-2 text-xl font-bold tabular-nums">{streak}</p><p className="text-[11px] text-muted">Day streak · next {streak < 7 ? 7 : Math.ceil((streak + 1) / 7) * 7}</p></div>
        <div className="min-w-0 p-3 sm:p-5"><Target size={17} className="text-accent"/><p className="mt-2 text-xl font-bold tabular-nums">{todayCount}<span className="text-xs text-muted"> / {goal}</span></p><p className="text-[11px] text-muted">Daily goal</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-accent" style={{width:`${goalPct}%`}}/></div></div>
        <div className="min-w-0 p-3 sm:p-5"><Layers3 size={17} className="text-accent"/><p className="mt-2 text-xl font-bold tabular-nums">{mastered}<span className="text-xs text-muted"> / {totalConcepts}</span></p><p className="text-[11px] text-muted">Mastered</p></div>
      </section>
      <AdaptivePanel onStart={onStart} compact />
      <RevisionPlanner onStart={onStart} onFlashcards={onFlashcards} onNotes={onNotes} onExam={onExam} onBrowse={onBrowse}/>
      <button type="button" onClick={onFlashcards} className={`${card} flex w-full items-center gap-3 p-4 text-left hover:border-accent/50`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Layers3 size={20}/></span><span className="min-w-0 flex-1"><span className="block font-semibold">Review flashcards</span><span className="text-xs text-muted">{flashcards.filter(c => c.dueAt <= Date.now()).length} cards due · Active recall</span></span><ChevronRight size={18} className="text-muted"/></button>
      {systemDeck}
    </> : <>
      <header className="space-y-3"><h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Question Bank</h1><p className="text-sm text-muted">Choose a system or build your own practice block.</p><div className="flex flex-wrap gap-2"><button onClick={() => setBuilder(true)} className={btnPrimary}><Plus size={17}/> Build custom session</button><button disabled={!questions.length} onClick={() => onStart(quickPick(questions, state, 10), 'Quick block', 'tutor')} className={btnGhost}><Play size={15}/> Quick 10</button></div></header>
      {systemDeck}
      <details className={`${card} p-4`}><summary className="cursor-pointer font-semibold text-accent">Advanced study options</summary><div className="mt-4 space-y-4"><section className="space-y-3"><p className={label}>Your preferred coverage mode</p><CoverageSelector value={coverageMode} onChange={setCoverageMode} total={questions.length} concepts={totalConcepts}/></section><AdaptivePanel onStart={onStart}/></div></details>
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
