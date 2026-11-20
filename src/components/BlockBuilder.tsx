import { Clock, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SYSTEMS } from '../lib/data'
import { buildBlock, eligible } from '../lib/blocks'
import { useStore } from '../lib/store'
import { btnPrimary, iconBtn, label } from '../lib/ui'
import type { BlockConfig, FilterKey, SessionMode } from '../types/qbank'

const FILTERS: { k: FilterKey; label: string }[] = [
  { k: 'all', label: 'All' },
  { k: 'unanswered', label: 'Unanswered Only' },
  { k: 'incorrect', label: 'Incorrect / Review' },
  { k: 'flagged', label: 'Flagged' },
]

const SIZES: { v: number; label: string }[] = [
  { v: 10, label: '10 Qs' },
  { v: 20, label: '20 Qs / 30 min — 2026 USMLE Step 1 Pace' },
  { v: 40, label: '40 Qs / 60 min' },
  { v: 0, label: 'All' },
]

interface Props {
  open: boolean
  onClose: () => void
  onStart: (ids: string[], title: string, mode: SessionMode) => void
}

const seg = (on: boolean) =>
  `flex-1 px-3 py-2.5 text-left text-sm transition-colors ${
    on ? 'bg-accent/10 font-semibold text-accent' : 'text-ink hover:bg-sunken'
  }`

const chip = (on: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm transition-colors ${
    on ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line text-ink hover:bg-sunken'
  }`

export default function BlockBuilder({ open, onClose, onStart }: Props) {
  const { questions, state } = useStore()
  const [mode, setMode] = useState<'tutor' | 'exam'>('tutor')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [systems, setSystems] = useState<string[]>([])
  const [size, setSize] = useState(20)

  const available = useMemo(() => {
    const names = SYSTEMS.filter((n) => questions.some((q) => q.system.toLowerCase() === n.toLowerCase()))
    for (const q of questions) if (!names.some((n) => n.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
    return names
  }, [questions])

  const pool = useMemo(() => eligible(questions, { filter, systems }, state), [questions, filter, systems, state])
  const count = size > 0 ? Math.min(size, pool.length) : pool.length

  if (!open) return null

  function toggleSystem(name: string) {
    const k = name.toLowerCase()
    setSystems((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  }

  function go() {
    const cfg: BlockConfig = { mode, filter, systems, size }
    const ids = buildBlock(questions, cfg, state).map((q) => q.id)
    onStart(ids, mode === 'exam' ? 'Timed Exam Block' : 'Custom Block', mode)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-rise relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-line bg-surface shadow-xl md:rounded-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight">Custom Block</h2>
          <button onClick={onClose} aria-label="Close" className={iconBtn}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section>
            <p className={`${label} mb-2`}>Mode</p>
            <div className="flex divide-x divide-line overflow-hidden rounded-md border border-line">
              <button onClick={() => setMode('tutor')} className={seg(mode === 'tutor')}>
                Tutor Mode
                <span className="block text-xs font-normal text-muted">Instant explanations</span>
              </button>
              <button onClick={() => setMode('exam')} className={seg(mode === 'exam')}>
                Timed Exam Mode
                <span className="block text-xs font-normal text-muted">Explanations after submission</span>
              </button>
            </div>
          </section>

          <section>
            <p className={`${label} mb-2`}>Filter</p>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button key={f.k} onClick={() => setFilter(f.k)} className={chip(filter === f.k)}>
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className={`${label} mb-2`}>Systems</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSystems([])} className={chip(systems.length === 0)}>
                All systems
              </button>
              {available.map((n) => (
                <button key={n} onClick={() => toggleSystem(n)} className={chip(systems.includes(n.toLowerCase()))}>
                  {n}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className={`${label} mb-2`}>Block size</p>
            <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {SIZES.map((s) => (
                <button
                  key={s.v}
                  onClick={() => setSize(s.v)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                    size === s.v ? 'bg-accent/10' : 'hover:bg-sunken'
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                      size === s.v ? 'border-accent' : 'border-line'
                    }`}
                  >
                    {size === s.v && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  <span className={size === s.v ? 'font-semibold text-accent' : ''}>{s.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface/90 px-5 py-3.5 backdrop-blur-md">
          <p className="font-mono text-xs tabular-nums text-muted">
            {count} ready · {pool.length} match
            {mode === 'exam' && (
              <span className="ml-2 inline-flex items-center gap-1 text-ink">
                <Clock size={12} /> {Math.ceil((count * 90) / 60)} min
              </span>
            )}
          </p>
          <button disabled={count === 0} onClick={go} className={btnPrimary}>
            Start {mode === 'exam' ? 'Exam' : 'Block'}
          </button>
        </div>
      </div>
    </div>
  )
}
