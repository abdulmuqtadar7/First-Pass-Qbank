import { ChevronRight, Moon, Sun, Upload } from 'lucide-react'
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
  for (const q of questions) if (!names.some((n) => n.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
  const active = names
    .map((n) => ({ n, s: summarize(questions.filter((q) => q.system.toLowerCase() === n.toLowerCase()), state.progress) }))
    .filter((x) => x.s.total > 0)

  function reset() {
    if (window.confirm('Reset ALL progress, flags and streak? Imported questions are kept.')) resetProgress()
  }

  const accCls = sum.attempts === 0 ? 'text-ink' : accuracy >= 70 ? 'text-good' : accuracy < 50 ? 'text-bad' : 'text-ink'

  return (
    <div className="space-y-8">
      <header>
        <p className={label}>Performance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Progress</h1>
      </header>

      <section className={`${card} overflow-hidden`}>
        <div className="px-5 py-5">
          <p className={label}>Accuracy</p>
          <p className={`mt-1.5 text-5xl font-semibold tabular-nums tracking-tight ${accCls}`}>{accuracy}%</p>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted">
            {sum.correct} correct / {sum.attempts} attempts
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line sm:grid-cols-4 sm:divide-y-0">
          <Cell label="Mastered" value={sum.mastered} />
          <Cell label="Skipped (Easy)" value={sum.skipped} />
          <Cell label="Remaining" value={sum.remaining} />
          <Cell label="Again / Hard" value={sum.hard} />
        </div>
      </section>

      <section>
        <p className={`${label} mb-2 px-1`}>By system</p>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          {active.map(({ n, s }) => (
            <div key={n} className="px-4 py-3.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium tracking-tight">{n}</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {s.mastered + s.skipped} / {s.total} · {s.pct}%
                </span>
              </div>
              <div className="mt-2 h-[2px] rounded-full bg-line">
                <div className="h-full rounded-full bg-accent" style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${card} divide-y divide-line overflow-hidden`}>
        <button onClick={toggleTheme} className="flex w-full items-center justify-between px-4 py-3.5 text-sm transition-colors hover:bg-sunken">
          Appearance
          <span className="flex items-center gap-2 text-muted">
            {state.theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
            {state.theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>
        <button onClick={() => navigate('/admin')} className="flex w-full items-center justify-between px-4 py-3.5 text-sm transition-colors hover:bg-sunken">
          <span className="flex items-center gap-2">
            <Upload size={15} className="text-muted" /> Import question files
          </span>
          <ChevronRight size={15} className="text-muted" />
        </button>
        <button onClick={reset} className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-bad transition-colors hover:bg-sunken">
          Reset progress
        </button>
      </section>
    </div>
  )
}

function Cell({ label: l, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3.5">
      <p className={label}>{l}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  )
}
