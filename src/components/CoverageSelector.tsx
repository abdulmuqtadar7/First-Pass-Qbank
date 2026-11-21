import { BookOpenCheck, Layers3, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'
import type { CoverageMode } from '../types/qbank'
import { label } from '../lib/ui'

interface Props {
  value: CoverageMode
  onChange: (mode: CoverageMode) => void
  total: number
  concepts: number
  filtered?: boolean
}

export default function CoverageSelector({ value, onChange, total, concepts, filtered = false }: Props) {
  const id = useId()
  const modes: { key: CoverageMode; Icon: typeof BookOpenCheck; title: string; count: number; detail: string }[] = [
    {
      key: 'core_concepts', Icon: BookOpenCheck, title: 'Complete Coverage', count: concepts,
      detail: filtered ? 'One question for every matching concept' : '1 Q per concept · All indexed First Aid topics',
    },
    { key: 'all', Icon: Layers3, title: 'Full Multi-Angle Bank', count: total, detail: 'Every vignette, mechanism & differential' },
  ]

  return (
    <section aria-label="Question coverage mode" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={label}>Choose your depth</p>
        <p className="font-mono text-[11px] tabular-nums text-muted">
          {total.toLocaleString()} Total Qs <span className="px-1 opacity-50">·</span> {concepts.toLocaleString()} Unique Concepts
        </p>
      </div>
      <div role="group" aria-label="Coverage mode" className="grid grid-cols-1 gap-2 rounded-2xl border border-line bg-sunken/65 p-1.5 sm:grid-cols-2">
        {modes.map(({ key, Icon, title, count, detail }) => {
          const active = value === key
          return (
            <button key={key} type="button" aria-pressed={active} onClick={() => onChange(key)} className={`relative min-h-[102px] overflow-hidden rounded-xl p-4 text-left transition-colors ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}>
              {active && <motion.span layoutId={`${id}-coverage-active`} className="absolute inset-0 rounded-xl border border-accent/25 bg-surface shadow-[0_3px_12px_-7px_rgba(0,0,0,.35)]" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }} />}
              <span className="relative z-10 flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? 'bg-accent/12 text-accent' : 'bg-surface text-muted'}`}><Icon size={17} /></span>
                <span className="font-mono text-[12px] font-semibold tabular-nums">{count.toLocaleString()} Qs</span>
                {active && <Sparkles size={13} className="ml-auto text-accent" />}
              </span>
              <span className="relative z-10 mt-3 block text-[13px] font-semibold tracking-tight">{title}</span>
              <span className="relative z-10 mt-1 block text-[11px] leading-snug text-muted">{detail}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
