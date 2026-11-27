import { ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Download, RotateCcw, Target } from 'lucide-react'
import { progressExport, useLearning } from '../lib/learning'
import { conceptsMastered, summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import { card, label } from '../lib/ui'
import { countConcepts } from '../lib/sessionBuilder'
import { useAuth } from '../lib/auth'
import AdaptivePanel from './AdaptivePanel'
import PerformancePanel from './PerformancePanel'

export default function ProgressTab() {
  const { questions, state, todayCount } = useStore()
  const { settings, schedule } = useLearning()
  const sum = summarize(questions, state.progress)
  const accuracy = sum.attempts ? Math.round((sum.correct / sum.attempts) * 100) : 0
  const dueNow = Object.values(schedule).filter((item) => item.dueAt <= Date.now()).length
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className={`${label} flex items-center gap-2`}><BarChart3 size={13} className="text-accent" /> Your performance</p><h1 className="mt-2 font-display text-[28px] tracking-[-.055em] sm:text-[36px]">Learning insights<span className="text-accent">.</span></h1><p className="mt-1 text-[13px] text-muted">A clear view of where you are, and what comes next.</p></div></header>

      <section className={`${card} overflow-hidden`}>
        <div className="grid lg:grid-cols-[1fr_1.15fr]">
          <div className="relative overflow-hidden border-b border-line bg-[linear-gradient(135deg,var(--surface),var(--sunken))] p-5 lg:border-b-0 lg:border-r">
            <div className="fine-grid pointer-events-none absolute -right-8 -top-8 h-52 w-52 rounded-full opacity-30 [mask-image:radial-gradient(circle,black,transparent_75%)]" />
            <p className={label}>Overall accuracy</p>
            <p className="mt-5 text-[48px] font-semibold leading-none tracking-[-.08em] tabular-nums">{accuracy}<span className="ml-1 text-[32px] font-normal text-muted">%</span></p>
            <p className="mt-3 text-[12px] text-muted">{sum.correct.toLocaleString()} correct answers out of {sum.attempts.toLocaleString()} attempts</p>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted"><Target size={13} className="text-accent" /> Progress over perfection</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line">
            <Metric Icon={CheckCircle2} title="Marked confident" value={sum.mastered} note="Questions rated Good or Easy" />
            <Metric Icon={Target} title="Remaining" value={sum.remaining} note="Questions to tackle" />
            <Metric Icon={ArrowUpRight} title="Marked easy" value={sum.skipped} note="Similar angles skipped" />
            <Metric Icon={RotateCcw} title="Needs review" value={sum.hard} note="Again / hard" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className={`${card} p-5`}><p className={label}>Confidence-secured concepts</p><p className="mt-3 font-display text-[36px] tabular-nums">{conceptsMastered(questions, state.progress)} <span className="font-sans text-[12px] text-muted">/ {countConcepts(questions)}</span></p></div><div className={`${card} p-5`}><p className={label}>Questions today</p><p className="mt-3 font-display text-[36px] tabular-nums">{todayCount} <span className="font-sans text-[12px] text-muted">/ {settings.dailyGoal}</span></p></div><div className={`${card} col-span-2 p-5 sm:col-span-1`}><p className={label}>Review ready</p><p className="mt-3 font-display text-[36px] tabular-nums">{dueNow} <span className="font-sans text-[12px] text-muted">concepts</span></p></div></section>

      <details className={`${card} p-4`}><summary className="cursor-pointer font-semibold text-accent">Concept mastery · view details</summary><div className="mt-4"><AdaptivePanel/></div></details>
      <details className={`${card} p-4`}><summary className="cursor-pointer font-semibold text-accent">Advanced analytics · readiness, trends and timing</summary><div className="mt-4"><PerformancePanel /></div></details>


    </div>
  )
}

export function WorkspacePreferences() {
  const { user } = useAuth()
  const { resetProgress } = useStore()
  const { settings, setSettings, clearLearningProgress } = useLearning()
  const daysUntilExam = settings.examDate ? Math.max(0, Math.ceil((new Date(`${settings.examDate}T12:00:00`).getTime() - Date.now()) / 86_400_000)) : null

  function reset() {
    if (window.confirm('Reset ALL question progress, flags, streak, sessions, history and flashcards? Personal notes and imported questions are kept. This cannot be undone. Export a backup first.')) {
      resetProgress()
      clearLearningProgress()
    }
  }

  return <div className="mx-auto max-w-3xl space-y-4"><h1 className="font-display text-3xl font-bold">Workspace preferences</h1>
      <section>
        <p className={`${label} mb-3`}>Study settings and data</p>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Target size={17}/></span><span><span className="block text-[13px] font-semibold">Daily question goal</span><span className="mt-0.5 block text-[11px] text-muted">Adjust your personal target</span></span></span><input aria-label="Daily question goal" type="number" min={1} max={500} value={settings.dailyGoal} onChange={(e) => setSettings({ dailyGoal: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} className="w-20 rounded-lg border border-line bg-sunken px-3 py-2 text-center font-mono text-[12px] outline-none focus:border-accent" /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><CalendarDays size={17}/></span><span><span className="block text-[13px] font-semibold">Exam countdown</span><span className="mt-0.5 block text-[11px] text-muted">{daysUntilExam === null ? 'Add your exam date' : `${daysUntilExam} days to your exam`}</span></span></span><input aria-label="Exam date" type="date" value={settings.examDate} onChange={(e) => setSettings({ examDate: e.target.value })} className="rounded-lg border border-line bg-sunken px-3 py-2 text-[12px] outline-none focus:border-accent" /></div>
          <button onClick={() => { if (user) progressExport(user.id) }} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Download size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Download progress backup</span><span className="mt-0.5 block text-[11px] text-muted">Includes your account progress, study history, notes and avatar</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={reset} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-bad/5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-bad/10 text-bad"><RotateCcw size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold text-bad">Reset learning progress</span><span className="mt-0.5 block text-[11px] text-muted">Your imported questions remain safe</span></span><ChevronRight size={16} className="text-muted" /></button>
        </div>
      </section>
  </div>
}

function Metric({ Icon, title, value, note }: { Icon: typeof Target; title: string; value: number; note: string }) {
  return <div className="bg-surface p-6"><div className="flex items-center gap-2 text-[11px] text-muted"><Icon size={14} /> {title}</div><p className="mt-3 text-[29px] font-bold tracking-[-.05em] tabular-nums">{value.toLocaleString()}</p><p className="mt-0.5 text-[10px] text-muted">{note}</p></div>
}
