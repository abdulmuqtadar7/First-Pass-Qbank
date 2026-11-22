#!/usr/bin/env bash
set -euo pipefail

# FirstPass Flagship: paste this single script into your Codespaces terminal.
# It does not open or change any file in src/data/*.json.
# Existing browser localStorage keys and their values remain unchanged.

if [ ! -f package.json ] || [ ! -f src/App.tsx ]; then
  echo "Open the FirstPass Q-Bank project root in Codespaces before running this script." >&2
  exit 1
fi

# The earlier Daylight/Obsidian update was confirmed installed (4/4 checks).
if ! grep -Fq -- 'MotionConfig reducedMotion="user"' src/main.tsx || ! grep -Fq -- '--canvas: #faf9f6' src/index.css; then
  echo "This script expects your previously installed FirstPass UI upgrade. No files changed." >&2
  exit 1
fi

# Preserve the exact original source files for a straightforward rollback.
backup_archive="$(mktemp ./firstpass-before-flagship-XXXXXXXX.tar.gz)"
backup_files=()
for file in src/App.tsx src/components/AppNav.tsx src/components/BlockBuilder.tsx src/components/ExplanationSheet.tsx src/components/HistoryTab.tsx src/components/NotebookTab.tsx src/components/Player.tsx src/components/ProgressTab.tsx src/components/ReviewTab.tsx src/components/StudyJourney.tsx src/components/StudyTab.tsx src/index.css src/lib/blocks.ts src/lib/learning.tsx src/lib/stats.ts src/main.tsx src/types/qbank.ts; do
  if [ -f "$file" ]; then backup_files+=("$file"); fi
done
tar -czf "$backup_archive" "${backup_files[@]}"
echo "Source backup saved: $backup_archive"
echo "Question JSON files and browser progress keys are untouched."

mkdir -p src src/components src/lib src/types

cat << 'EOF' > src/App.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppNav, { type Tab } from './components/AppNav'
import StudyTab from './components/StudyTab'
import ReviewTab from './components/ReviewTab'
import ProgressTab from './components/ProgressTab'
import HistoryTab from './components/HistoryTab'
import NotebookTab from './components/NotebookTab'
import Player from './components/Player'
import Admin from './components/Admin'
import { buildBlock, shuffle } from './lib/blocks'
import { buildSystemSession } from './lib/sessionBuilder'
import { weakQuestions } from './lib/stats'
import { dueConceptQuestions, useLearning } from './lib/learning'
import { useStore } from './lib/store'
import { page } from './lib/ui'
import type { OptionKey, Session, SessionMode, SessionSource } from './types/qbank'

export default function App() {
  const { questions, state } = useStore()
  const { active, setActive, schedule } = useLearning()
  const [path, setPath] = useState(window.location.pathname)
  const [tab, setTab] = useState<Tab>('study')
  const [session, setSession] = useState<Session | null>(() => active?.session ?? null)
  const [sKey, setSKey] = useState(0)

  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  const start = useCallback((ids: string[], title: string, mode: SessionMode = 'tutor', source?: SessionSource) => {
    if (!ids.length) return
    if (active && !window.confirm('Replace the saved unfinished session with a new one? Your recorded question progress will stay intact.')) return
    const next: Session = { ids: shuffle(ids), title, mode, source }
    setSession(next)
    setActive({ session: next, queue: next.ids, position: 0, answers: {}, ratings: {}, times: {}, startedAt: Date.now(), updatedAt: Date.now() })
    setSKey((k) => k + 1)
  }, [active, setActive])

  const review = useCallback((ids: string[], prefill: Record<string, OptionKey>) => {
    if (!ids.length) return
    if (active && !window.confirm('Open this review and discard your saved unfinished session? Your recorded question progress will remain.')) return
    const next: Session = { ids: shuffle(ids), title: 'Review', mode: 'review', prefill }
    setActive(null)
    setSession(next)
    setSKey((k) => k + 1)
  }, [active, setActive])

  const restart = useCallback(() => {
    if (!session) return
    let ids = session.ids
    if (session.source?.kind === 'system') {
      const { system, coverageMode } = session.source
      ids = buildSystemSession(questions, system, coverageMode, state.progress).map((q) => q.id)
    } else if (session.source?.kind === 'block') {
      ids = buildBlock(questions, session.source.config, state).map((q) => q.id)
    }
    if (!ids.length) ids = session.ids
    const next: Session = { ...session, ids: shuffle(ids) }
    setSession(next)
    setActive(session.mode === 'review' ? null : { session: next, queue: next.ids, position: 0, answers: {}, ratings: {}, times: {}, startedAt: Date.now(), updatedAt: Date.now() })
    setSKey((k) => k + 1)
  }, [questions, session, state, setActive])

  const resume = useCallback(() => {
    if (!active) return
    setSession(active.session)
    setSKey((k) => k + 1)
  }, [active])

  const due = useMemo(
    () => new Set([
      ...weakQuestions(questions, state.progress, state.flagged).map((q) => q.id),
      ...dueConceptQuestions(questions, schedule, state.progress).map((q) => q.id),
    ]).size,
    [questions, schedule, state.progress, state.flagged],
  )

  if (path.startsWith('/admin')) return <Admin />

  if (session) {
    return <Player key={sKey} session={session} onExit={() => setSession(null)} onReview={review} onRestart={restart} />
  }

  return (
    <div className={`${page} study-shell`}>
      <AppNav tab={tab} onChange={setTab} reviewCount={due} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="mx-auto w-full max-w-6xl px-4 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 md:pb-20 md:pt-10 lg:px-8"
        >
          {tab === 'study' && <StudyTab onStart={start} onResume={resume} hasSavedSession={!!active} />}
          {tab === 'review' && <ReviewTab onStart={start} />}
          {tab === 'progress' && <ProgressTab />}
          {tab === 'history' && <HistoryTab onReview={review} />}
          {tab === 'notebook' && <NotebookTab />}
        </motion.main>
      </AnimatePresence>
    </div>
  )
}
EOF

cat << 'EOF' > src/components/AppNav.tsx
import { Activity, BarChart3, BookOpen, History, Moon, NotebookPen, RotateCcw, Sun } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../lib/store'

export type Tab = 'study' | 'review' | 'progress' | 'history' | 'notebook'

const TABS: { id: Tab; label: string; Icon: typeof BookOpen }[] = [
  { id: 'study', label: 'Study', Icon: BookOpen },
  { id: 'review', label: 'Review', Icon: RotateCcw },
  { id: 'progress', label: 'Insights', Icon: BarChart3 },
  { id: 'history', label: 'History', Icon: History },
  { id: 'notebook', label: 'Notebook', Icon: NotebookPen },
]

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  reviewCount: number
}

