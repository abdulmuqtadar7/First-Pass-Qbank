import { ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Download, History, Moon, RotateCcw, Sun, Target, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { SYSTEMS } from '../lib/data'
import { progressExport, useLearning } from '../lib/learning'
import { navigate } from '../lib/nav'
import { conceptsMastered, dateKey, summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import { card, label } from '../lib/ui'
import { countConcepts } from '../lib/sessionBuilder'
import { useAuth } from '../lib/auth'
import AdaptivePanel from './AdaptivePanel'

export default function ProgressTab({ onViewHistory }: { onViewHistory: () => void }) {
  const { user } = useAuth()
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
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className={`${label} flex items-center gap-2`}><BarChart3 size={13} className="text-accent" /> Your performance</p><h1 className="mt-2 font-display text-[36px] tracking-[-.055em] sm:text-[49px]">Learning insights<span className="text-accent">.</span></h1><p className="mt-1 text-[13px] text-muted">A clear view of where you are, and what comes next.</p></div><button onClick={onViewHistory} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-[12px] font-semibold text-ink shadow-sm hover:text-accent"><History size={16}/> Session history <ChevronRight size={14}/></button></header>

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
            <Metric Icon={CheckCircle2} title="Marked confident" value={sum.mastered} note="Questions rated Good or Easy" />
            <Metric Icon={Target} title="Remaining" value={sum.remaining} note="Questions to tackle" />
            <Metric Icon={ArrowUpRight} title="Marked easy" value={sum.skipped} note="Similar angles skipped" />
            <Metric Icon={RotateCcw} title="Needs review" value={sum.hard} note="Again / hard" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className={`${card} p-5`}><p className={label}>Confidence-secured concepts</p><p className="mt-3 font-display text-[36px] tabular-nums">{conceptsMastered(questions, state.progress)} <span className="font-sans text-[12px] text-muted">/ {countConcepts(questions)}</span></p></div><div className={`${card} p-5`}><p className={label}>Questions today</p><p className="mt-3 font-display text-[36px] tabular-nums">{todayCount} <span className="font-sans text-[12px] text-muted">/ {settings.dailyGoal}</span></p></div><div className={`${card} col-span-2 p-5 sm:col-span-1`}><p className={label}>Review ready</p><p className="mt-3 font-display text-[36px] tabular-nums">{dueNow} <span className="font-sans text-[12px] text-muted">concepts</span></p></div></section>

      <AdaptivePanel/>
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
          <button onClick={() => { if (user) progressExport(user.id) }} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Download size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Download progress backup</span><span className="mt-0.5 block text-[11px] text-muted">Includes your account progress, study history, notes and avatar</span></span><ChevronRight size={16} className="text-muted" /></button>
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
