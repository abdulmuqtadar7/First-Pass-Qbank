import { ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, Moon, RotateCcw, Sun, Target, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { SYSTEMS } from '../lib/data'
import { navigate } from '../lib/nav'
import { summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import { card, label } from '../lib/ui'

export default function ProgressTab() {
  const { questions, state, resetProgress, toggleTheme } = useStore()
  const sum = summarize(questions, state.progress)
  const accuracy = sum.attempts ? Math.round((sum.correct / sum.attempts) * 100) : 0
  const names = [...SYSTEMS]
  for (const q of questions) if (!names.some((name) => name.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
  const active = names
    .map((name) => ({ name, summary: summarize(questions.filter((q) => q.system.toLowerCase() === name.toLowerCase()), state.progress) }))
    .filter((item) => item.summary.total > 0)

  function reset() {
    if (window.confirm('Reset ALL progress, flags and streak? Imported questions are kept.')) resetProgress()
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
