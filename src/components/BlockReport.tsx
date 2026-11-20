import { useMemo } from 'react'
import { btnGhost, btnPrimary, card, label, tag } from '../lib/ui'
import type { Answer, OptionKey, Question, SessionMode } from '../types/qbank'

interface Props {
  questions: Question[]
  answers: Record<string, Answer>
  times: Record<string, number>
  mode: SessionMode
  elapsed: number
  onReview: (ids: string[], prefill: Record<string, OptionKey>) => void
  onExit: () => void
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function BlockReport({ questions, answers, times, mode, elapsed, onReview, onExit }: Props) {
  const rows = useMemo(
    () => questions.map((q) => ({ q, sel: answers[q.id]?.selected ?? null, t: times[q.id] ?? 0 })),
    [questions, answers, times],
  )

  const answered = rows.filter((r) => r.sel !== null)
  const correct = rows.filter((r) => r.sel === r.q.correct_option)
  const denom = mode === 'exam' ? rows.length : answered.length
  const pct = denom ? Math.round((correct.length / denom) * 100) : 0
  const totalTime = rows.reduce((a, r) => a + r.t, 0)
  const avg = answered.length ? Math.round(totalTime / answered.length) : 0

  const concepts = useMemo(() => {
    const m = new Map<string, { c: number; n: number }>()
    for (const r of rows) {
      if (mode !== 'exam' && r.sel === null) continue
      const cur = m.get(r.q.concept_name) ?? { c: 0, n: 0 }
      cur.n += 1
      if (r.sel === r.q.correct_option) cur.c += 1
      m.set(r.q.concept_name, cur)
    }
    return [...m.entries()].sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)
  }, [rows, mode])

  const missed = rows.filter((r) =>
    mode === 'exam' ? r.sel !== r.q.correct_option : r.sel !== null && r.sel !== r.q.correct_option,
  )

  const prefill: Record<string, OptionKey> = {}
  for (const r of rows) if (r.sel) prefill[r.q.id] = r.sel

  const scoreCls = pct >= 70 ? 'text-good' : pct < 50 ? 'text-bad' : 'text-ink'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas text-ink">
      <div className="animate-rise mx-auto max-w-2xl space-y-6 px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header>
          <p className={label}>Block report · {mode === 'exam' ? 'Timed exam' : 'Tutor'}</p>
          <p className={`mt-2 text-6xl font-semibold tabular-nums tracking-tight ${scoreCls}`}>{pct}%</p>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted">
            {correct.length} / {denom} correct
            {mode === 'exam' && rows.length - answered.length > 0 ? ` · ${rows.length - answered.length} unanswered` : ''}
          </p>
        </header>

        <section className={`${card} grid grid-cols-3 divide-x divide-line`}>
          <Cell label="Avg sec / Q" value={String(avg)} />
          <Cell label="Time used" value={fmt(elapsed)} />
          <Cell label="Answered" value={`${answered.length}/${rows.length}`} />
        </section>

        <section className={card}>
          <p className={`${label} px-5 pt-4`}>Concept accuracy</p>
          <ul className="divide-y divide-line px-5 pb-2 pt-1">
            {concepts.length === 0 && <li className="py-3 text-sm text-muted">No answered questions.</li>}
            {concepts.map(([name, v]) => {
              const p = Math.round((v.c / v.n) * 100)
              return (
                <li key={name} className="py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{name}</span>
                    <span className={tag}>
                      {v.c}/{v.n}
                    </span>
                  </div>
                  <div className="mt-2 h-[2px] rounded-full bg-line">
                    <div className={`h-full rounded-full ${p >= 70 ? 'bg-good' : p < 50 ? 'bg-bad' : 'bg-ink'}`} style={{ width: `${p}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            disabled={!missed.length}
            onClick={() => onReview(missed.map((r) => r.q.id), prefill)}
            className={`${btnPrimary} flex-1`}
          >
            Review missed ({missed.length})
          </button>
          <button onClick={() => onReview(rows.map((r) => r.q.id), prefill)} className={`${btnGhost} flex-1`}>
            Review all
          </button>
          <button onClick={onExit} className={`${btnGhost} flex-1`}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Cell({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className={label}>{l}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  )
}
