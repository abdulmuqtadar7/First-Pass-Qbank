import { BarChart3, BookOpen, Moon, RotateCcw, Sun } from 'lucide-react'
import { useStore } from '../lib/store'

export type Tab = 'study' | 'review' | 'progress'

const TABS: { id: Tab; label: string; Icon: typeof BookOpen }[] = [
  { id: 'study', label: 'Study', Icon: BookOpen },
  { id: 'review', label: 'Review', Icon: RotateCcw },
  { id: 'progress', label: 'Progress', Icon: BarChart3 },
]

interface Props {
  tab: Tab
  onChange: (t: Tab) => void
  reviewCount: number
}

export default function AppNav({ tab, onChange, reviewCount }: Props) {
  const { state, toggleTheme } = useStore()
  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-line bg-canvas/80 backdrop-blur-md md:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded bg-ink font-mono text-[11px] font-bold text-canvas">
              FP
            </span>
            <span className="text-sm font-semibold tracking-tight">FirstPass Q-Bank</span>
          </div>
          <nav className="flex items-center gap-1">
            {TABS.map(({ id, label }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  onClick={() => onChange(id)}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                  {id === 'review' && reviewCount > 0 && (
                    <span className="rounded bg-accent px-1.5 font-mono text-[10px] font-semibold tabular-nums text-white">
                      {reviewCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                {active && <span className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-accent" />}
                <span className="relative">
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                  {id === 'review' && reviewCount > 0 && (
                    <span className="absolute -right-3 -top-1.5 rounded bg-accent px-1 font-mono text-[9px] font-semibold tabular-nums leading-4 text-white">
                      {reviewCount > 99 ? '99+' : reviewCount}
                    </span>
                  )}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
