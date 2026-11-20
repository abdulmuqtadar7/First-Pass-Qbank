import { Flag, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getIcon } from '../lib/meta'
import { weakQuestions } from '../lib/stats'
import { useStore } from '../lib/store'
import { btnPrimary, card, label, tag } from '../lib/ui'
import { OPTION_KEYS, type SessionMode } from '../types/qbank'

export default function ReviewTab({ onStart }: { onStart: (ids: string[], title: string, mode?: SessionMode) => void }) {
  const { questions, state } = useStore()
  const [query, setQuery] = useState('')
  const { progress, flagged } = state

  const weak = useMemo(() => weakQuestions(questions, progress, flagged), [questions, progress, flagged])

  const results = useMemo(() => {
    const s = query.trim().toLowerCase()
    if (!s) return []
    const num = s.replace(/^p\.?\s*/, '')
    const isNum = /^\d+$/.test(num)
    return questions.filter((q) => {
      if (isNum) {
        const n = Number(num)
        return q.correct_fa_page === n || OPTION_KEYS.some((k) => q.distractor_explanations[k].fa_page === n)
      }
      return q.concept_name.toLowerCase().includes(s) || q.concept_id.toLowerCase().includes(s)
    })
  }, [query, questions])

  const missed = weak.filter((q) => progress[q.id]?.lastCorrect === false).length
  const hard = weak.filter((q) => progress[q.id]?.status === 'hard').length
  const flaggedCount = weak.filter((q) => flagged.includes(q.id)).length

  return (
    <div className="space-y-8">
      <header>
        <p className={label}>Review queue</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Review</h1>
      </header>

      <section className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-3 divide-x divide-line">
          <Cell label="Again / Hard" value={hard} />
          <Cell label="Missed" value={missed} />
          <Cell label="Flagged" value={flaggedCount} />
        </div>
        <div className="border-t border-line p-3">
          <button
            disabled={!weak.length}
            onClick={() => onStart(weak.map((q) => q.id), 'Weak drill', 'tutor')}
            className={`${btnPrimary} w-full`}
          >
            Drill weak, missed &amp; flagged ({weak.length})
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search concept or First Aid page, e.g. 313"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
        </div>

        {query.trim() && (
          <>
            <div className="flex items-center justify-between">
              <p className={label}>{results.length} result{results.length === 1 ? '' : 's'}</p>
              <button
                disabled={!results.length}
                onClick={() => onStart(results.map((q) => q.id), `Search: ${query.trim()}`, 'tutor')}
                className="text-sm font-semibold text-accent disabled:opacity-40"
              >
                Drill all
              </button>
            </div>
            <ul className={`${card} divide-y divide-line overflow-hidden`}>
              {results.slice(0, 40).map((q) => {
                const Icon = getIcon(q.system)
                return (
                  <li key={q.id}>
                    <button onClick={() => onStart([q.id], q.concept_name, 'tutor')} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken">
                      <Icon size={15} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium tracking-tight">{q.concept_name}</span>
                        <span className="block truncate text-xs text-muted">
                          {q.angle.replace(/_/g, ' ')} · Tier {q.tier}
                        </span>
                      </span>
                      {flagged.includes(q.id) && <Flag size={13} className="text-accent" fill="currentColor" />}
                      <span className={tag}>p. {q.correct_fa_page}</span>
                    </button>
                  </li>
                )
              })}
              {!results.length && <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li>}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function Cell({ label: l, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-4">
      <p className={label}>{l}</p>
      <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  )
}