export default function AppNav({ tab, onChange, reviewCount }: Props) {
  const { state, toggleTheme } = useStore()
  const dark = state.theme === 'dark'

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/85 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink text-canvas shadow-sm">
              <Activity size={20} strokeWidth={2.35} />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            </span>
            <div className="min-w-0 leading-tight">
              <span className="block whitespace-nowrap text-[14px] font-bold tracking-[-.035em]">FirstPass <span className="font-medium text-muted">Q-Bank</span></span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.15em] text-muted">A better way to master medicine</span>
            </div>
          </div>

          <nav aria-label="Primary navigation" className="mx-auto hidden items-center gap-1 rounded-xl border border-line bg-sunken/65 p-1 md:flex">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => onChange(id)} aria-current={tab === id ? 'page' : undefined} className={`relative flex h-9 items-center gap-2 rounded-lg px-4 text-[12px] font-semibold transition-colors ${tab === id ? 'text-ink' : 'text-muted hover:text-ink'}`}>
                {tab === id && <motion.span layoutId="desktop-nav-active" className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm" />}
                <Icon size={15} className="relative z-10" />
                <span className="relative z-10">{label}</span>
                {id === 'review' && reviewCount > 0 && <span className="relative z-10 rounded-md bg-accent/12 px-1.5 py-0.5 font-mono text-[10px] text-accent">{reviewCount > 99 ? '99+' : reviewCount}</span>}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              Study space
            </span>
            <button onClick={toggleTheme} aria-label={dark ? 'Switch to Daylight Paper theme' : 'Switch to Obsidian theme'} title={dark ? 'Daylight Paper' : 'Obsidian Dark'} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-muted shadow-sm transition-colors hover:border-accent/35 hover:text-ink">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={dark ? 'sun' : 'moon'} initial={{ rotate: -30, opacity: 0, scale: 0.8 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 30, opacity: 0, scale: 0.8 }} transition={{ duration: 0.14 }}>
                  {dark ? <Sun size={17} /> : <Moon size={17} />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </div>
      </header>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-26px_rgba(0,0,0,.35)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 py-1.5">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => onChange(id)} aria-current={tab === id ? 'page' : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${tab === id ? 'text-accent' : 'text-muted'}`}>
              {tab === id && <motion.span layoutId="mobile-nav-active" className="absolute inset-0 rounded-xl bg-accent/8" />}
              <span className="relative z-10">
                <Icon size={19} strokeWidth={tab === id ? 2.3 : 1.8} />
                {id === 'review' && reviewCount > 0 && <span className="absolute -right-3 -top-2 rounded-full bg-accent px-1.5 font-mono text-[9px] leading-4 text-white">{reviewCount > 99 ? '99+' : reviewCount}</span>}
              </span>
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
EOF

cat << 'EOF' > src/components/BlockBuilder.tsx
import { ArrowRight, Clock3, GraduationCap, Settings2, Sparkles, Timer, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { SYSTEMS } from '../lib/data'
import { buildBlock, eligible } from '../lib/blocks'
import { countConcepts } from '../lib/sessionBuilder'
import { useStore } from '../lib/store'
import { btnPrimary, iconBtn, label } from '../lib/ui'
import type { BlockConfig, CoverageMode, FilterKey, SessionMode, SessionSource } from '../types/qbank'
import CoverageSelector from './CoverageSelector'

const FILTERS: { k: FilterKey; label: string }[] = [
  { k: 'all', label: 'All questions' },
  { k: 'unanswered', label: 'Unanswered' },
  { k: 'incorrect', label: 'Needs review' },
  { k: 'flagged', label: 'Bookmarked' },
]

const SIZES = [10, 20, 40, 0]

interface Props {
  open: boolean
  onClose: () => void
  onStart: (ids: string[], title: string, mode: SessionMode, source?: SessionSource) => void
}

const chip = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-[11px] font-semibold transition-all ${active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:border-accent/25 hover:text-ink'}`

export default function BlockBuilder({ open, onClose, onStart }: Props) {
  const { questions, state } = useStore()
  const [mode, setMode] = useState<'tutor' | 'exam'>('tutor')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('core_concepts')
  const [systems, setSystems] = useState<string[]>([])
  const [size, setSize] = useState(20)
  const [tier, setTier] = useState('all')
  const [angle, setAngle] = useState('all')
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(90)

  const available = useMemo(() => {
    const names = SYSTEMS.filter((n) => questions.some((q) => q.system.toLowerCase() === n.toLowerCase()))
    for (const q of questions) if (!names.some((n) => n.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
    return names
  }, [questions])

  const angles = useMemo(() => [...new Set(questions.map((q) => q.angle))].sort(), [questions])
  const pool = useMemo(() => eligible(questions, { filter, systems, tier, angle }, state), [questions, filter, systems, tier, angle, state])
  const concepts = useMemo(() => countConcepts(pool), [pool])
  const availableCount = coverageMode === 'core_concepts' ? concepts : pool.length
  const count = size > 0 ? Math.min(size, availableCount) : availableCount

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function toggleSystem(name: string) {
    const k = name.toLowerCase()
    setSystems((current) => current.includes(k) ? current.filter((x) => x !== k) : [...current, k])
  }

  function go() {
    const config: BlockConfig = { mode, filter, systems, size, coverageMode, tier, angle, secondsPerQuestion }
    const ids = buildBlock(questions, config, state).map((q) => q.id)
    onStart(ids, mode === 'exam' ? 'Timed Exam Block' : 'Custom Block', mode, { kind: 'block', config })
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-[#0b0d11]/65 backdrop-blur-[5px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Build a custom session" initial={{ y: 28, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 16, scale: 0.98, opacity: 0 }} className="surface-float relative z-10 flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line bg-surface sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-line px-6 py-5">
              <div><p className={label}>Practice / Configuration</p><h2 className="mt-1.5 flex items-center gap-2 text-[21px] font-bold tracking-[-.04em]"><Settings2 size={19} className="text-accent" /> Build a session</h2></div>
              <button onClick={onClose} aria-label="Close custom session" className={`${iconBtn} border border-line bg-sunken`}><X size={17} /></button>
            </header>

            <div className="space-y-6 overflow-y-auto px-6 py-6">
              <section className="space-y-3">
                <p className={label}>Learning mode</p>
                <div className="grid grid-cols-2 gap-2">
                  {([{ key: 'tutor', name: 'Tutor', Icon: GraduationCap, note: 'Immediate feedback' }, { key: 'exam', name: 'Timed exam', Icon: Timer, note: 'Grade after submission' }] as const).map(({ key, name, Icon, note }) => (
                    <button key={key} onClick={() => setMode(key)} aria-pressed={mode === key} className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${mode === key ? 'border-accent/50 bg-accent/8' : 'border-line hover:bg-sunken'}`}>
                      <span className={`grid h-9 w-9 place-items-center rounded-lg ${mode === key ? 'bg-accent/15 text-accent' : 'bg-sunken text-muted'}`}><Icon size={17} /></span>
                      <span><span className="block text-[12px] font-semibold">{name}</span><span className="mt-0.5 block text-[10px] text-muted">{note}</span></span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2.5"><p className={label}>Question filter</p><div className="flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item.k} onClick={() => setFilter(item.k)} aria-pressed={filter === item.k} className={chip(filter === item.k)}>{item.label}</button>)}</div></section>

              <section className="space-y-2.5"><div className="flex justify-between"><p className={label}>Systems</p><span className="font-mono text-[10px] text-muted">{systems.length ? `${systems.length} selected` : 'All systems'}</span></div><div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto"><button onClick={() => setSystems([])} className={chip(systems.length === 0)}>All systems</button>{available.map((name) => <button key={name} onClick={() => toggleSystem(name)} aria-pressed={systems.includes(name.toLowerCase())} className={chip(systems.includes(name.toLowerCase()))}>{name}</button>)}</div></section>

              <section className="grid grid-cols-2 gap-3">
                <label className="space-y-2"><span className={label}>Yield tier</span><select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full rounded-xl border border-line bg-surface p-3 text-xs outline-none focus:border-accent"><option value="all">All tiers</option>{[1,2,3].map((n) => <option key={n} value={String(n)}>Tier {n}</option>)}</select></label>
                <label className="space-y-2"><span className={label}>Question angle</span><select value={angle} onChange={(e) => setAngle(e.target.value)} className="w-full rounded-xl border border-line bg-surface p-3 text-xs outline-none focus:border-accent"><option value="all">All angles</option>{angles.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label>
              </section>

              <CoverageSelector value={coverageMode} onChange={setCoverageMode} total={pool.length} concepts={concepts} filtered={filter !== 'all'} />

              <section className="space-y-2.5"><p className={label}>Session length</p><div className="grid grid-cols-4 gap-2">{SIZES.map((value) => <button key={value} onClick={() => setSize(value)} aria-pressed={size === value} className={`rounded-xl border py-3 text-[12px] font-semibold transition-all ${size === value ? 'border-accent/45 bg-accent/10 text-accent' : 'border-line text-muted hover:bg-sunken'}`}>{value === 0 ? 'All' : value}</button>)}</div><label className="flex items-center gap-3 text-[11px] text-muted">Custom question count <input aria-label="Custom question count" type="number" min="1" max="1000" value={size || ''} onChange={(e) => setSize(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-ink"/></label>{mode === 'exam' && <label className="flex items-center gap-3 text-[11px] text-muted">Time per question <select value={secondsPerQuestion} onChange={(e) => setSecondsPerQuestion(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink"><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={120}>120 seconds</option></select></label>}</section>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-line bg-sunken/50 px-6 py-4">
              <div><p className="font-mono text-[12px] font-bold tabular-nums">{count.toLocaleString()} ready <span className="font-normal text-muted">/ {availableCount.toLocaleString()} matched</span></p><p className="mt-1 flex items-center gap-1 text-[10px] text-muted"><Sparkles size={11} className="text-accent" /> Randomized on launch {mode === 'exam' && <>· <Clock3 size={11} /> {Math.ceil(count * secondsPerQuestion / 60)} min</>}</p></div>
              <button disabled={count === 0} onClick={go} className={btnPrimary}>Start session <ArrowRight size={15} /></button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
EOF

cat << 'EOF' > src/components/ExplanationSheet.tsx
import { BookOpen, Check, CheckCircle2, ChevronDown, FileText, Highlighter, ListChecks, NotebookPen, Plus, Sparkles, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { distractorOf, optionKeysOf, optionText } from '../lib/options'
import { card, label, tag } from '../lib/ui'
import { useLearning } from '../lib/learning'
import type { Answer, Question, SessionMode } from '../types/qbank'
import TopicSummary from './TopicSummary'

interface Props {
  q: Question
  ans: Answer
  mode: SessionMode
  isCorrectPick: boolean
}

type ExplanationTab = 'mechanism' | 'options' | 'overview'

const TABS: { key: ExplanationTab; name: string; Icon: typeof BookOpen }[] = [
  { key: 'mechanism', name: 'Core Mechanism', Icon: Sparkles },
  { key: 'options', name: 'Option Rule-Outs', Icon: ListChecks },
  { key: 'overview', name: 'First Aid Topic Overview', Icon: FileText },
]

export default function ExplanationSheet({ q, ans, mode, isCorrectPick }: Props) {
  const [tab, setTab] = useState<ExplanationTab>('mechanism')
  const [noteOpen, setNoteOpen] = useState(false)
  const { notes, saveNote, flashcards, addFlashcard } = useLearning()
  const keys = optionKeysOf(q)
  const saved = flashcards.some((c) => c.questionId === q.id)

  function captureHighlight() {
    const selected = window.getSelection()?.toString().trim()
    if (!selected) { setNoteOpen(true); return }
    const previous = notes[q.id]?.text ?? ''
    saveNote(q.id, previous ? `${previous}\n\n• ${selected}` : `• ${selected}`)
    setNoteOpen(true)
  }

  return (
    <motion.section initial={{ opacity: 0, height: 0, y: -12 }} animate={{ opacity: 1, height: 'auto', y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }} className={`${card} overflow-hidden border-accent/20`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${mode === 'review' ? 'bg-accent/10 text-accent' : isCorrectPick ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
            {mode === 'review' ? <BookOpen size={18} /> : isCorrectPick ? <CheckCircle2 size={19} /> : <XCircle size={19} />}
          </span>
          <div>
            <p className="text-[13px] font-bold tracking-tight">{mode === 'review' ? 'Answer review' : isCorrectPick ? 'Correct. Nicely done.' : 'Let’s unpack this one.'}</p>
            <p className="mt-0.5 text-[11px] text-muted">{mode === 'review' ? `Your answer: ${ans.selected ?? 'not answered'}` : `Correct answer: ${q.correct_option}`} · First Aid 36th Edition</p>
          </div>
        </div>
        <span className={tag}>FA 36e · p. {q.correct_fa_page}</span>
      </header>

      <div className="border-b border-line px-3 pt-2 sm:px-5">
        <div role="tablist" aria-label="Explanation sections" className="no-scrollbar flex gap-2 overflow-x-auto">
          {TABS.map(({ key, name, Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`relative flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-3 text-[11px] font-semibold transition-colors ${tab === key ? 'text-accent' : 'text-muted hover:text-ink'}`}>
              <Icon size={14} /> {name}
              {tab === key && <motion.span layoutId="explanation-tab-underline" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }} className="px-5 py-6 sm:px-7">
          {tab === 'mechanism' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-accent/15 bg-accent/5 p-4"><p className={`${label} flex items-center gap-2 text-accent`}><Sparkles size={13} /> The high-yield takeaway</p><p className="mt-2.5 text-[15px] font-semibold leading-[1.65] tracking-[-.015em]">{q.high_yield_pearl}</p></div>
              <div><p className={label}>Core pathophysiology &amp; clinical reasoning</p><p className="mt-3 max-w-[75ch] whitespace-pre-line font-reading text-[16px] leading-[1.85]">{q.correct_explanation}</p></div>
            </div>
          )}

          {tab === 'options' && (
            <div><p className={label}>Clinical differential / All answer choices</p><ul className="mt-3 divide-y divide-line">{keys.map((k) => {
              const correct = k === q.correct_option
              const picked = ans.selected === k
              const reason = correct ? q.correct_explanation : distractorOf(q, k).reason
              return <li key={k} className="py-4"><div className="flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs font-semibold ${correct ? 'border-good/20 bg-good/10 text-good' : picked ? 'border-bad/20 bg-bad/10 text-bad' : 'border-line bg-sunken text-muted'}`}>{correct ? <Check size={15} /> : k}</span><div className="min-w-0 flex-1"><p className={`text-[13px] font-semibold leading-relaxed ${correct ? 'text-good' : ''}`}>{optionText(q, k)}</p><p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted">{reason}</p></div><span className={tag}>p. {correct ? q.correct_fa_page : distractorOf(q, k).fa_page}</span></div></li>
            })}</ul></div>
          )}

          {tab === 'overview' && (
            <div><div className="mb-3 flex items-center gap-2"><BookOpen size={16} className="text-accent" /><p className="text-[14px] font-semibold">{q.concept_name}</p></div>{q.topic_overview ? <TopicSummary text={q.topic_overview} /> : <div className="rounded-xl border border-dashed border-line bg-sunken/40 px-5 py-8 text-center"><p className="text-[13px] font-semibold">Topic overview not provided</p><p className="mt-1 text-[12px] text-muted">Use Core Mechanism and Option Rule-Outs for full explanations.</p></div>}</div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/35 px-5 py-3">
        <button onClick={() => setNoteOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted hover:text-accent"><NotebookPen size={13}/> Personal note</button>
        <button onClick={captureHighlight} title="Select a passage above, then save it to your note" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted hover:text-accent"><Highlighter size={13}/> Save selection</button>
        <button onClick={() => addFlashcard(q)} disabled={saved} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] font-semibold text-accent disabled:opacity-55"><Plus size={13}/>{saved ? 'Flashcard saved' : 'Make flashcard'}</button>
        <span className="ml-auto hidden items-center gap-1 text-[10px] text-muted sm:flex">Scroll to explore <ChevronDown size={12}/></span>
      </div>
      {noteOpen && <div className="border-t border-line p-5"><label className={label} htmlFor={`fp-note-${q.id}`}>Your note · {q.concept_name}</label><textarea id={`fp-note-${q.id}`} value={notes[q.id]?.text ?? ''} onChange={(e) => saveNote(q.id, e.target.value)} rows={3} placeholder="What should your future self remember?" className="mt-2 w-full resize-y rounded-xl border border-line bg-sunken/40 p-3 text-[13px] leading-relaxed outline-none focus:border-accent"/><p className="mt-1 text-[10px] text-muted">Saved automatically to this browser.</p></div>}
    </motion.section>
  )
}
EOF

cat << 'EOF' > src/components/HistoryTab.tsx
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
        <h1 className="mt-2 text-3xl font-bold tracking-[-.05em]">Session history</h1>
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
EOF

cat << 'EOF' > src/components/NotebookTab.tsx
import { BookOpen, BrainCircuit, Download, NotebookPen, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLearning } from '../lib/learning'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { Flashcard } from '../lib/learning'

export default function NotebookTab() {
  const { notes, saveNote, flashcards, gradeFlashcard } = useLearning()
  const { byId } = useStore()
  const [tab, setTab] = useState<'notes' | 'cards'>('notes')
  const [query, setQuery] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState('')
  const noteIds = useMemo(() => Object.entries(notes).filter(([id, n]) => n.text.trim() && byId.has(id))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt).map(([id]) => id), [notes, byId])
  const matchingNotes = noteIds.filter((id) => {
    const q = byId.get(id)
    return `${q?.concept_name} ${notes[id]?.text}`.toLowerCase().includes(query.toLowerCase())
  })
  const due = flashcards.filter((c) => c.dueAt <= Date.now())
  const cardToStudy: Flashcard | undefined = due.find((c) => c.id === selected) ?? due[0]

  function grade(k: 'hard' | 'good' | 'easy') {
    if (!cardToStudy) return
    gradeFlashcard(cardToStudy.id, k)
    setSelected('')
    setRevealed(false)
  }

  function exportCards() {
    const csv = ['Front,Back', ...flashcards.map((c) => [c.front, c.back].map((value) => `"${value.replace(/"/g, '""')}"`).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'firstpass-flashcards.csv'
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="space-y-6">
    <header><p className={label}>Make knowledge stick</p><h1 className="mt-2 text-3xl font-bold tracking-[-.05em]">Your notebook</h1><p className="mt-2 text-sm text-muted">Save concise notes and convert explanations into review cards as you study.</p></header>
    <div className="flex gap-2 rounded-xl border border-line bg-sunken p-1.5">
      {([['notes','Notes',NotebookPen],['cards','Flashcards',BrainCircuit]] as const).map(([id, name, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${tab === id ? 'bg-surface text-accent shadow-sm' : 'text-muted'}`}><Icon size={15}/>{name}</button>)}
    </div>
    {tab === 'notes' ? <>
      <input aria-label="Search your notes" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved notes..." className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-accent" />
      {!matchingNotes.length && <div className={`${card} py-14 text-center`}><NotebookPen size={28} className="mx-auto mb-3 text-accent/70"/><p className="font-semibold">No notes yet</p><p className="mt-1 text-sm text-muted">Save a note from any question explanation.</p></div>}
      {matchingNotes.map((id) => {
        const q = byId.get(id)!
        return <article key={id} className={`${card} p-5`}><div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">{q.concept_name}</h2><span className="text-[11px] text-muted">{q.system}</span></div><textarea rows={3} aria-label={`Note for ${q.concept_name}`} value={notes[id].text} onChange={(e) => saveNote(id, e.target.value)} className="w-full resize-y rounded-lg border border-line bg-sunken/50 p-3 text-sm leading-relaxed outline-none focus:border-accent"/><p className="mt-2 text-[10px] text-muted">Changes save automatically.</p></article>
      })}
    </> : <>
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}><p className="text-sm text-muted"><span className="font-bold text-ink">{due.length}</span> cards due · {flashcards.length} created</p><button onClick={exportCards} disabled={!flashcards.length} className={btnGhost}><Download size={14}/> Export CSV</button></div>
      {!cardToStudy ? <div className={`${card} py-14 text-center`}><BookOpen size={29} className="mx-auto mb-3 text-accent/70"/><p className="font-semibold">All caught up</p><p className="mt-1 text-sm text-muted">Create a card from an explanation, or come back when a card is due.</p></div> : <div className={`${card} overflow-hidden`}>
        <div className="border-b border-line p-5"><p className={label}>Recall this concept</p><h2 className="mt-5 text-center text-[24px] font-bold tracking-tight">{cardToStudy.front}</h2></div>
        <div className="p-6 text-center">
          {revealed ? <p className="mx-auto max-w-xl whitespace-pre-line text-[15px] leading-relaxed">{cardToStudy.back}</p> : <button onClick={() => setRevealed(true)} className={btnPrimary}>Reveal answer <RotateCcw size={14}/></button>}
        </div>
        {revealed && <div className="grid grid-cols-3 gap-2 border-t border-line p-4">{(['hard','good','easy'] as const).map((rating) => <button key={rating} onClick={() => grade(rating)} className="rounded-lg border border-line bg-sunken px-2 py-3 text-sm font-semibold capitalize transition-colors hover:border-accent hover:text-accent">{rating === 'hard' ? 'Again' : rating}</button>)}</div>}
      </div>}
    </>}
  </div>
}
EOF

cat << 'EOF' > src/components/Player.tsx
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Flag, Flame, RotateCcw, Shuffle, Strikethrough, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { fisherYates } from '../lib/sessionBuilder'
import { useLearning } from '../lib/learning'
import { computeStreak } from '../lib/stats'
import { optionKeysOf, optionText } from '../lib/options'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, iconBtn, label, tag } from '../lib/ui'
import type { Answer, Confidence, OptionKey, Session } from '../types/qbank'
import BlockReport from './BlockReport'
import ExplanationSheet from './ExplanationSheet'

interface Props {
  session: Session
  onExit: () => void
  onReview: (ids: string[], prefill: Record<string, OptionKey>) => void
  onRestart: () => void
}

interface RatingDef {
  k: Confidence
  short: string
  full: string
  hot: string
}

const RATINGS: RatingDef[] = [
  { k: 'hard', short: 'Again', full: 'Again / Hard', hot: 'H' },
  { k: 'good', short: 'Good', full: 'Good', hot: 'G' },
  { k: 'easy', short: 'Easy', full: 'Easy · Skip Similar', hot: 'X' },
]

const TONE: Record<string, string> = {
  idle: 'border-line border-l-line bg-surface hover:bg-sunken',
  picked: 'border-accent/40 border-l-accent bg-accent/5',
  correct: 'border-good/30 border-l-good bg-good/5',
  wrong: 'border-bad/30 border-l-bad bg-bad/5',
  dim: 'border-line border-l-line bg-surface opacity-55',
}

const KEY: Record<string, string> = {
  idle: 'border-line bg-sunken text-muted',
  picked: 'border-accent bg-accent text-white',
  correct: 'border-good bg-good text-white',
  wrong: 'border-bad bg-bad text-white',
  dim: 'border-line bg-sunken text-muted',
}

const LETTERS: Record<string, OptionKey> = {
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
  '5': 'E',
}

const EMPTY: Answer = { selected: null, struck: [] }
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`

/** On a fresh player launch, reshuffle only future unanswered slots. */
function shufflePending(items: string[], position: number, answers: Record<string, Answer>): string[] {
  const next = [...items]
  const slots: number[] = []
  for (let i = position + 1; i < next.length; i++) if (!answers[next[i]]?.selected) slots.push(i)
  const reordered = fisherYates(slots.map((index) => next[index]))
  slots.forEach((index, i) => { next[index] = reordered[i] })
  return next
}

export default function Player({ session, onExit, onReview, onRestart }: Props) {
  const { byId, state, recordAnswer, setConfidence, toggleFlag } = useStore()
  const { active, setActive, recordAttempt, rateConcept, recordHistory } = useLearning()
  const mode = session.mode
  const restored = active?.session.title === session.title && active.session.mode === session.mode
    && active.session.ids.join('|') === session.ids.join('|') ? active : null
  const [queue, setQueue] = useState(() => {
    const existing = (restored?.queue ?? session.ids).filter((id) => byId.has(id))
    return restored ? shufflePending(existing, restored.position, restored.answers) : fisherYates(existing)
  })
  const total = queue.length
  const [pos, setPos] = useState(Math.min(Math.max(restored?.position ?? 0, 0), Math.max(0, total - 1)))
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    if (restored) return restored.answers
    const init: Record<string, Answer> = {}
    if (session.prefill) for (const [id, sel] of Object.entries(session.prefill)) init[id] = { selected: sel, struck: [] }
    return init
  })
  const [ratings, setRatings] = useState<Record<string, Confidence>>(restored?.ratings ?? {})
  const [strikeMode, setStrikeMode] = useState(false)
  const [done, setDone] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const startedAt = useRef(restored ? Date.now() - Math.max(0, restored.updatedAt - restored.startedAt) : Date.now())
  const times = useRef<Record<string, number>>(restored?.times ?? {})
  const curId = useRef('')
  const dir = useRef(1)
  const submitted = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)

  const q = byId.get(queue[pos])
  curId.current = q?.id ?? ''
  const limit = total * (session.source?.kind === 'block' ? session.source.config.secondsPerQuestion ?? 90 : 90)
  const remaining = Math.max(0, limit - Math.floor((now - startedAt.current) / 1000))
  const ans: Answer = (q && answers[q.id]) || EMPTY
  const coverageMode = session.source?.kind === 'system' ? session.source.coverageMode : session.source?.kind === 'block' ? session.source.config.coverageMode : undefined
  const locked = mode === 'review' || (mode === 'tutor' && ans.selected !== null)
  const reveal = locked
  const answeredCount = queue.filter((id) => answers[id]?.selected).length
  const unansweredAhead = queue.slice(pos + 1).filter((id) => !answers[id]?.selected).length
  const streak = computeStreak(state.studyDates)

  function shuffleRemaining() {
    if (unansweredAhead < 2) return
    setQueue((previous) => {
      const slots: number[] = []
      const pending: string[] = []
      for (let i = pos + 1; i < previous.length; i++) {
        if (!answers[previous[i]]?.selected) {
          slots.push(i)
          pending.push(previous[i])
        }
      }
      const mixed = fisherYates(pending)
      const next = [...previous]
      slots.forEach((slot, i) => { next[slot] = mixed[i] })
      return next
    })
  }

  function restartSession() {
    if (answeredCount > 0 && !window.confirm('Start a new random session? This clears current session answers, but preserves saved progress.')) return
    onRestart()
  }

  useEffect(() => {
    if (done) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (curId.current) times.current[curId.current] = (times.current[curId.current] ?? 0) + 1
    }, 1000)
    return () => window.clearInterval(t)
  }, [done])

  useEffect(() => {
    if (done || mode === 'review') return
    const save = () => setActive({
      session, queue, position: pos, answers, ratings, times: { ...times.current },
      startedAt: startedAt.current, updatedAt: Date.now(),
    })
    save()
    const timer = window.setInterval(save, 10_000)
    document.addEventListener('visibilitychange', save)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', save) }
  }, [session, queue, pos, answers, ratings, mode, done, setActive])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    strip.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [pos, queue])

  function submit() {
    if (submitted.current) return
    submitted.current = true
    if (mode === 'exam') {
      for (const id of queue) {
        const a = answers[id]
        const qq = byId.get(id)
        if (a?.selected && qq) {
          const correct = a.selected === qq.correct_option
          recordAnswer(id, correct)
          recordAttempt(qq, correct, times.current[id] ?? 0, mode)
        }
      }
    }
    if (mode !== 'review') {
      const selections: Record<string, OptionKey | null> = {}
      let correct = 0; let answered = 0
      for (const id of queue) {
        const selected = answers[id]?.selected ?? null
        selections[id] = selected
        if (selected) answered++
        if (selected && selected === byId.get(id)?.correct_option) correct++
      }
      recordHistory({ title: session.title, mode, ids: [...queue], selections,
        times: { ...times.current }, elapsed: Math.floor((Date.now() - startedAt.current) / 1000),
        correct, answered })
    }
    setActive(null)
    setDone(true)
  }

  function finish() {
    if (mode === 'review') onExit()
    else submit()
  }

  function go(delta: number) {
    const np = pos + delta
    if (np < 0) return
    if (np >= total) {
      if (mode !== 'exam') finish()
      return
    }
    dir.current = delta
    setPos(np)
  }

  function choose(k: OptionKey) {
    if (!q || locked) return
    setAnswers((a) => ({ ...a, [q.id]: { selected: k, struck: a[q.id]?.struck ?? [] } }))
    setStrikeMode(false)
    if (mode === 'tutor') {
      const correct = k === q.correct_option
      recordAnswer(q.id, correct)
      recordAttempt(q, correct, times.current[q.id] ?? 0, mode)
    }
  }

  function strike(k: OptionKey) {
    if (!q || locked) return
    setAnswers((a) => {
      const cur = a[q.id] ?? EMPTY
      const struck = cur.struck.includes(k) ? cur.struck.filter((x) => x !== k) : [...cur.struck, k]
      return { ...a, [q.id]: { ...cur, struck } }
    })
  }

  function rate(level: Confidence) {
    if (q === undefined || mode === 'exam' || reveal === false) return
    setConfidence(q.id, level)
    rateConcept(q, level)
    setRatings((r) => ({ ...r, [q.id]: level }))
    go(1)
  }

  useEffect(() => {
    if (mode === 'exam' && !done && total > 0 && remaining <= 0) submit()
  })

  useEffect(() => {
    // Explicit coverage sessions must present their full selected queue, even if
    // progress previously marked an angle as skipped through "Easy".
    if (done || mode !== 'tutor' || !q || coverageMode !== undefined) return
    if (dir.current > 0 && !answers[q.id]?.selected && state.progress[q.id]?.status === 'skipped') go(1)
  }, [pos, state.progress, coverageMode])

  useEffect(() => {
    if (done) return
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey || !q) return
      const key = e.key.toLowerCase()

      if (reveal && key === 'x') {
        e.preventDefault()
        rate('easy')
        return
      }
      if (reveal && key === 'h') {
        e.preventDefault()
        rate('hard')
        return
      }
      if (reveal && key === 'g') {
        e.preventDefault()
        rate('good')
        return
      }

      if (key === 's' && !locked) {
        e.preventDefault()
        setStrikeMode((value) => !value)
        return
      }

      const k = LETTERS[key]
      if (k) {
        e.preventDefault()
        if (!optionKeysOf(q).includes(k)) return
        if (e.shiftKey) {
          if (/^[a-e]$/.test(key)) strike(k)
        } else choose(k)
        return
      }
      if (key === 'arrowright' || key === 'enter') {
        e.preventDefault()
        go(1)
      } else if (key === 'arrowleft') {
        e.preventDefault()
        go(-1)
      } else if (key === 'f') toggleFlag(q.id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (total === 0 || !q) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-8 text-center text-ink">
        <div className="space-y-4">
          <p className="text-sm text-muted">No questions in this block.</p>
          <button onClick={onExit} className={btnPrimary}>
            Back
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    const qs = queue.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
    return (
      <BlockReport
        questions={qs}
        answers={answers}
        times={times.current}
        mode={mode}
        elapsed={Math.floor((Date.now() - startedAt.current) / 1000)}
        onReview={onReview}
        onRestart={onRestart}
        onExit={onExit}
      />
    )
  }

  const keys = optionKeysOf(q)
  const flagged = state.flagged.includes(q.id)
  const isCorrectPick = ans.selected === q.correct_option
  const strikeHint = keys.length === 5 ? '1–5 / A–E to answer · S for strike mode' : '1–4 / A–D to answer · S for strike mode'
  const timerCls =
    remaining < 60
      ? 'animate-pulse border-amber-500 text-amber-600 dark:text-amber-400'
      : remaining < 300
        ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
        : 'border-line text-muted'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink">
      <header className="relative z-10 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] shadow-[0_12px_40px_-35px_rgba(0,0,0,.3)] backdrop-blur-xl">
        <div className="h-[2px] w-full bg-sunken">
          <motion.div className="h-full rounded-r-full bg-accent" animate={{ width: `${((pos + 1) / total) * 100}%` }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }} />
        </div>
        <div className="mx-auto flex h-[62px] max-w-4xl items-center gap-2 px-3 sm:px-5">
          <button onClick={onExit} aria-label="Exit block" className={`${iconBtn} border border-line bg-sunken`}>
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 pl-1 sm:pl-3"><p className="truncate text-[12px] font-semibold tracking-tight">{session.title}</p><p className="mt-0.5 truncate font-mono text-[10px] text-muted">Question {pad(pos + 1)} <span className="text-muted/50">/</span> {pad(total)} <span className="px-1 text-muted/40">·</span> {mode === 'exam' ? q.system : q.concept_name}</p></div>
          <span title="Daily study streak" className="hidden items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1.5 text-[11px] font-semibold text-muted sm:inline-flex"><Flame size={13} className="text-orange-500" /> {streak}d</span>
          {mode === 'exam' && (
            <span className={`rounded-lg border px-2.5 py-2 font-mono text-[11px] font-semibold tabular-nums ${timerCls}`}>
              {fmt(remaining)}
            </span>
          )}
          <button
            onClick={() => toggleFlag(q.id)}
            aria-label="Flag question"
            aria-pressed={flagged}
            className={`${iconBtn} ${flagged ? 'text-accent' : ''}`}
          >
            <Flag size={17} fill={flagged ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 pb-3 sm:px-5">
          <span className="mr-auto inline-flex min-w-0 items-center truncate rounded-lg border border-accent/15 bg-accent/8 px-2.5 py-1.5 text-[10px] font-semibold text-accent">
            {coverageMode === 'core_concepts' ? 'Complete Coverage · 1 per concept' : coverageMode === 'all' ? 'Full Bank · All angles' : mode === 'review' ? 'Review session' : 'Practice drill'}
          </span>
          <button type="button" aria-pressed={strikeMode} onClick={() => setStrikeMode((value) => !value)} title="Toggle strike mode (S)" disabled={locked} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-35 ${strikeMode ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:bg-sunken'}`}><Strikethrough size={14} /><span className="hidden sm:inline">Strike mode</span><span className="sm:hidden">S</span></button>
          <button
            type="button"
            onClick={shuffleRemaining}
            disabled={unansweredAhead < 2}
            aria-label="Shuffle Remaining"
            title="Shuffle remaining unanswered questions; keep this and answered questions in place"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-35"
          >
            <Shuffle size={13} /> <span className="hidden sm:inline">Shuffle Remaining</span><span className="sm:hidden">Shuffle</span>
          </button>
          <button
            type="button"
            onClick={restartSession}
            title="Restart with a new random question queue and fresh concept representatives"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <RotateCcw size={13} /> <span className="hidden sm:inline">New Random Session</span><span className="sm:hidden">Restart</span>
          </button>
        </div>
        <div ref={strip} aria-label="Question navigator" className="no-scrollbar mx-auto flex max-w-4xl gap-1.5 overflow-x-auto px-3 pb-3 sm:px-5">
          {queue.map((id, i) => {
            const a = answers[id]
            const qq = byId.get(id)
            let cls = 'text-muted hover:bg-sunken'
            if (a?.selected) {
              if (mode === 'exam') cls = 'bg-accent/15 text-accent'
              else cls = a.selected === qq?.correct_option ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'
            }
            const cur = i === pos
            return (
              <button
                key={id}
                data-active={cur}
                onClick={() => {
                  dir.current = i >= pos ? 1 : -1
                  setPos(i)
                }}
                className={`relative h-7 min-w-8 shrink-0 rounded-lg px-1.5 font-mono text-[10px] font-semibold tabular-nums transition-colors ${
                  cur ? 'bg-accent text-white shadow-sm' : cls
                }`}
              >
                {pad(i + 1)}
                {state.flagged.includes(id) && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
            )
          })}
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={q.id} initial={{ opacity: 0, x: dir.current > 0 ? 22 : -22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir.current > 0 ? -14 : 14 }} transition={{ duration: 0.15, ease: 'easeOut' }} className="mx-auto max-w-4xl space-y-5 px-4 py-6 pb-16 sm:px-5 sm:py-8">
          <article className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken/45 px-5 py-3 sm:px-7">
              <span className={`${label} flex items-center gap-2`}><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Clinical question / First Aid 36e</span>
              <span className="flex items-center gap-1.5">
                <span className={tag}>{q.system}</span>
                <span className={tag}>Tier {q.tier}</span>
              </span>
            </div>
            <p className="max-w-[76ch] px-5 py-7 font-reading text-[17px] leading-[1.9] tracking-[-.005em] sm:px-7 sm:py-9 sm:text-[18px]">{q.stem}</p>
          </article>

          <div className="space-y-2.5" role="group" aria-label="Answer options">
            {keys.map((k) => {
              const isCorrect = k === q.correct_option
              const picked = ans.selected === k
              const struck = ans.struck.includes(k)
              let tone = 'idle'
              if (reveal) tone = isCorrect ? 'correct' : picked ? 'wrong' : 'dim'
              else if (picked) tone = 'picked'
              return (
                <motion.div key={k} whileHover={!locked ? { x: 3 } : undefined} className="group relative">
                  <button
                    disabled={locked}
                    onClick={() => strikeMode ? strike(k) : choose(k)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      strike(k)
                    }}
                    className={`surface-card flex w-full items-start gap-4 rounded-xl border border-l-[3px] py-4 pl-4 pr-12 text-left transition-all ${TONE[tone]}`}
                  >
                    <span
                      className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs font-bold ${KEY[tone]}`}
                    >
                      {reveal && isCorrect ? <Check size={14} strokeWidth={3} /> : reveal && picked ? <X size={14} strokeWidth={3} /> : k}
                    </span>
                    <span className={`flex-1 text-[14px] leading-relaxed sm:text-[15px] ${struck && !reveal ? 'text-muted line-through decoration-bad/70 decoration-2' : ''}`}>
                      {optionText(q, k)}
                    </span>
                  </button>
                  {!locked && (
                    <button
                      onClick={() => strike(k)}
                      aria-label={`Strike through option ${k}`}
                      className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink md:opacity-40 md:group-hover:opacity-100 ${
                        struck ? 'bg-sunken text-ink md:opacity-100' : ''
                      }`}
                    >
                      <Strikethrough size={15} />
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>

          {reveal && (
            <div className="space-y-5 pb-6">
              <ExplanationSheet q={q} ans={ans} mode={mode} isCorrectPick={isCorrectPick} />
            </div>
          )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_-36px_rgba(0,0,0,.4)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-3 sm:px-5">
          <button onClick={() => go(-1)} disabled={pos === 0} aria-label="Previous question" className={`${iconBtn} border border-line bg-sunken`}>
            <ChevronLeft size={18} />
          </button>

          {mode === 'exam' ? (
            <>
              <span className="hidden font-mono text-xs tabular-nums text-muted sm:block">
                {answeredCount}/{total} answered
              </span>
              <button onClick={submit} className={`${btnPrimary} flex-1`}>
                End &amp; Grade Block
              </button>
            </>
          ) : reveal ? (
            <div role="group" className="flex flex-1 divide-x divide-line overflow-hidden rounded-xl border border-line bg-sunken/65">
              {RATINGS.map((r) => (
                <button
                  key={r.k}
                  onClick={() => rate(r.k)}
                  className={`flex flex-1 items-center justify-center gap-2 px-2 py-2.5 text-[12px] font-semibold transition-colors ${
                    ratings[q.id] === r.k ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken'
                  }`}
                >
                  <span className="sm:hidden">{r.short}</span>
                  <span className="hidden sm:inline">{r.full}</span>
                  <kbd className="kbd hidden md:inline-flex">{r.hot}</kbd>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="flex-1 text-center text-[11px] text-muted">{strikeMode ? 'Strike mode active · select options to cross out' : strikeHint}</p>
              {mode === 'tutor' && (
                <button onClick={finish} className={`${btnGhost} px-3 py-2 text-xs`}>
                  End Block
                </button>
              )}
            </>
          )}

          <button onClick={() => go(1)} disabled={mode === 'exam' && pos >= total - 1} aria-label="Next question" className={`${iconBtn} border border-line bg-sunken`}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="mx-auto hidden max-w-4xl items-center justify-center gap-4 border-t border-line/60 px-5 py-2 text-[10px] text-muted md:flex"><span><span className="kbd">A–E</span> Choose</span><span><span className="kbd">S</span> Strike mode</span><span><span className="kbd">↵</span> Next</span><span><span className="kbd">F</span> Flag</span><span>Right-click an option to strike through</span></div>
      </footer>
    </div>
  )
}
EOF

cat << 'EOF' > src/components/ProgressTab.tsx
import { ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Download, Moon, RotateCcw, Sun, Target, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { SYSTEMS } from '../lib/data'
import { progressExport, useLearning } from '../lib/learning'
import { navigate } from '../lib/nav'
import { conceptsMastered, dateKey, summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import { card, label } from '../lib/ui'
import { countConcepts } from '../lib/sessionBuilder'
import StudyJourney from './StudyJourney'

export default function ProgressTab() {
  const { questions, state, resetProgress, toggleTheme, todayCount } = useStore()
  const { attempts, settings, setSettings, clearLearningProgress, schedule } = useLearning()
  const sum = summarize(questions, state.progress)
  const accuracy = sum.attempts ? Math.round((sum.correct / sum.attempts) * 100) : 0
  const names = [...SYSTEMS]
  for (const q of questions) if (!names.some((name) => name.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
  const active = names
    .map((name) => ({ name, summary: summarize(questions.filter((q) => q.system.toLowerCase() === name.toLowerCase()), state.progress) }))
    .filter((item) => item.summary.total > 0)
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - 13 + index)
    const day = dateKey(date)
    const events = attempts.filter((a) => dateKey(new Date(a.at)) === day)
    return { day, label: date.toLocaleDateString(undefined, { weekday: 'short' }), total: events.length, correct: events.filter((a) => a.correct).length }
  })
  const maxDay = Math.max(1, ...days.map((day) => day.total))
  const averageTime = attempts.length ? Math.round(attempts.reduce((n, a) => n + a.seconds, 0) / attempts.length) : 0
  const dueNow = Object.values(schedule).filter((item) => item.dueAt <= Date.now()).length
  const daysUntilExam = settings.examDate ? Math.max(0, Math.ceil((new Date(`${settings.examDate}T12:00:00`).getTime() - Date.now()) / 86_400_000)) : null

  function reset() {
    if (window.confirm('Reset ALL question progress, flags, streak, sessions, history and flashcards? Personal notes and imported questions are kept. This cannot be undone. Export a backup first.')) {
      resetProgress()
      clearLearningProgress()
    }
  }

  return (
    <div className="space-y-9">
      <header><p className={`${label} flex items-center gap-2`}><BarChart3 size={13} className="text-accent" /> Your performance</p><h1 className="mt-2 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Learning insights<span className="text-accent">.</span></h1><p className="mt-1 text-[13px] text-muted">A clear view of where you are, and what comes next.</p></header>

      <section className={`${card} overflow-hidden`}>
        <div className="grid lg:grid-cols-[1fr_1.15fr]">
          <div className="relative overflow-hidden border-b border-line bg-[linear-gradient(135deg,var(--surface),var(--sunken))] p-7 lg:border-b-0 lg:border-r">
            <div className="fine-grid pointer-events-none absolute -right-8 -top-8 h-52 w-52 rounded-full opacity-30 [mask-image:radial-gradient(circle,black,transparent_75%)]" />
            <p className={label}>Overall accuracy</p>
            <p className="mt-5 text-[72px] font-semibold leading-none tracking-[-.08em] tabular-nums">{accuracy}<span className="ml-1 text-[32px] font-normal text-muted">%</span></p>
            <p className="mt-3 text-[12px] text-muted">{sum.correct.toLocaleString()} correct answers out of {sum.attempts.toLocaleString()} attempts</p>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted"><Target size={13} className="text-accent" /> Progress over perfection</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line">
            <Metric Icon={CheckCircle2} title="Mastered" value={sum.mastered} note="Questions secured" />
            <Metric Icon={Target} title="Remaining" value={sum.remaining} note="Questions to tackle" />
            <Metric Icon={ArrowUpRight} title="Marked easy" value={sum.skipped} note="Similar angles skipped" />
            <Metric Icon={RotateCcw} title="Needs review" value={sum.hard} note="Again / hard" />
          </div>
        </div>
      </section>

      <StudyJourney mastered={conceptsMastered(questions, state.progress)} total={countConcepts(questions)} today={todayCount} dailyGoal={Math.max(1, settings.dailyGoal)} compact />

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className={label}>Your rhythm</p><h2 className="mt-1 text-[18px] font-bold tracking-tight">Last 14 days</h2></div><span className="rounded-full bg-sunken px-2.5 py-1 font-mono text-[10px] text-muted">{attempts.length} tracked attempts</span></div>
          <div className="mt-8 grid h-32 grid-cols-14 items-end gap-1.5 sm:gap-2" role="img" aria-label="Fourteen day study question volume chart">
            {days.map((day) => <div key={day.day} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5" title={`${day.day}: ${day.total} attempted, ${day.correct} correct`}>
              <div className="flex w-full flex-1 items-end"><motion.div initial={{ height: 0 }} whileInView={{ height: `${Math.max(4, (day.total / maxDay) * 100)}%` }} viewport={{ once: true }} className={`w-full rounded-t-md ${day.total ? 'bg-accent/80' : 'bg-sunken'}`} /></div>
              <span className="hidden text-[9px] text-muted sm:block">{day.label.slice(0, 1)}</span>
            </div>)}
          </div>
          <p className="mt-3 text-[11px] text-muted">New sessions are tracked here. Older progress remains in your overall statistics above.</p>
        </div>
        <div className={`${card} flex flex-col justify-between p-5 sm:p-6`}>
          <div><p className={label}>Recall intelligence</p><h2 className="mt-1 text-[18px] font-bold tracking-tight">Your review outlook</h2></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-sunken p-4"><p className="text-[10px] text-muted">Concepts due</p><p className="mt-2 text-[30px] font-bold tabular-nums tracking-tight">{dueNow}</p></div>
            <div className="rounded-xl bg-sunken p-4"><p className="text-[10px] text-muted">Avg. seconds / Q</p><p className="mt-2 text-[30px] font-bold tabular-nums tracking-tight">{averageTime || '—'}</p></div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">Spacing intervals adapt when you rate an answer Again, Good or Easy.</p>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between"><div><p className={label}>By discipline</p><h2 className="mt-1.5 text-[22px] font-bold tracking-[-.04em]">System breakdown</h2></div><span className="font-mono text-[11px] text-muted">{active.length} active systems</span></div>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          {active.length === 0 && <p className="p-8 text-center text-[13px] text-muted">Start a study session to build your insights.</p>}
          {active.map(({ name, summary }) => <div key={name} className="px-5 py-4 transition-colors hover:bg-sunken/40 sm:px-6"><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-semibold">{name}</span><span className="font-mono text-[11px] tabular-nums text-muted">{summary.mastered + summary.skipped} / {summary.total} <span className="px-1 opacity-50">·</span> {summary.pct}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"><motion.div initial={{ width: 0 }} whileInView={{ width: `${summary.pct}%` }} viewport={{ once: true }} className="h-full rounded-full bg-accent" /></div></div>)}
        </div>
      </section>

      <section>
        <p className={`${label} mb-3`}>Workspace preferences</p>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Target size={17}/></span><span><span className="block text-[13px] font-semibold">Daily question goal</span><span className="mt-0.5 block text-[11px] text-muted">Adjust your personal target</span></span></span><input aria-label="Daily question goal" type="number" min={1} max={500} value={settings.dailyGoal} onChange={(e) => setSettings({ dailyGoal: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} className="w-20 rounded-lg border border-line bg-sunken px-3 py-2 text-center font-mono text-[12px] outline-none focus:border-accent" /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><CalendarDays size={17}/></span><span><span className="block text-[13px] font-semibold">Exam countdown</span><span className="mt-0.5 block text-[11px] text-muted">{daysUntilExam === null ? 'Add your exam date' : `${daysUntilExam} days to your exam`}</span></span></span><input aria-label="Exam date" type="date" value={settings.examDate} onChange={(e) => setSettings({ examDate: e.target.value })} className="rounded-lg border border-line bg-sunken px-3 py-2 text-[12px] outline-none focus:border-accent" /></div>
          <button onClick={progressExport} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Download size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Download progress backup</span><span className="mt-0.5 block text-[11px] text-muted">Includes existing progress, new study history and notes</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={toggleTheme} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted">{state.theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}</span><span className="flex-1"><span className="block text-[13px] font-semibold">Appearance</span><span className="mt-0.5 block text-[11px] text-muted">{state.theme === 'dark' ? 'Obsidian dark' : 'Daylight paper'}</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={() => navigate('/admin')} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Upload size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Manage question library</span><span className="mt-0.5 block text-[11px] text-muted">Import JSON files and review your catalog</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={reset} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-bad/5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-bad/10 text-bad"><RotateCcw size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold text-bad">Reset learning progress</span><span className="mt-0.5 block text-[11px] text-muted">Your imported questions remain safe</span></span><ChevronRight size={16} className="text-muted" /></button>
        </div>
      </section>
    </div>
  )
}

function Metric({ Icon, title, value, note }: { Icon: typeof Target; title: string; value: number; note: string }) {
  return <div className="bg-surface p-6"><div className="flex items-center gap-2 text-[11px] text-muted"><Icon size={14} /> {title}</div><p className="mt-3 text-[29px] font-bold tracking-[-.05em] tabular-nums">{value.toLocaleString()}</p><p className="mt-0.5 text-[10px] text-muted">{note}</p></div>
}
EOF

cat << 'EOF' > src/components/ReviewTab.tsx
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
      <header><p className={`${label} flex items-center gap-2`}><RotateCcw size={13} className="text-accent" /> Active recall / Review</p><h1 className="mt-2 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Strengthen your weak spots<span className="text-accent">.</span></h1><p className="mt-1 text-[13px] text-muted">Turn missed questions into permanent knowledge.</p></header>

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
EOF

cat << 'EOF' > src/components/StudyJourney.tsx
import { ArrowUpRight, Flag, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'
import { card, label } from '../lib/ui'

interface Props {
  mastered: number
  total: number
  today: number
  dailyGoal: number
  compact?: boolean
}

export default function StudyJourney({ mastered, total, today, dailyGoal, compact = false }: Props) {
  const id = useId().replace(/:/g, '')
  const pct = total ? Math.round((mastered / total) * 100) : 0
  const step = Math.min(100, Math.max(0, pct))
  const x = 56 + 7.06 * step
  const y = 225 - 1.49 * step

  return (
    <section className={`${card} journey-panel relative isolate overflow-hidden rounded-[26px] ${compact ? 'p-5 sm:p-7' : 'p-6 sm:p-8'}`}>
      <div className="pointer-events-none absolute inset-0 journey-dots opacity-50" />
      <div className={`relative grid items-center gap-4 ${compact ? 'lg:grid-cols-[.8fr_1.2fr]' : 'lg:grid-cols-[.7fr_1.3fr]'}`}>
        <div className="z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d2c3fc]/70 bg-[#f0eafa] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#61579c] dark:border-[#6b598e]/45 dark:bg-[#292436] dark:text-[#c8b5ff]"><Sparkles size={12} /> The study journey</span>
          <p className={`${label} mt-5`}>First Aid concepts secured</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-[68px] font-extrabold leading-none tracking-[-.09em] tabular-nums sm:text-[80px]">{mastered}</span>
            <span className="pb-2 font-mono text-[14px] text-muted">/ {total}</span>
          </div>
          <p className="mt-3 max-w-[25ch] text-[13px] leading-[1.7] text-muted">Little steps make big progress. Your next milestone is waiting.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-line bg-surface/75 px-3 py-1.5 text-ink">{pct}% of the map explored</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/75 px-3 py-1.5 text-muted"><Flag size={12} /> {today}/{dailyGoal} today</span>
          </div>
        </div>

        <div className="relative min-w-0" role="img" aria-label={`Illustrated study journey showing ${pct}% of concepts mastered`}>
          <svg viewBox="0 0 820 275" className="w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dde9f4" stopOpacity=".7" /><stop offset="1" stopColor="#fff5e7" stopOpacity=".28" /></linearGradient>
              <linearGradient id={`${id}-hill`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bad9c3" /><stop offset="1" stopColor="#8fc7bc" /></linearGradient>
              <linearGradient id={`${id}-road`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#d8b3af" /><stop offset="1" stopColor="#9c8bd4" /></linearGradient>
            </defs>
            <rect x="0" y="3" width="820" height="260" rx="38" fill={`url(#${id}-sky)`} opacity=".7" />
            <circle cx="715" cy="55" r="36" fill="#ffdaa1" opacity=".7" />
            <circle cx="715" cy="55" r="52" fill="#ffdaa1" opacity=".14" />
            <path d="M0 177 Q130 90 247 176 Q352 105 462 163 Q635 40 820 159 V275 H0Z" fill="#c9c5eb" opacity=".55" />
            <path d="M0 220 Q124 146 235 206 Q354 142 490 196 Q624 136 820 178 V275 H0Z" fill={`url(#${id}-hill)`} opacity=".85" />
            <path d="M0 252 Q176 206 337 247 Q500 199 662 221 Q743 231 820 206 V275 H0Z" fill="#8ec2b0" opacity=".45" />

            <path d="M50 225 C180 228 200 172 300 174 S460 164 535 126 S680 100 765 72" fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" opacity=".72" />
            <path d="M50 225 C180 228 200 172 300 174 S460 164 535 126 S680 100 765 72" fill="none" stroke="#b6add5" strokeWidth="5" strokeLinecap="round" strokeDasharray="3 15" opacity=".9" />
            <motion.path d="M50 225 C180 228 200 172 300 174 S460 164 535 126 S680 100 765 72" fill="none" stroke={`url(#${id}-road)`} strokeWidth="8" strokeLinecap="round" pathLength={100} strokeDasharray="100" animate={{ strokeDashoffset: 100 - step }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} />

            {([25, 50, 75] as const).map((marker, i) => (
              <g key={marker} transform={`translate(${[224, 402, 587][i]},${[194, 160, 107][i]})`}>
                <circle r="12" fill={step >= marker ? '#887ac2' : '#fff'} stroke={step >= marker ? '#fff' : '#aca3d3'} strokeWidth="3" />
                <text y="4" textAnchor="middle" fontSize="9" fontWeight="bold" fill={step >= marker ? '#fff' : '#746993'}>{marker}</text>
              </g>
            ))}

            <g transform="translate(770,65)">
              <path d="M0 0 V-38" stroke="#695a75" strokeWidth="4" strokeLinecap="round" />
              <path d="M2 -38 L49 -31 L2 -17Z" fill="#fa887b" />
              <path d="M6 -33 H29" stroke="#fff" strokeWidth="2" opacity=".6" />
              <ellipse cy="5" rx="15" ry="5" fill="#697a8c" opacity=".17" />
            </g>

            <g transform="translate(125,187)"><path d="M0 12 Q-8 -19 0 -39" fill="none" stroke="#648c79" strokeWidth="4" /><path d="M0 -27 Q-24 -31 -18 -48 Q-4 -50 0 -27M0 -12 Q21 -28 18 -42 Q3 -35 0 -12" fill="#80b798"/><circle cy="-49" r="5" fill="#f7b6a7" /></g>
            <g transform="translate(680,167)"><path d="M0 14 V-32" stroke="#5d836e" strokeWidth="4" /><path d="M0 -26 Q-23 -44 -25 -22 Q-7 -10 0 -26 M0 -15 Q21 -30 24 -13 Q7 0 0 -15" fill="#78a989" /><circle cy="-39" r="7" fill="#e5a4bb" /></g>

            <motion.g animate={{ x: 0, y: 0 }}>
              <g transform={`translate(${x},${y - 10})`} className="journey-walker">
                <ellipse cx="0" cy="17" rx="22" ry="6" fill="#334c58" opacity=".18" />
                <g className="journey-leg-a"><path d="M-6 -16 L-11 10 L-21 14" fill="none" stroke="#333951" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><path d="M-22 13 h-11" stroke="#f5f1e7" strokeWidth="7" strokeLinecap="round" /></g>
                <g className="journey-leg-b"><path d="M4 -16 L12 10 L26 14" fill="none" stroke="#333951" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><path d="M25 13 h12" stroke="#f5f1e7" strokeWidth="7" strokeLinecap="round" /></g>
                <g className="journey-body"><rect x="-15" y="-54" width="32" height="43" rx="12" fill="#7d75b1" /><path d="M-12 -45 Q0 -39 14 -43" fill="none" stroke="#c8b9ec" strokeWidth="3" /><rect x="-24" y="-49" width="13" height="28" rx="6" fill="#e4a180" /><path d="M-18 -27 L-19 -12" stroke="#d69575" strokeWidth="7" strokeLinecap="round" /></g>
                <g className="journey-arm"><path d="M15 -47 L26 -33 L20 -18" fill="none" stroke="#e4a180" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><rect x="12" y="-31" width="20" height="16" rx="3" fill="#f2cd79" transform="rotate(-11 22 -24)" /><path d="M18 -29 V-19" stroke="#fff" strokeWidth="1.5" /></g>
                <path d="M-15 -47 Q-30 -35 -25 -17" fill="none" stroke="#514c7c" strokeWidth="8" strokeLinecap="round" />
                <circle cy="-72" r="17" fill="#e5aa89" /><path d="M-17 -77 Q-17 -96 0 -95 Q18 -97 18 -77 L10 -84 L-5 -82 L-13 -75Z" fill="#3f4053" /><path d="M-17 -82 Q-12 -102 6 -96 Q18 -91 18 -82" fill="#3f4053" /><circle cx="6" cy="-73" r="1.8" fill="#38374b" /><path d="M5 -66 Q10 -62 14 -68" fill="none" stroke="#ad6c65" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M-8 -54 L2 -49 L11 -54" fill="#fff2e6" />
              </g>
            </motion.g>
          </svg>
          <div className="absolute bottom-1 right-2 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-[#615e80] shadow-sm backdrop-blur-sm dark:border-[#646276]/40 dark:bg-[#262735]/80 dark:text-[#d9d4f4]">Your next milestone <ArrowUpRight size={12} /></div>
        </div>
      </div>
    </section>
  )
}
EOF

cat << 'EOF' > src/components/StudyTab.tsx
import { ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, Flame, Layers3, Play, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { quickPick } from '../lib/blocks'
import { SYSTEMS } from '../lib/data'
import { getIcon } from '../lib/meta'
import { dueConceptQuestions, useLearning } from '../lib/learning'
import { buildSystemSession, countConcepts } from '../lib/sessionBuilder'
import { computeStreak, conceptsMastered, summarize, weakQuestions } from '../lib/stats'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, iconBtn, label } from '../lib/ui'
import type { CoverageMode, SessionMode, SessionSource } from '../types/qbank'
import BlockBuilder from './BlockBuilder'
import CoverageSelector from './CoverageSelector'
import StudyJourney from './StudyJourney'

interface Props {
  onStart: (ids: string[], title: string, mode?: SessionMode, source?: SessionSource) => void
  onResume: () => void
  hasSavedSession: boolean
}

export default function StudyTab({ onStart, onResume, hasSavedSession }: Props) {
  const { questions, state, todayCount } = useStore()
  const { schedule, settings } = useLearning()
  const dailyGoal = Math.max(1, settings.dailyGoal)
  const [builder, setBuilder] = useState(false)
  const [launcher, setLauncher] = useState<string | null>(null)
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('core_concepts')
  const { progress } = state

  const overall = summarize(questions, progress)
  const mastered = conceptsMastered(questions, progress)
  const totalConcepts = useMemo(() => countConcepts(questions), [questions])
  const due = useMemo(() => new Set([...dueConceptQuestions(questions, schedule, progress), ...weakQuestions(questions, progress, state.flagged)].map((q) => q.id)).size, [questions, schedule, progress, state.flagged])
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

      <StudyJourney mastered={mastered} total={totalConcepts} today={todayCount} dailyGoal={dailyGoal} />

      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <section className={`${card} relative overflow-hidden bg-[linear-gradient(135deg,var(--surface),var(--sunken))] p-6 sm:p-8`}>
          <div className="fine-grid pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full opacity-35 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-accent"><Sparkles size={12} /> Ready when you are</div>
            <h2 className="mt-5 max-w-md text-[26px] font-bold leading-[1.13] tracking-[-.06em] sm:text-[34px]">Your next best session<span className="text-accent">.</span></h2>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">Build real recall with one small daily win. Keep your streak moving and your First Aid roadmap growing.</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {hasSavedSession && <button onClick={onResume} className={btnPrimary}><RotateCcw size={15} /> Resume saved session</button>}
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
EOF

cat << 'EOF' > src/index.css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --canvas: #faf9f6;
  --surface: #ffffff;
  --sunken: #f3f2ef;
  --line: #e9e7e2;
  --ink: #18202d;
  --muted: #737b88;
  --accent: #5161d5;
  --good: #07856b;
  --bad: #d14e56;
  --shadow-card: 0 1px 2px rgba(36, 41, 59, .035), 0 14px 40px -26px rgba(36, 41, 59, .18);
  --shadow-float: 0 24px 70px -28px rgba(32, 40, 67, .25);
}

.dark {
  --canvas: #0b0d11;
  --surface: #13161c;
  --sunken: #1b2029;
  --line: #29303a;
  --ink: #eff1f6;
  --muted: #9ba4b2;
  --accent: #8997ff;
  --good: #5bd4ae;
  --bad: #ff9296;
  --shadow-card: inset 0 1px rgba(255, 255, 255, .045), 0 14px 44px -30px rgba(0, 0, 0, .75);
  --shadow-float: 0 26px 90px -26px rgba(0, 0, 0, .88);
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-sunken: var(--sunken);
  --color-line: var(--line);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-good: var(--good);
  --color-bad: var(--bad);
  --font-sans: "Inter", "Geist", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --font-reading: "Charter", "Iowan Old Style", "Source Serif Pro", Georgia, serif;
}

html {
  color-scheme: light;
  -webkit-tap-highlight-color: transparent;
}
html.dark {
  color-scheme: dark;
}
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "ss01" on, "cv11" on;
  min-height: 100vh;
  background-image: radial-gradient(ellipse 65% 28% at 50% -8%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 90%);
  overscroll-behavior-y: contain;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}
button, input { -webkit-tap-highlight-color: transparent; }
::selection { background: color-mix(in srgb, var(--accent) 20%, transparent); }
:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 75%, white);
  outline-offset: 3px;
}

.surface-card { box-shadow: var(--shadow-card); }
.surface-float { box-shadow: var(--shadow-float); }
.surface-highlight { box-shadow: inset 0 1px rgba(255,255,255,.055), var(--shadow-card); }
.fine-grid {
  background-image: radial-gradient(color-mix(in srgb, var(--muted) 16%, transparent) .65px, transparent .65px);
  background-size: 17px 17px;
}
.study-shell { isolation: isolate; }
.journey-panel { background: linear-gradient(120deg, #fff9ec, #fff9f6 40%, #f4f1ff); }
.dark .journey-panel { background: linear-gradient(125deg, #211e2b, #1c2229 48%, #202438); }
.journey-dots { background-image: radial-gradient(#bba4d9 0.8px, transparent 0.8px); background-size: 23px 23px; mask-image: linear-gradient(to right, transparent 10%, black); }
.journey-walker { filter: drop-shadow(0 7px 4px #33394522); animation: journey-bob .42s ease-in-out infinite alternate; }
.journey-leg-a { transform-origin: 0 -15px; animation: journey-step .72s ease-in-out infinite alternate; }
.journey-leg-b { transform-origin: 0 -15px; animation: journey-step .72s ease-in-out infinite alternate-reverse; }
.journey-arm { transform-origin: 14px -47px; animation: journey-step .72s ease-in-out infinite alternate-reverse; }
@keyframes journey-bob { from { translate: 0 1px; } to { translate: 0 -3px; } }
@keyframes journey-step { from { rotate: -12deg; } to { rotate: 12deg; } }
.kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 19px; height: 19px; padding: 0 4px;
  border: 1px solid var(--line); border-radius: 5px;
  background: var(--sunken); color: var(--muted);
  font-family: var(--font-mono); font-size: 10px; font-weight: 550;
}

@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.animate-fade { animation: fade 160ms ease-out both; }
.animate-rise { animation: rise 200ms ease-out both; }

.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }

@media (prefers-reduced-motion: reduce) {
  .animate-fade, .animate-rise { animation: none; }
  .journey-walker, .journey-leg-a, .journey-leg-b, .journey-arm { animation: none; }
  *, *::before, *::after { scroll-behavior: auto !important; }
}
EOF

cat << 'EOF' > src/lib/blocks.ts
import type { BlockConfig, PersistedState, Question } from '../types/qbank'
import { fisherYates, selectSessionQuestions } from './sessionBuilder'

export const shuffle = fisherYates

export function eligible(
  questions: Question[],
  cfg: Pick<BlockConfig, 'filter' | 'systems'> & Partial<Pick<BlockConfig, 'tier' | 'angle'>>,
  state: PersistedState,
): Question[] {
  return questions.filter((q) => {
    if (cfg.systems.length && !cfg.systems.includes(q.system.toLowerCase())) return false
    if (cfg.tier && cfg.tier !== 'all' && String(q.tier) !== cfg.tier) return false
    if (cfg.angle && cfg.angle !== 'all' && q.angle !== cfg.angle) return false
    const p = state.progress[q.id]
    switch (cfg.filter) {
      case 'unanswered':
        return (!p || p.attempts === 0) && p?.status !== 'skipped'
      case 'incorrect':
        return !!p && (p.status === 'hard' || p.lastCorrect === false)
      case 'flagged':
        return state.flagged.includes(q.id)
      default:
        return true
    }
  })
}

export function buildBlock(questions: Question[], cfg: BlockConfig, state: PersistedState): Question[] {
  const pool = selectSessionQuestions(eligible(questions, cfg, state), cfg.coverageMode, state.progress)
  return cfg.size > 0 ? pool.slice(0, cfg.size) : pool
}

export function quickPick(questions: Question[], state: PersistedState, n = 10): string[] {
  const fresh: Question[] = []
  const weak: Question[] = []
  const rest: Question[] = []
  for (const q of questions) {
    const p = state.progress[q.id]
    if (p?.status === 'skipped') continue
    if (!p || p.attempts === 0) fresh.push(q)
    else if (p.status === 'hard' || p.lastCorrect === false) weak.push(q)
    else if (p.status !== 'mastered') rest.push(q)
  }
  let picked = [...shuffle(fresh), ...shuffle(weak), ...shuffle(rest)]
  if (!picked.length) picked = shuffle(questions.filter((q) => state.progress[q.id]?.status !== 'skipped'))
  return picked.slice(0, n).map((q) => q.id)
}
EOF

cat << 'EOF' > src/lib/learning.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { conceptKey, selectSessionQuestions } from './sessionBuilder'
import type { Answer, Confidence, OptionKey, Progress, Question, Session, SessionMode } from '../types/qbank'

export const LEARNING_KEY = 'fp:learning:v1'
const DAY = 86_400_000

export interface ReviewItem {
  dueAt: number
  intervalDays: number
  repetitions: number
  lastReviewed: number
}

export interface AttemptEvent {
  id: string
  at: number
  correct: boolean
  seconds: number
  mode: SessionMode
}

export interface HistoryEntry {
  id: string
  title: string
  completedAt: number
  mode: SessionMode
  ids: string[]
  selections: Record<string, OptionKey | null>
  times: Record<string, number>
  elapsed: number
  correct: number
  answered: number
}

export interface ActiveSession {
  session: Session
  queue: string[]
  position: number
  answers: Record<string, Answer>
  ratings: Record<string, Confidence>
  times: Record<string, number>
  startedAt: number
  updatedAt: number
}

export interface StudyNote { text: string; updatedAt: number }
export interface Flashcard {
  id: string
  questionId: string
  front: string
  back: string
  dueAt: number
  intervalDays: number
  reviews: number
}

export interface LearningSettings {
  dailyGoal: number
  examDate: string
}

export interface LearningState {
  schedule: Record<string, ReviewItem>
  attempts: AttemptEvent[]
  history: HistoryEntry[]
  active: ActiveSession | null
  notes: Record<string, StudyNote>
  flashcards: Flashcard[]
  settings: LearningSettings
}

function defaults(): LearningState {
  return {
    schedule: {}, attempts: [], history: [], active: null,
    notes: {}, flashcards: [], settings: { dailyGoal: 20, examDate: '' },
  }
}

function load(): LearningState {
  const fallback = defaults()
  try {
    const value = JSON.parse(localStorage.getItem(LEARNING_KEY) || 'null') as Partial<LearningState> | null
    if (!value || typeof value !== 'object') return fallback
    return {
      schedule: value.schedule && typeof value.schedule === 'object' ? value.schedule : {},
      attempts: Array.isArray(value.attempts) ? value.attempts : [],
      history: Array.isArray(value.history) ? value.history : [],
      active: value.active?.session && Array.isArray(value.active.queue) ? value.active : null,
      notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
      flashcards: Array.isArray(value.flashcards) ? value.flashcards : [],
      settings: { ...fallback.settings, ...value.settings },
    }
  } catch { return fallback }
}

interface LearningContextValue extends LearningState {
  setActive: (snapshot: ActiveSession | null) => void
  recordAttempt: (q: Question, correct: boolean, seconds: number, mode: SessionMode) => void
  rateConcept: (q: Question, rating: Confidence) => void
  recordHistory: (entry: Omit<HistoryEntry, 'id' | 'completedAt'>) => void
  saveNote: (id: string, text: string) => void
  addFlashcard: (question: Question) => void
  gradeFlashcard: (id: string, rating: Confidence) => void
  setSettings: (settings: Partial<LearningSettings>) => void
  clearLearningProgress: () => void
}

const Context = createContext<LearningContextValue | null>(null)

export function LearningProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LearningState>(load)

  useEffect(() => {
    try { localStorage.setItem(LEARNING_KEY, JSON.stringify(data)) }
    catch (error) { console.error('[FirstPass] Could not save extended learning data', error) }
  }, [data])

  const setActive = useCallback((snapshot: ActiveSession | null) => {
    setData((s) => ({ ...s, active: snapshot }))
  }, [])

  const recordAttempt = useCallback((q: Question, correct: boolean, seconds: number, mode: SessionMode) => {
    const now = Date.now()
    setData((s) => {
      const key = conceptKey(q)
      const prev = s.schedule[key]
      const intervalDays = correct ? Math.max(3, prev?.intervalDays ?? 3) : 1
      return {
        ...s,
        attempts: [...s.attempts.slice(-14_999), { id: q.id, at: now, correct, seconds: Math.max(0, seconds), mode }],
        schedule: {
          ...s.schedule,
          [key]: { dueAt: now + intervalDays * DAY, intervalDays,
            repetitions: correct ? (prev?.repetitions ?? 0) + 1 : 0, lastReviewed: now },
        },
      }
    })
  }, [])

  const rateConcept = useCallback((q: Question, rating: Confidence) => {
    const now = Date.now()
    setData((s) => {
      const key = conceptKey(q)
      const prev = s.schedule[key]
      const intervalDays = rating === 'hard' ? 1 : rating === 'good'
        ? Math.min(90, prev?.repetitions ? Math.max(3, Math.round(prev.intervalDays * 2)) : 3)
        : Math.min(120, prev?.repetitions ? Math.max(7, Math.round(prev.intervalDays * 2.5)) : 7)
      return { ...s, schedule: { ...s.schedule, [key]: {
        dueAt: now + intervalDays * DAY, intervalDays,
        repetitions: rating === 'hard' ? 0 : (prev?.repetitions ?? 0) + 1,
        lastReviewed: now,
      } } }
    })
  }, [])

  const recordHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'completedAt'>) => {
    setData((s) => ({ ...s, history: [{ ...entry, id: crypto.randomUUID(), completedAt: Date.now() }, ...s.history].slice(0, 120) }))
  }, [])

  const saveNote = useCallback((id: string, value: string) => {
    setData((s) => ({ ...s, notes: { ...s.notes, [id]: { text: value, updatedAt: Date.now() } } }))
  }, [])

  const addFlashcard = useCallback((q: Question) => {
    setData((s) => {
      if (s.flashcards.some((c) => c.questionId === q.id)) return s
      return { ...s, flashcards: [...s.flashcards, {
        id: crypto.randomUUID(), questionId: q.id, front: q.concept_name,
        back: q.high_yield_pearl, dueAt: Date.now(), intervalDays: 0, reviews: 0,
      }] }
    })
  }, [])

  const gradeFlashcard = useCallback((id: string, rating: Confidence) => {
    setData((s) => ({ ...s, flashcards: s.flashcards.map((c) => {
      if (c.id !== id) return c
      const intervalDays = rating === 'hard' ? 1 : rating === 'good'
        ? Math.max(3, Math.round(c.intervalDays * 2))
        : Math.max(7, Math.round(c.intervalDays * 2.5))
      return { ...c, intervalDays, reviews: c.reviews + 1, dueAt: Date.now() + intervalDays * DAY }
    }) }))
  }, [])

  const setSettings = useCallback((settings: Partial<LearningSettings>) => {
    setData((s) => ({ ...s, settings: { ...s.settings, ...settings } }))
  }, [])

  const clearLearningProgress = useCallback(() => {
    setData((s) => ({ ...s, schedule: {}, attempts: [], history: [], active: null, flashcards: [] }))
  }, [])

  const value = useMemo(() => ({ ...data, setActive, recordAttempt, rateConcept,
    recordHistory, saveNote, addFlashcard, gradeFlashcard, setSettings, clearLearningProgress }),
  [data, setActive, recordAttempt, rateConcept, recordHistory, saveNote, addFlashcard, gradeFlashcard, setSettings, clearLearningProgress])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLearning(): LearningContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('useLearning must be inside LearningProvider')
  return context
}

export function dueConceptQuestions(questions: Question[], schedule: Record<string, ReviewItem>, progress: Record<string, Progress>): Question[] {
  const now = Date.now()
  const pool = questions.filter((q) => schedule[conceptKey(q)]?.dueAt <= now)
  return selectSessionQuestions(pool, 'core_concepts', progress)
}

export function progressExport(): void {
  const keys = ['fp:state:v1', 'fp:imported:v1', 'fp:daily:v1', 'ui_theme', LEARNING_KEY]
  const payload: Record<string, string | null> = {}
  for (const key of keys) payload[key] = localStorage.getItem(key)
  const blob = new Blob([JSON.stringify({ app: 'FirstPass Q-Bank', version: 2, exportedAt: new Date().toISOString(), storage: payload }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `firstpass-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
EOF

cat << 'EOF' > src/lib/stats.ts
import type { Progress, Question } from '../types/qbank'
import { conceptKey } from './sessionBuilder'

export function dateKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function computeStreak(dates: string[]): number {
  const set = new Set(dates)
  const cursor = new Date()
  if (!set.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!set.has(dateKey(cursor))) return 0
  }
  let n = 0
  while (set.has(dateKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

export interface Summary {
  total: number
  mastered: number
  skipped: number
  hard: number
  remaining: number
  attempts: number
  correct: number
  pct: number
}

export function summarize(qs: Question[], progress: Record<string, Progress>): Summary {
  let mastered = 0,
    skipped = 0,
    hard = 0,
    attempts = 0,
    correct = 0
  for (const q of qs) {
    const p = progress[q.id]
    if (!p) continue
    attempts += p.attempts
    correct += p.correct
    if (p.status === 'mastered') mastered++
    else if (p.status === 'skipped') skipped++
    else if (p.status === 'hard') hard++
  }
  const total = qs.length
  return {
    total,
    mastered,
    skipped,
    hard,
    remaining: total - mastered - skipped,
    attempts,
    correct,
    pct: total ? Math.round(((mastered + skipped) / total) * 100) : 0,
  }
}

export function conceptsMastered(qs: Question[], progress: Record<string, Progress>): number {
  const groups = new Map<string, Question[]>()
  for (const q of qs) {
    const k = conceptKey(q)
    groups.set(k, [...(groups.get(k) ?? []), q])
  }
  let n = 0
  groups.forEach((list) => {
    const st = list.map((q) => progress[q.id]?.status)
    // Coverage mode deliberately samples one angle per concept. A single
    // confidently mastered representative secures that concept on the map.
    if (st.some((s) => s === 'mastered')) n++
  })
  return n
}

export function weakQuestions(qs: Question[], progress: Record<string, Progress>, flagged: string[]): Question[] {
  return qs.filter((q) => {
    const p = progress[q.id]
    return flagged.includes(q.id) || p?.status === 'hard' || (!!p && p.lastCorrect === false && p.status !== 'mastered')
  })
}
EOF

cat << 'EOF' > src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App'
import { StoreProvider } from './lib/store'
import { LearningProvider } from './lib/learning'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}>
      <StoreProvider>
        <LearningProvider><App /></LearningProvider>
      </StoreProvider>
    </MotionConfig>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
EOF

cat << 'EOF' > src/types/qbank.ts
export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E'
export const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E']

export interface DistractorExplanation {
  reason: string
  fa_page: number
}

export interface RawQuestion {
  system: string
  concept_id: string
  concept_name: string
  tier: string | number
  angle: string
  stem: string
  option_A: string
  option_B: string
  option_C: string
  option_D: string
  option_E?: string
  correct_option: OptionKey
  correct_explanation: string
  correct_fa_page: number
  distractor_explanations: Record<'A' | 'B' | 'C' | 'D', DistractorExplanation> & {
    E?: DistractorExplanation
  }
  high_yield_pearl: string
  /** Optional multi-line Markdown-style First Aid topic summary (bullets, **bold**, "Heading:" lines). */
  topic_overview?: string
}

export interface Question extends RawQuestion {
  id: string
}

export type Status = 'mastered' | 'hard' | 'skipped'
export type Confidence = 'hard' | 'good' | 'easy'
export type Theme = 'light' | 'dark'

export interface Progress {
  status?: Status
  attempts: number
  correct: number
  wrong: number
  lastCorrect?: boolean
  lastAt?: number
}

export interface PersistedState {
  progress: Record<string, Progress>
  flagged: string[]
  studyDates: string[]
  theme: Theme
}

export type SessionMode = 'tutor' | 'exam' | 'review'
export type FilterKey = 'all' | 'unanswered' | 'incorrect' | 'flagged'
export type CoverageMode = 'core_concepts' | 'all'

export type SessionSource =
  | { kind: 'system'; system: string; coverageMode: CoverageMode }
  | { kind: 'block'; config: BlockConfig }

export interface Session {
  ids: string[]
  title: string
  mode: SessionMode
  prefill?: Record<string, OptionKey>
  source?: SessionSource
}

export interface BlockConfig {
  mode: 'tutor' | 'exam'
  filter: FilterKey
  systems: string[]
  size: number
  coverageMode: CoverageMode
  tier?: string
  angle?: string
  secondsPerQuestion?: number
}

export interface Answer {
  selected: OptionKey | null
  struck: OptionKey[]
}
EOF

echo "Installing finished. Running TypeScript and Vite verification..."
npm run build
