import { BarChart3, BookOpen, Home, LogOut, Moon, LibraryBig, PanelLeftClose, PanelLeftOpen, Settings2, Sun, UserRound } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { useOwnerAccess } from '../lib/ownerAccess'
import { navigate } from '../lib/nav'
import { CloudSyncIndicator, useCloudSync } from '../lib/cloudSync'
import type { DoctorAvatar } from './DoctorWalk'
import type { DesktopDensity } from '../lib/desktopPreferences'

export type Tab = 'study' | 'practice' | 'review' | 'progress' | 'history' | 'notebook' | 'exams' | 'flashcards' | 'settings'

const TABS = [
  { id: 'study', label: 'Home', Icon: Home },
  { id: 'practice', label: 'Study', Icon: BookOpen },
  { id: 'notebook', label: 'Library', Icon: LibraryBig },
  { id: 'progress', label: 'Progress', Icon: BarChart3 },
] as const

export default function AppNav({ tab, onChange, reviewCount, avatar, onPickAvatar, density, onDensity, sidebarCollapsed, onToggleSidebar }: {
  tab: Tab
  onChange: (tab: Tab) => void
  reviewCount: number
  avatar: DoctorAvatar | null
  onPickAvatar: () => void
  density: DesktopDensity
  onDensity: (value: DesktopDensity) => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}) {
  const { state, toggleTheme } = useStore()
  const { user, signOut } = useAuth()
  const { status, retry } = useCloudSync()
  const [accountOpen, setAccountOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!accountOpen) return
    const close = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setAccountOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [accountOpen])
  const ownerAccess = useOwnerAccess(accountOpen)
  const dark = state.theme === 'dark'

  return <>
    <header className="fp-workspace-header relative z-40 mx-auto w-full max-w-[1650px] px-4 pt-4 sm:px-7 sm:pt-5 lg:px-10">
      <div className="flex h-14 items-center justify-between gap-2 sm:h-16">
        <button onClick={() => onChange('study')} className="flex min-w-0 items-center gap-2 text-left" aria-label="QB360 home">
          <img src="/qb360-icons/icon.svg" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl" />
          <span className="whitespace-nowrap text-[19px] font-extrabold tracking-[-.065em] sm:text-[22px]">QB360</span>
        </button>

        <button type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} onClick={onToggleSidebar} className="fp-sidebar-toggle hidden rounded-lg border border-line bg-surface p-2 text-muted hover:text-ink">{sidebarCollapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button>
        <nav aria-label="Primary navigation" className="fp-primary-nav hidden items-center gap-1 rounded-full border border-white/60 bg-surface/70 p-1.5 shadow-[0_8px_30px_-24px_#43286f77] backdrop-blur-xl md:flex">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id || (tab === 'history' && id === 'progress') || (tab === 'exams' && id === 'practice') || ((tab === 'review' || tab === 'flashcards') && id === 'notebook')
            return <button key={id} onClick={() => onChange(id)} title={label} aria-label={label} aria-current={active ? 'page' : undefined} className={`relative flex items-center gap-2 rounded-full px-2.5 py-2.5 text-[12px] font-bold transition-colors lg:px-5 ${active ? 'text-[#6328bc] dark:text-[#dec6ff]' : 'text-muted hover:text-ink'}`}>
              {active && <motion.span layoutId="fp-top-nav" className="absolute inset-0 rounded-full bg-[#eee0ff] shadow-sm dark:bg-[#442d64]" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} />}
              <Icon size={16} className="relative z-10" /><span className="fp-nav-label relative z-10">{label}</span>
              {id === 'notebook' && reviewCount > 0 && <span className="fp-nav-badge relative z-10 rounded-full bg-[#e7d9fa] px-1.5 font-mono text-[10px] text-[#6f38be] dark:bg-[#67459a] dark:text-white">{Math.min(99, reviewCount)}{reviewCount > 99 ? '+' : ''}</span>}
            </button>
          })}
        </nav>

        <div className="flex items-center gap-2">
          <CloudSyncIndicator />
          <div ref={menuRef} className="relative">
            <button onClick={() => setAccountOpen((v) => !v)} title="Your account" aria-expanded={accountOpen} aria-label="Account settings" className="grid h-10 w-10 place-items-center rounded-full border border-white/80 bg-surface/75 text-[#41366e] shadow-sm transition hover:bg-surface dark:border-[#342c43] dark:text-[#d8c5ff]"><span className="text-xs font-extrabold">{user?.email?.slice(0, 1).toUpperCase() ?? '?'}</span></button>
            {accountOpen && <div className="absolute right-0 top-12 z-[90] w-[min(290px,80vw)] rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-float)]"><p className="px-2 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">Signed in as</p><p className="truncate px-2 py-2 text-xs font-semibold" title={user?.email}>{user?.email}</p><p className="mb-2 px-2 text-[10px] text-muted">Progress is private to your account.</p><button onClick={retry} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-muted hover:bg-sunken"><span>Cloud progress</span><span className="font-semibold">{status === 'saved' ? 'Saved' : status === 'conflict' ? 'Conflict · retry' : status === 'offline' ? 'Offline · retry' : 'Syncing…'}</span></button><button onClick={() => { setAccountOpen(false); onChange('settings') }} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-semibold hover:bg-sunken"><Settings2 size={16}/> Workspace preferences</button><button onClick={() => { setAccountOpen(false); onPickAvatar() }} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-semibold hover:bg-sunken"><UserRound size={16}/> Choose doctor avatar <span className="ml-auto text-muted">{avatar ?? 'Not chosen'}</span></button><button onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-semibold hover:bg-sunken">{dark ? <Sun size={16}/> : <Moon size={16}/>} {dark ? 'Light mode' : 'Dark mode'}</button><label className="fp-density-setting hidden items-center justify-between gap-2 rounded-xl px-3 py-3 text-xs font-semibold"><span>Desktop display density</span><select aria-label="Desktop display density" value={density} onChange={e => onDensity(e.target.value as DesktopDensity)} className="min-w-0 rounded-lg border border-line bg-surface p-1.5 text-xs"><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>{ownerAccess === 'owner' && <button type="button" onClick={() => { setAccountOpen(false); navigate('/admin') }} className="mb-2 flex w-full items-center gap-2 rounded-xl bg-accent/10 px-3 py-3 text-left text-xs font-bold text-accent">Owner dashboard</button>}<button onClick={async () => { if (status !== 'saved' && !window.confirm('Some progress may not be synced yet. Your local copy will remain on this device. Sign out?')) return; setAccountOpen(false); try { await signOut() } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not sign out.') } }} className="flex w-full items-center gap-2 rounded-xl bg-sunken px-3 py-3 text-left text-xs font-semibold hover:text-bad"><LogOut size={16}/> Sign out</button></div>}
          </div>
        </div>
      </div>
    </header>

    <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-50 mx-auto max-w-[520px] rounded-[26px] border border-white/80 bg-surface/95 p-1.5 shadow-[0_8px_36px_-9px_#3b24604b] backdrop-blur-xl dark:border-[#5c4b6e]/60 md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id || (tab === 'history' && id === 'progress') || (tab === 'exams' && id === 'practice') || ((tab === 'review' || tab === 'flashcards') && id === 'notebook')
          return <button key={id} onClick={() => onChange(id)} aria-current={active ? 'page' : undefined} className={`relative flex h-[56px] flex-col items-center justify-center gap-1 rounded-[21px] text-[10px] font-semibold transition-colors ${active ? 'text-[#6323c1] dark:text-[#e5ccff]' : 'text-muted'}`}>
            {active && <motion.span layoutId="fp-mobile-nav" className="absolute inset-0 rounded-[21px] bg-[#eee2ff] dark:bg-[#443157]" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} />}
            <Icon size={19} strokeWidth={active ? 2.35 : 1.9} className="relative z-10" />
            <span className="relative z-10">{label}</span>
            {id === 'notebook' && reviewCount > 0 && <span className="absolute right-2 top-0 z-10 rounded-full bg-[#8e47eb] px-1 text-[8px] text-white">{reviewCount > 99 ? '99+' : reviewCount}</span>}
          </button>
        })}
      </div>
    </nav>
  </>
}
