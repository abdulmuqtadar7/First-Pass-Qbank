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
