import { Moon, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { quickPick } from '../lib/blocks'
import { SYSTEMS } from '../lib/data'
import { getIcon } from '../lib/meta'
import { computeStreak, conceptsMastered, summarize, weakQuestions } from '../lib/stats'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label, tag } from '../lib/ui'
import type { SessionMode } from '../types/qbank'
import BlockBuilder from './BlockBuilder'

interface Props {
  onStart: (ids: string[], title: string, mode?: SessionMode) => void
}

export default function StudyTab({ onStart }: Props) {
  const { questions, state, toggleTheme, todayCount, dailyGoal } = useStore()
  const [builder, setBuilder] = useState(false)
  const { progress } = state

  const overall = summarize(questions, progress)
  const mastered = conceptsMastered(questions, progress)
  const totalConcepts = useMemo(() => new Set(questions.map((q) => `${q.system}|${q.concept_id}`)).size, [questions])
  const due = useMemo(() => weakQuestions(questions, progress, state.flagged).length, [questions, progress, state.flagged])
  const streak = computeStreak(state.studyDates)
  const goalPct = Math.min(100, Math.round((todayCount / dailyGoal) * 100))

  const systems = useMemo(() => {
    const names = [...SYSTEMS]
    for (const q of questions)
      if (!names.some((n) => n.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
    const list = names.map((name) => {
      const qs = questions.filter((q) => q.system.toLowerCase() === name.toLowerCase())
      const answered = qs.filter((q) => (progress[q.id]?.attempts ?? 0) > 0).length
      const concepts = new Set(qs.map((q) => q.concept_id)).size
      return { name, qs, answered, concepts, sum: summarize(qs, progress) }
    })
    return [...list.filter((s) => s.qs.length > 0), ...list.filter((s) => s.qs.length === 0)]
  }, [questions, progress])

  function launch(name: string, ids: string[]) {
    const fresh = ids.filter((id) => !progress[id]?.status)
    const hard = ids.filter((id) => progress[id]?.status === 'hard')
    const rest = ids.filter((id) => progress[id]?.status === 'mastered')
    const queue = fresh.length ? [...fresh, ...hard] : [...hard, ...rest]
    onStart(queue, name, 'tutor')
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className={label}>FirstPass Q-Bank</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Study</h1>
        </div>
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface text-muted md:hidden"
        >
          {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <section className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-3 divide-x divide-line">
          <Metric label="Readiness" value={`${overall.pct}%`} />
          <Metric label="Mastered concepts" value={String(mastered)} sub={`of ${totalConcepts}`} />
          <Metric label="Due for review" value={String(due)} />
        </div>
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs tabular-nums text-muted">
            Streak {streak}d · Today {todayCount}/{dailyGoal}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setBuilder(true)} className={btnGhost}>
              Custom Block
            </button>
            <button
              onClick={() => onStart(quickPick(questions, state, 10), 'Quick block', 'tutor')}
              disabled={!questions.length}
              className={btnPrimary}
            >
              Start Block
            </button>
          </div>
        </div>
        <div className="h-[2px] bg-line">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${goalPct}%` }} />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className={label}>Organ systems</h2>
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-muted sm:block">
            answered / total · mastery
          </span>
        </div>
        <div className={`${card} overflow-hidden`}>
          {systems.map(({ name, qs, answered, concepts, sum }) => {
            const Icon = getIcon(name)
            const active = qs.length > 0
            const answeredPct = qs.length ? Math.round((answered / qs.length) * 100) : 0
            return (
              <button
                key={name}
                disabled={!active}
                onClick={() => launch(name, qs.map((q) => q.id))}
                className={`group block w-full border-t border-line px-4 py-3.5 text-left transition-all first:border-t-0 ${
                  active ? 'hover:bg-sunken hover:shadow-[inset_2px_0_0_var(--accent)]' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-sunken text-muted transition-colors group-hover:text-ink">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium tracking-tight">{name}</span>
                    <span className="block text-xs text-muted">
                      {active ? `${concepts} concepts` : 'Not yet available'}
                    </span>
                  </span>
                  {active ? (
                    <>
                      <span className="font-mono text-xs tabular-nums">
                        {answered} / {qs.length}
                      </span>
                      <span className="w-10 text-right font-mono text-xs tabular-nums text-muted">{sum.pct}%</span>
                    </>
                  ) : (
                    <span className={tag}>Coming soon</span>
                  )}
                </div>
                {active && (
                  <div className="mt-2.5 h-[2px] rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${answeredPct}%` }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <BlockBuilder open={builder} onClose={() => setBuilder(false)} onStart={onStart} />
    </div>
  )
}

function Metric({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-4 py-4">
      <p className={label}>{l}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
        {sub && <span className="text-xs font-normal text-muted">{sub}</span>}
      </p>
    </div>
  )
}
