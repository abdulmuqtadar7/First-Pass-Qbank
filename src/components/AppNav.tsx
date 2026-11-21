import { Activity, BarChart3, BookOpen, Moon, RotateCcw, Sun } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../lib/store'

export type Tab = 'study' | 'review' | 'progress'

const TABS: { id: Tab; label: string; Icon: typeof BookOpen }[] = [
  { id: 'study', label: 'Study', Icon: BookOpen },
  { id: 'review', label: 'Review', Icon: RotateCcw },
  { id: 'progress', label: 'Insights', Icon: BarChart3 },
]

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  reviewCount: number
}

export default function AppNav({ tab, onChange, reviewCount }: Props) {
  const { state, toggleTheme } = useStore()
  const dark = state.theme === 'dark'

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/85 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink text-canvas shadow-sm">
              <Activity size={20} strokeWidth={2.35} />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            </span>
            <div className="min-w-0 leading-tight">
              <span className="block whitespace-nowrap text-[14px] font-bold tracking-[-.035em]">FirstPass <span className="font-medium text-muted">Q-Bank</span></span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.15em] text-muted">A better way to master medicine</span>
            </div>
          </div>

          <nav aria-label="Primary navigation" className="mx-auto hidden items-center gap-1 rounded-xl border border-line bg-sunken/65 p-1 md:flex">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => onChange(id)} aria-current={tab === id ? 'page' : undefined} className={`relative flex h-9 items-center gap-2 rounded-lg px-4 text-[12px] font-semibold transition-colors ${tab === id ? 'text-ink' : 'text-muted hover:text-ink'}`}>
                {tab === id && <motion.span layoutId="desktop-nav-active" className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm" />}
                <Icon size={15} className="relative z-10" />
                <span className="relative z-10">{label}</span>
                {id === 'review' && reviewCount > 0 && <span className="relative z-10 rounded-md bg-accent/12 px-1.5 py-0.5 font-mono text-[10px] text-accent">{reviewCount > 99 ? '99+' : reviewCount}</span>}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              Study space
            </span>
            <button onClick={toggleTheme} aria-label={dark ? 'Switch to Daylight Paper theme' : 'Switch to Obsidian theme'} title={dark ? 'Daylight Paper' : 'Obsidian Dark'} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-muted shadow-sm transition-colors hover:border-accent/35 hover:text-ink">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={dark ? 'sun' : 'moon'} initial={{ rotate: -30, opacity: 0, scale: 0.8 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 30, opacity: 0, scale: 0.8 }} transition={{ duration: 0.14 }}>
                  {dark ? <Sun size={17} /> : <Moon size={17} />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </div>
      </header>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-26px_rgba(0,0,0,.35)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-1 px-3 py-1.5">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => onChange(id)} aria-current={tab === id ? 'page' : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${tab === id ? 'text-accent' : 'text-muted'}`}>
              {tab === id && <motion.span layoutId="mobile-nav-active" className="absolute inset-0 rounded-xl bg-accent/8" />}
              <span className="relative z-10">
                <Icon size={19} strokeWidth={tab === id ? 2.3 : 1.8} />
                {id === 'review' && reviewCount > 0 && <span className="absolute -right-3 -top-2 rounded-full bg-accent px-1.5 font-mono text-[9px] leading-4 text-white">{reviewCount > 99 ? '99+' : reviewCount}</span>}
              </span>
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
