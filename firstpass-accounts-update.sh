#!/usr/bin/env bash
# FirstPass Q-Bank: secure accounts + non-destructive migration.
# Run from your existing FirstPass project root in GitHub Codespaces.
set -euo pipefail
for path in package.json src/main.tsx src/App.tsx src/lib/store.tsx src/lib/learning.tsx src/components/DoctorWalk.tsx; do
  if [ ! -f "$path" ]; then echo "Missing $path. Open your FirstPass project root first." >&2; exit 1; fi
done
if [ -f src/lib/supabase.ts ] && grep -Fq "firstpass-auth-v1" src/lib/supabase.ts; then
  echo "FirstPass accounts seem to be installed already. No files changed."
  npm run build
  exit 0
fi
if ! grep -Fq "loadBundledQuestions" src/lib/store.tsx || ! grep -Fq "LearningProvider" src/main.tsx || ! grep -Fq "readAvatar" src/App.tsx; then
  echo "This FirstPass version does not match the supported current app. No files changed. Ask for a tailored installer." >&2
  exit 1
fi
for path in 'src/components/AccountGate.tsx' 'src/components/AuthScreen.tsx' 'src/lib/accountStorage.ts' 'src/lib/auth.tsx' 'src/lib/cloudSync.tsx' 'src/lib/supabase.ts' 'supabase/firstpass_accounts.sql' '.env.example'; do
  if [ -e "$path" ]; then echo "Existing custom file at $path. No changes made; ask for a tailored installer." >&2; exit 1; fi
done
if ! grep -Fq "const UI_THEME_KEY = 'ui_theme'" src/lib/store.tsx; then
  echo "Your progress store has already been customized. No files changed to avoid overriding it." >&2
  exit 1
fi
echo "Checking your installed FirstPass source before changing anything…"
if ! sha256sum --status -c <<'FIRSTPASS_ACCOUNTS_BASELINE_SHA'
95c132cdf7526926a0c02f384285e0297b327d3eb58640df2ef24bed1899515e  src/main.tsx
3324f0adc6163c0726998fa85482c3e88c6e5818e97e6a969fbdba47dfff7877  src/App.tsx
7abbbcbf59d7d8b8f22737529847d7a906b5b8ca994073d0d032517dd1a66d62  src/components/AppNav.tsx
d6562105d5abf8a836eca7bd506c179cacdc233773b48739a07c9dc09b01aeea  src/components/DoctorWalk.tsx
f21fa7a565918c6217013b95b78c62ae17d6f8b4a84b6acab603e9001028b978  src/components/ProgressTab.tsx
42e1c4c3e00b889f32bc05d0641ecd831ee025d074d19571dc1cdfbd295680a0  src/lib/store.tsx
4eddf4a83c4e7b2104d723811ee2cbce9153d226b00546d01669d5f388254b8b  src/lib/learning.tsx
FIRSTPASS_ACCOUNTS_BASELINE_SHA
then
  echo "Your files differ from the version this installer was tested against. Nothing changed. Please send me the current code for a safe custom update." >&2
  exit 1
fi
backup_path=$(mktemp --suffix=.tar.gz ./firstpass-before-accounts-XXXXXX)
backup_files=(package.json)
if [ -f package-lock.json ]; then backup_files+=(package-lock.json); fi
if [ -f .gitignore ]; then backup_files+=(.gitignore); fi
if [ -f 'src/main.tsx' ]; then backup_files+=('src/main.tsx'); fi
if [ -f 'src/App.tsx' ]; then backup_files+=('src/App.tsx'); fi
if [ -f 'src/components/AppNav.tsx' ]; then backup_files+=('src/components/AppNav.tsx'); fi
if [ -f 'src/components/DoctorWalk.tsx' ]; then backup_files+=('src/components/DoctorWalk.tsx'); fi
if [ -f 'src/components/ProgressTab.tsx' ]; then backup_files+=('src/components/ProgressTab.tsx'); fi
if [ -f 'src/components/AccountGate.tsx' ]; then backup_files+=('src/components/AccountGate.tsx'); fi
if [ -f 'src/components/AuthScreen.tsx' ]; then backup_files+=('src/components/AuthScreen.tsx'); fi
if [ -f 'src/lib/store.tsx' ]; then backup_files+=('src/lib/store.tsx'); fi
if [ -f 'src/lib/learning.tsx' ]; then backup_files+=('src/lib/learning.tsx'); fi
if [ -f 'src/lib/accountStorage.ts' ]; then backup_files+=('src/lib/accountStorage.ts'); fi
if [ -f 'src/lib/auth.tsx' ]; then backup_files+=('src/lib/auth.tsx'); fi
if [ -f 'src/lib/cloudSync.tsx' ]; then backup_files+=('src/lib/cloudSync.tsx'); fi
if [ -f 'src/lib/supabase.ts' ]; then backup_files+=('src/lib/supabase.ts'); fi
if [ -f 'supabase/firstpass_accounts.sql' ]; then backup_files+=('supabase/firstpass_accounts.sql'); fi
if [ -f '.env.example' ]; then backup_files+=('.env.example'); fi
tar -czf "$backup_path" "${backup_files[@]}"
echo "Backup saved: $backup_path"
echo "No source question JSON or old browser progress keys will be modified."
echo "Installing the Supabase browser client…"
npm install --save-exact --no-audit --no-fund @supabase/supabase-js@2.119.2
mkdir -p src/lib src/components supabase
cat <<'FIRSTPASS_ACCOUNTS_0_EOF' > 'src/main.tsx'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App'
import { StoreProvider } from './lib/store'
import { LearningProvider } from './lib/learning'
import { AuthProvider } from './lib/auth'
import { CloudSyncProvider } from './lib/cloudSync'
import AccountGate from './components/AccountGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}>
      <AuthProvider>
        <AccountGate>{(userId, boot) => (
          <StoreProvider key={userId} userId={userId}>
            <LearningProvider userId={userId}>
              <CloudSyncProvider userId={userId} boot={boot}>
                <App userId={userId} />
              </CloudSyncProvider>
            </LearningProvider>
          </StoreProvider>
        )}</AccountGate>
      </AuthProvider>
    </MotionConfig>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
FIRSTPASS_ACCOUNTS_0_EOF
cat <<'FIRSTPASS_ACCOUNTS_1_EOF' > 'src/App.tsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppNav, { type Tab } from './components/AppNav'
import StudyTab from './components/StudyTab'
import ReviewTab from './components/ReviewTab'
import ProgressTab from './components/ProgressTab'
import HistoryTab from './components/HistoryTab'
import NotebookTab from './components/NotebookTab'
import AvatarPicker from './components/AvatarPicker'
import { readAvatar, type DoctorAvatar } from './components/DoctorWalk'
import Player from './components/Player'
import Admin from './components/Admin'
import { buildBlock, shuffle } from './lib/blocks'
import { buildSystemSession } from './lib/sessionBuilder'
import { weakQuestions } from './lib/stats'
import { dueConceptQuestions, useLearning } from './lib/learning'
import { useStore } from './lib/store'
import { page } from './lib/ui'
import { fieldKey } from './lib/accountStorage'
import { useCloudSync } from './lib/cloudSync'
import type { OptionKey, Session, SessionMode, SessionSource } from './types/qbank'

export default function App({ userId }: { userId: string }) {
  const { notifyChanged } = useCloudSync()
  const { questions, state, bankStatus } = useStore()
  const { active, setActive, schedule } = useLearning()
  const [path, setPath] = useState(window.location.pathname)
  const [tab, setTab] = useState<Tab>('study')
  const [session, setSession] = useState<Session | null>(() => active?.session ?? null)
  const [sKey, setSKey] = useState(0)
  const [avatar, setAvatar] = useState<DoctorAvatar | null>(() => readAvatar(userId))
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(() => !readAvatar(userId))

  const chooseAvatar = useCallback((choice: DoctorAvatar) => {
    setAvatar(choice)
    try { localStorage.setItem(fieldKey(userId, 'avatar'), choice) } catch { /* private mode */ }
    notifyChanged()
    setAvatarPickerOpen(false)
  }, [userId, notifyChanged])

  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  const start = useCallback((ids: string[], title: string, mode: SessionMode = 'tutor', source?: SessionSource) => {
    if (!ids.length) return
    if (active && !window.confirm('Replace the saved unfinished session with a new one? Your recorded question progress will stay intact.')) return
    const next: Session = { ids: shuffle(ids), title, mode, source }
    setSession(next)
    setActive({ session: next, queue: next.ids, position: 0, answers: {}, ratings: {}, times: {}, startedAt: Date.now(), updatedAt: Date.now() })
    setSKey((k) => k + 1)
  }, [active, setActive])

  const review = useCallback((ids: string[], prefill: Record<string, OptionKey>) => {
    if (!ids.length) return
    if (active && !window.confirm('Open this review and discard your saved unfinished session? Your recorded question progress will remain.')) return
    const next: Session = { ids: shuffle(ids), title: 'Review', mode: 'review', prefill }
    setActive(null)
    setSession(next)
    setSKey((k) => k + 1)
  }, [active, setActive])

  const restart = useCallback(() => {
    if (!session) return
    let ids = session.ids
    if (session.source?.kind === 'system') {
      const { system, coverageMode } = session.source
      ids = buildSystemSession(questions, system, coverageMode, state.progress).map((q) => q.id)
    } else if (session.source?.kind === 'block') {
      ids = buildBlock(questions, session.source.config, state).map((q) => q.id)
    }
    if (!ids.length) ids = session.ids
    const next: Session = { ...session, ids: shuffle(ids) }
    setSession(next)
    setActive(session.mode === 'review' ? null : { session: next, queue: next.ids, position: 0, answers: {}, ratings: {}, times: {}, startedAt: Date.now(), updatedAt: Date.now() })
    setSKey((k) => k + 1)
  }, [questions, session, state, setActive])

  const resume = useCallback(() => {
    if (!active) return
    setSession(active.session)
    setSKey((k) => k + 1)
  }, [active])

  const due = useMemo(
    () => new Set([
      ...weakQuestions(questions, state.progress, state.flagged).map((q) => q.id),
      ...dueConceptQuestions(questions, schedule, state.progress).map((q) => q.id),
    ]).size,
    [questions, schedule, state.progress, state.flagged],
  )

  if (path.startsWith('/admin')) return <Admin />

  // Never mount a restored player against an empty, still-loading question map.
  if (bankStatus !== 'ready') return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-center text-ink">
      <div className="w-full max-w-sm rounded-[30px] border border-line bg-surface p-9 shadow-xl">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-2xl font-bold text-accent">+</span>
        <h1 className="text-2xl font-bold tracking-tight">FirstPass Q-Bank</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {bankStatus === 'error' ? 'Your question bank could not be loaded. Please try again.' : 'Preparing your study desk and question bank…'}
        </p>
        {bankStatus === 'error' ? (
          <button className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Try again</button>
        ) : <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-accent/10"><div className="h-full w-2/5 animate-pulse rounded-full bg-accent" /></div>}
      </div>
    </div>
  )

  if (session) {
    return <Player key={sKey} session={session} onExit={() => setSession(null)} onReview={review} onRestart={restart} />
  }

  return (
    <div className={`${page} study-shell journey-app`}>
      <AppNav tab={tab} onChange={setTab} reviewCount={due} avatar={avatar} onPickAvatar={() => setAvatarPickerOpen(true)} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="mx-auto w-full max-w-[1650px] px-3 pb-32 pt-3 sm:px-7 sm:pt-5 md:pb-24 lg:px-10"
        >
          {tab === 'study' && <StudyTab onStart={start} onResume={resume} hasSavedSession={!!active} avatar={avatar ?? 'male'} />}
          {tab === 'practice' && <StudyTab variant="practice" onStart={start} onResume={resume} hasSavedSession={!!active} avatar={avatar ?? 'male'} />}
          {tab === 'review' && <ReviewTab onStart={start} />}
          {tab === 'progress' && <ProgressTab onViewHistory={() => setTab('history')} />}
          {tab === 'history' && <HistoryTab onReview={review} />}
          {tab === 'notebook' && <NotebookTab />}
        </motion.main>
      </AnimatePresence>
      <AvatarPicker open={avatarPickerOpen} selected={avatar} onChoose={chooseAvatar} onClose={() => setAvatarPickerOpen(false)} />
    </div>
  )
}
FIRSTPASS_ACCOUNTS_1_EOF
cat <<'FIRSTPASS_ACCOUNTS_2_EOF' > 'src/components/AppNav.tsx'
import { BarChart3, BookOpen, Home, LogOut, Moon, NotebookPen, Play, Sun, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { CloudSyncIndicator, useCloudSync } from '../lib/cloudSync'
import type { DoctorAvatar } from './DoctorWalk'

export type Tab = 'study' | 'practice' | 'review' | 'progress' | 'history' | 'notebook'

const TABS = [
  { id: 'study', label: 'Home', Icon: Home },
  { id: 'practice', label: 'Practice', Icon: Play },
  { id: 'review', label: 'Review', Icon: BookOpen },
  { id: 'progress', label: 'Progress', Icon: BarChart3 },
  { id: 'notebook', label: 'Notes', Icon: NotebookPen },
] as const

export default function AppNav({ tab, onChange, reviewCount, avatar, onPickAvatar }: {
  tab: Tab
  onChange: (tab: Tab) => void
  reviewCount: number
  avatar: DoctorAvatar | null
  onPickAvatar: () => void
}) {
  const { state, toggleTheme } = useStore()
  const { user, signOut } = useAuth()
  const { status } = useCloudSync()
  const [accountOpen, setAccountOpen] = useState(false)
  const dark = state.theme === 'dark'

  return <>
    <header className="relative z-40 mx-auto w-full max-w-[1650px] px-4 pt-4 sm:px-7 sm:pt-5 lg:px-10">
      <div className="flex h-14 items-center justify-between gap-4 sm:h-16">
        <button onClick={() => onChange('study')} className="flex min-w-0 items-center gap-3 text-left" aria-label="FirstPass home">
          <span className="flex h-9 w-10 items-center gap-[3px]"><span className="h-[23px] w-[15px] -skew-x-[18deg] rounded-[5px] bg-[#b58dff]" /><span className="h-[23px] w-[15px] -skew-x-[18deg] rounded-[5px] bg-[#6c30c8]" /></span>
          <span className="whitespace-nowrap text-[19px] font-extrabold tracking-[-.065em] sm:text-[22px]">FirstPass <span className="font-medium">Q-Bank</span></span>
        </button>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 rounded-full border border-white/60 bg-surface/70 p-1.5 shadow-[0_8px_30px_-24px_#43286f77] backdrop-blur-xl md:flex">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id || (tab === 'history' && id === 'progress')
            return <button key={id} onClick={() => onChange(id)} aria-current={active ? 'page' : undefined} className={`relative flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-bold transition-colors lg:px-5 ${active ? 'text-[#6328bc] dark:text-[#dec6ff]' : 'text-muted hover:text-ink'}`}>
              {active && <motion.span layoutId="fp-top-nav" className="absolute inset-0 rounded-full bg-[#eee0ff] shadow-sm dark:bg-[#442d64]" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} />}
              <Icon size={16} className="relative z-10" /><span className="relative z-10">{label}</span>
              {id === 'review' && reviewCount > 0 && <span className="relative z-10 rounded-full bg-[#e7d9fa] px-1.5 font-mono text-[10px] text-[#6f38be] dark:bg-[#67459a] dark:text-white">{Math.min(99, reviewCount)}{reviewCount > 99 ? '+' : ''}</span>}
            </button>
          })}
        </nav>

        <div className="flex items-center gap-2">
          <CloudSyncIndicator />
          <button onClick={onPickAvatar} title="Choose your doctor" aria-label="Choose your doctor avatar" className="grid h-10 w-10 place-items-center rounded-full border border-white/80 bg-surface/75 text-[#8250ce] shadow-sm transition hover:scale-105 hover:bg-surface"><UserRound size={18} /><span className="sr-only">{avatar ?? 'Not chosen'}</span></button>
          <button onClick={toggleTheme} title={dark ? 'Daylight Paper' : 'Obsidian Dark'} aria-label={dark ? 'Turn on light mode' : 'Turn on dark mode'} className="grid h-10 w-10 place-items-center rounded-full border border-white/80 bg-surface/75 text-[#41366e] shadow-sm transition hover:scale-105 dark:border-[#342c43] dark:text-[#d8c5ff]">
            <AnimatePresence mode="wait" initial={false}><motion.span key={dark ? 'sun' : 'moon'} initial={{ rotate: -20, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 20, opacity: 0 }} transition={{ duration: .15 }}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</motion.span></AnimatePresence>
          </button>
          <div className="relative">
            <button onClick={() => setAccountOpen((v) => !v)} title="Your account" aria-expanded={accountOpen} aria-label="Account settings" className="grid h-10 w-10 place-items-center rounded-full border border-white/80 bg-surface/75 text-[#41366e] shadow-sm transition hover:bg-surface dark:border-[#342c43] dark:text-[#d8c5ff]"><span className="text-xs font-extrabold">{user?.email?.slice(0, 1).toUpperCase() ?? '?'}</span></button>
            {accountOpen && <div className="absolute right-0 top-12 z-[90] w-[min(290px,80vw)] rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-float)]"><p className="px-2 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">Signed in as</p><p className="truncate px-2 py-2 text-xs font-semibold" title={user?.email}>{user?.email}</p><p className="mb-2 px-2 text-[10px] text-muted">Progress is private to your account.</p><button onClick={async () => { if (status !== 'saved' && !window.confirm('Some progress may not be synced yet. Your local copy will remain on this device. Sign out?')) return; setAccountOpen(false); try { await signOut() } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not sign out.') } }} className="flex w-full items-center gap-2 rounded-xl bg-sunken px-3 py-3 text-left text-xs font-semibold hover:text-bad"><LogOut size={16}/> Sign out</button></div>}
          </div>
        </div>
      </div>
    </header>

    <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-50 mx-auto max-w-[520px] rounded-[26px] border border-white/80 bg-surface/95 p-1.5 shadow-[0_8px_36px_-9px_#3b24604b] backdrop-blur-xl dark:border-[#5c4b6e]/60 md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id || (tab === 'history' && id === 'progress')
          return <button key={id} onClick={() => onChange(id)} aria-current={active ? 'page' : undefined} className={`relative flex h-[56px] flex-col items-center justify-center gap-1 rounded-[21px] text-[10px] font-semibold transition-colors ${active ? 'text-[#6323c1] dark:text-[#e5ccff]' : 'text-muted'}`}>
            {active && <motion.span layoutId="fp-mobile-nav" className="absolute inset-0 rounded-[21px] bg-[#eee2ff] dark:bg-[#443157]" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} />}
            <Icon size={19} strokeWidth={active ? 2.35 : 1.9} className="relative z-10" />
            <span className="relative z-10">{label}</span>
            {id === 'review' && reviewCount > 0 && <span className="absolute right-2 top-0 z-10 rounded-full bg-[#8e47eb] px-1 text-[8px] text-white">{reviewCount > 99 ? '99+' : reviewCount}</span>}
          </button>
        })}
      </div>
    </nav>
  </>
}
FIRSTPASS_ACCOUNTS_2_EOF
cat <<'FIRSTPASS_ACCOUNTS_3_EOF' > 'src/components/DoctorWalk.tsx'
import maleDoctor from '../assets/doctor-male-optimized.webp'
import femaleDoctor from '../assets/doctor-female-optimized.webp'
import { fieldKey } from '../lib/accountStorage'

export type DoctorAvatar = 'male' | 'female'
export const AVATAR_KEY = 'ui_doctor_avatar'

export function readAvatar(userId: string): DoctorAvatar | null {
  try {
    const saved = localStorage.getItem(fieldKey(userId, 'avatar'))
    return saved === 'male' || saved === 'female' ? saved : null
  } catch {
    return null
  }
}

export function DoctorWalk({ avatar, className = '', small = false }: {
  avatar: DoctorAvatar
  className?: string
  small?: boolean
}) {
  return (
    <div className={`doctor-walker pointer-events-none select-none ${className}`} role="img" aria-label={`${avatar === 'male' ? 'Male' : 'Female'} doctor illustration`}>
      <img src={avatar === 'male' ? maleDoctor : femaleDoctor} alt="" draggable={false}
        className={`absolute inset-0 h-full w-full object-contain object-bottom ${avatar === 'female' && !small ? 'doctor-female-pose-a' : ''}`} />
    </div>
  )
}
FIRSTPASS_ACCOUNTS_3_EOF
cat <<'FIRSTPASS_ACCOUNTS_4_EOF' > 'src/components/ProgressTab.tsx'
import { ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Download, History, Moon, RotateCcw, Sun, Target, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { SYSTEMS } from '../lib/data'
import { progressExport, useLearning } from '../lib/learning'
import { navigate } from '../lib/nav'
import { conceptsMastered, dateKey, summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import { card, label } from '../lib/ui'
import { countConcepts } from '../lib/sessionBuilder'
import { useAuth } from '../lib/auth'

export default function ProgressTab({ onViewHistory }: { onViewHistory: () => void }) {
  const { user } = useAuth()
  const { questions, state, resetProgress, toggleTheme, todayCount } = useStore()
  const { attempts, settings, setSettings, clearLearningProgress, schedule } = useLearning()
  const sum = summarize(questions, state.progress)
  const accuracy = sum.attempts ? Math.round((sum.correct / sum.attempts) * 100) : 0
  const names = [...SYSTEMS]
  for (const q of questions) if (!names.some((name) => name.toLowerCase() === q.system.toLowerCase())) names.push(q.system)
  const active = names
    .map((name) => ({ name, summary: summarize(questions.filter((q) => q.system.toLowerCase() === name.toLowerCase()), state.progress) }))
    .filter((item) => item.summary.total > 0)
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - 13 + index)
    const day = dateKey(date)
    const events = attempts.filter((a) => dateKey(new Date(a.at)) === day)
    return { day, label: date.toLocaleDateString(undefined, { weekday: 'short' }), total: events.length, correct: events.filter((a) => a.correct).length }
  })
  const maxDay = Math.max(1, ...days.map((day) => day.total))
  const averageTime = attempts.length ? Math.round(attempts.reduce((n, a) => n + a.seconds, 0) / attempts.length) : 0
  const dueNow = Object.values(schedule).filter((item) => item.dueAt <= Date.now()).length
  const daysUntilExam = settings.examDate ? Math.max(0, Math.ceil((new Date(`${settings.examDate}T12:00:00`).getTime() - Date.now()) / 86_400_000)) : null

  function reset() {
    if (window.confirm('Reset ALL question progress, flags, streak, sessions, history and flashcards? Personal notes and imported questions are kept. This cannot be undone. Export a backup first.')) {
      resetProgress()
      clearLearningProgress()
    }
  }

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className={`${label} flex items-center gap-2`}><BarChart3 size={13} className="text-accent" /> Your performance</p><h1 className="mt-2 font-display text-[36px] tracking-[-.055em] sm:text-[49px]">Learning insights<span className="text-accent">.</span></h1><p className="mt-1 text-[13px] text-muted">A clear view of where you are, and what comes next.</p></div><button onClick={onViewHistory} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-[12px] font-semibold text-ink shadow-sm hover:text-accent"><History size={16}/> Session history <ChevronRight size={14}/></button></header>

      <section className={`${card} overflow-hidden`}>
        <div className="grid lg:grid-cols-[1fr_1.15fr]">
          <div className="relative overflow-hidden border-b border-line bg-[linear-gradient(135deg,var(--surface),var(--sunken))] p-7 lg:border-b-0 lg:border-r">
            <div className="fine-grid pointer-events-none absolute -right-8 -top-8 h-52 w-52 rounded-full opacity-30 [mask-image:radial-gradient(circle,black,transparent_75%)]" />
            <p className={label}>Overall accuracy</p>
            <p className="mt-5 text-[72px] font-semibold leading-none tracking-[-.08em] tabular-nums">{accuracy}<span className="ml-1 text-[32px] font-normal text-muted">%</span></p>
            <p className="mt-3 text-[12px] text-muted">{sum.correct.toLocaleString()} correct answers out of {sum.attempts.toLocaleString()} attempts</p>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted"><Target size={13} className="text-accent" /> Progress over perfection</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line">
            <Metric Icon={CheckCircle2} title="Mastered" value={sum.mastered} note="Questions secured" />
            <Metric Icon={Target} title="Remaining" value={sum.remaining} note="Questions to tackle" />
            <Metric Icon={ArrowUpRight} title="Marked easy" value={sum.skipped} note="Similar angles skipped" />
            <Metric Icon={RotateCcw} title="Needs review" value={sum.hard} note="Again / hard" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className={`${card} p-5`}><p className={label}>Concepts secured</p><p className="mt-3 font-display text-[36px] tabular-nums">{conceptsMastered(questions, state.progress)} <span className="font-sans text-[12px] text-muted">/ {countConcepts(questions)}</span></p></div><div className={`${card} p-5`}><p className={label}>Questions today</p><p className="mt-3 font-display text-[36px] tabular-nums">{todayCount} <span className="font-sans text-[12px] text-muted">/ {settings.dailyGoal}</span></p></div><div className={`${card} col-span-2 p-5 sm:col-span-1`}><p className={label}>Review ready</p><p className="mt-3 font-display text-[36px] tabular-nums">{dueNow} <span className="font-sans text-[12px] text-muted">concepts</span></p></div></section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className={label}>Your rhythm</p><h2 className="mt-1 text-[18px] font-bold tracking-tight">Last 14 days</h2></div><span className="rounded-full bg-sunken px-2.5 py-1 font-mono text-[10px] text-muted">{attempts.length} tracked attempts</span></div>
          <div className="mt-8 grid h-32 grid-cols-14 items-end gap-1.5 sm:gap-2" role="img" aria-label="Fourteen day study question volume chart">
            {days.map((day) => <div key={day.day} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5" title={`${day.day}: ${day.total} attempted, ${day.correct} correct`}>
              <div className="flex w-full flex-1 items-end"><motion.div initial={{ height: 0 }} whileInView={{ height: `${Math.max(4, (day.total / maxDay) * 100)}%` }} viewport={{ once: true }} className={`w-full rounded-t-md ${day.total ? 'bg-accent/80' : 'bg-sunken'}`} /></div>
              <span className="hidden text-[9px] text-muted sm:block">{day.label.slice(0, 1)}</span>
            </div>)}
          </div>
          <p className="mt-3 text-[11px] text-muted">New sessions are tracked here. Older progress remains in your overall statistics above.</p>
        </div>
        <div className={`${card} flex flex-col justify-between p-5 sm:p-6`}>
          <div><p className={label}>Recall intelligence</p><h2 className="mt-1 text-[18px] font-bold tracking-tight">Your review outlook</h2></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-sunken p-4"><p className="text-[10px] text-muted">Concepts due</p><p className="mt-2 text-[30px] font-bold tabular-nums tracking-tight">{dueNow}</p></div>
            <div className="rounded-xl bg-sunken p-4"><p className="text-[10px] text-muted">Avg. seconds / Q</p><p className="mt-2 text-[30px] font-bold tabular-nums tracking-tight">{averageTime || '—'}</p></div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">Spacing intervals adapt when you rate an answer Again, Good or Easy.</p>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between"><div><p className={label}>By discipline</p><h2 className="mt-1.5 text-[22px] font-bold tracking-[-.04em]">System breakdown</h2></div><span className="font-mono text-[11px] text-muted">{active.length} active systems</span></div>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          {active.length === 0 && <p className="p-8 text-center text-[13px] text-muted">Start a study session to build your insights.</p>}
          {active.map(({ name, summary }) => <div key={name} className="px-5 py-4 transition-colors hover:bg-sunken/40 sm:px-6"><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-semibold">{name}</span><span className="font-mono text-[11px] tabular-nums text-muted">{summary.mastered + summary.skipped} / {summary.total} <span className="px-1 opacity-50">·</span> {summary.pct}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"><motion.div initial={{ width: 0 }} whileInView={{ width: `${summary.pct}%` }} viewport={{ once: true }} className="h-full rounded-full bg-accent" /></div></div>)}
        </div>
      </section>

      <section>
        <p className={`${label} mb-3`}>Workspace preferences</p>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Target size={17}/></span><span><span className="block text-[13px] font-semibold">Daily question goal</span><span className="mt-0.5 block text-[11px] text-muted">Adjust your personal target</span></span></span><input aria-label="Daily question goal" type="number" min={1} max={500} value={settings.dailyGoal} onChange={(e) => setSettings({ dailyGoal: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} className="w-20 rounded-lg border border-line bg-sunken px-3 py-2 text-center font-mono text-[12px] outline-none focus:border-accent" /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><CalendarDays size={17}/></span><span><span className="block text-[13px] font-semibold">Exam countdown</span><span className="mt-0.5 block text-[11px] text-muted">{daysUntilExam === null ? 'Add your exam date' : `${daysUntilExam} days to your exam`}</span></span></span><input aria-label="Exam date" type="date" value={settings.examDate} onChange={(e) => setSettings({ examDate: e.target.value })} className="rounded-lg border border-line bg-sunken px-3 py-2 text-[12px] outline-none focus:border-accent" /></div>
          <button onClick={() => { if (user) progressExport(user.id) }} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Download size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Download progress backup</span><span className="mt-0.5 block text-[11px] text-muted">Includes your account progress, study history, notes and avatar</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={toggleTheme} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted">{state.theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}</span><span className="flex-1"><span className="block text-[13px] font-semibold">Appearance</span><span className="mt-0.5 block text-[11px] text-muted">{state.theme === 'dark' ? 'Obsidian dark' : 'Daylight paper'}</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={() => navigate('/admin')} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-sunken text-muted"><Upload size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold">Manage question library</span><span className="mt-0.5 block text-[11px] text-muted">Import JSON files and review your catalog</span></span><ChevronRight size={16} className="text-muted" /></button>
          <button onClick={reset} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-bad/5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-bad/10 text-bad"><RotateCcw size={17} /></span><span className="flex-1"><span className="block text-[13px] font-semibold text-bad">Reset learning progress</span><span className="mt-0.5 block text-[11px] text-muted">Your imported questions remain safe</span></span><ChevronRight size={16} className="text-muted" /></button>
        </div>
      </section>
    </div>
  )
}

function Metric({ Icon, title, value, note }: { Icon: typeof Target; title: string; value: number; note: string }) {
  return <div className="bg-surface p-6"><div className="flex items-center gap-2 text-[11px] text-muted"><Icon size={14} /> {title}</div><p className="mt-3 text-[29px] font-bold tracking-[-.05em] tabular-nums">{value.toLocaleString()}</p><p className="mt-0.5 text-[10px] text-muted">{note}</p></div>
}
FIRSTPASS_ACCOUNTS_4_EOF
cat <<'FIRSTPASS_ACCOUNTS_5_EOF' > 'src/components/AccountGate.tsx'
import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Cloud, Download, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { downloadLegacyBackup, emptySnapshot, hasAccountCache, hasLegacyProgress, isPending, isSnapshot,
  readSnapshot, saveSnapshot, setPending, type AccountSnapshot } from '../lib/accountStorage'
import { loadBundledQuestions } from '../lib/data'
import { progressExport } from '../lib/learning'
import { supabase } from '../lib/supabase'
import AuthScreen from './AuthScreen'

export interface AccountBoot {
  snapshot: AccountSnapshot
  revision: number
  pending: boolean
}

type Choice =
  | { kind: 'legacy' }
  | { kind: 'conflict'; local: AccountSnapshot; cloud: AccountSnapshot; revision: number }

export default function AccountGate({ children }: { children: (userId: string, boot: AccountBoot) => ReactNode }) {
  const { user, loading, recoveringPassword } = useAuth()
  const [boot, setBoot] = useState<AccountBoot | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBoot(null); setChoice(null); setError('')
    if (!user || !supabase) return
    const userId = user.id
    const client = supabase
    let canceled = false
    // Warm the exact existing full-bank loader during the small account fetch.
    void loadBundledQuestions().catch(() => {})
    async function initialize() {
      setBusy(true)
      try {
        const { data, error: dbError } = await client.from('user_qbank_state')
          .select('snapshot, revision').eq('user_id', userId).maybeSingle()
        if (canceled) return
        if (dbError) throw dbError
        if (data) {
          if (!isSnapshot(data.snapshot)) throw new Error('Saved cloud progress has an unexpected format. No local data has been changed. Please contact support.')
          const cloud = data.snapshot
          const local = readSnapshot(userId)
          if (hasAccountCache(userId) && isPending(userId) && JSON.stringify(local) !== JSON.stringify(cloud)) {
            setChoice({ kind: 'conflict', cloud, local, revision: Number(data.revision) })
          } else {
            finalize(cloud, Number(data.revision), false)
          }
        } else if (hasAccountCache(userId)) {
          finalize(readSnapshot(userId), 0, true)
        } else if (hasLegacyProgress()) {
          setChoice({ kind: 'legacy' })
        } else {
          finalize(emptySnapshot(), 0, true)
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : 'Could not connect to your secure cloud account.')
      } finally { if (!canceled) setBusy(false) }
    }
    function finalize(snapshot: AccountSnapshot, revision: number, pending: boolean) {
      if (canceled) return
      try {
        saveSnapshot(userId, snapshot)
        setPending(userId, pending)
        setBoot({ snapshot, revision, pending })
        setChoice(null)
        setError('')
      } catch {
        setError('Browser storage is full or unavailable. Please free some space before continuing; your original progress is unchanged.')
      }
    }
    void initialize()
    return () => { canceled = true }
  }, [user?.id])

  const finishChoice = (snapshot: AccountSnapshot, revision: number, pending: boolean) => {
    if (!user) return
    try {
      saveSnapshot(user.id, snapshot)
      setPending(user.id, pending)
      setBoot({ snapshot, revision, pending })
      setChoice(null)
    } catch { setError('Browser storage is unavailable. No progress has been deleted.') }
  }

  if (loading) return <Loading text="Restoring your secure study account…" />
  if (!user || recoveringPassword) return <AuthScreen />
  if (boot) return <>{children(user.id, boot)}</>

  return <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 text-ink">
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[600px] rounded-[30px] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-10">
      <p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.2em] text-accent"><Sparkles size={15} /> Your private learning space</p>
      {busy && !choice && !error && <div className="mt-7"><h1 className="font-display text-4xl tracking-tight">Preparing your account…</h1><p className="mt-3 text-sm leading-6 text-muted">Checking your saved cloud progress before opening the dashboard.</p><div className="mt-7 h-1 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div></div>}
      {choice?.kind === 'legacy' && <>
        <h1 className="mt-5 font-display text-[45px] leading-tight tracking-tight">We found your previous progress.</h1>
        <p className="mt-4 text-sm leading-7 text-muted">This browser has FirstPass progress from before accounts existed. Choose whether to copy it into <strong className="text-ink">{user.email}</strong>. Your original browser data will not be deleted or changed.</p>
        <div className="mt-7 grid gap-3">
          <button onClick={() => finishChoice(readSnapshot(), 0, true)} className="group flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-left transition hover:border-accent"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white"><Download size={21}/></span><span className="flex-1"><strong className="block text-sm">Import my existing progress</strong><span className="mt-1 block text-xs leading-5 text-muted">Copy answers, streaks, notes, flashcards and any imported questions into this account.</span></span><ArrowRight size={19} className="text-accent"/></button>
          <button onClick={() => finishChoice(emptySnapshot(), 0, true)} className="flex items-center gap-4 rounded-2xl border border-line p-5 text-left transition hover:bg-sunken"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sunken text-muted"><Cloud size={21}/></span><span className="flex-1"><strong className="block text-sm">Start fresh with this account</strong><span className="mt-1 block text-xs leading-5 text-muted">Do not import the old progress. You can still access a backup of it later.</span></span><ArrowRight size={19} className="text-muted"/></button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><p className="flex items-center gap-2 text-[11px] text-muted"><ShieldCheck size={15}/> Your old progress stays untouched.</p><button onClick={downloadLegacyBackup} className="rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-accent">Download old progress backup</button></div>
      </>}
      {choice?.kind === 'conflict' && <>
        <h1 className="mt-5 font-display text-[42px] leading-tight tracking-tight">Two versions of your progress.</h1>
        <p className="mt-4 text-sm leading-7 text-muted">This device has changes that haven't synced, and your cloud account has a different copy. Choose which one to keep. Nothing will be replaced until you decide.</p>
        <div className="mt-7 grid gap-3">
          <button onClick={() => finishChoice(choice.local, choice.revision, true)} className="flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-left"><Cloud size={22} className="shrink-0 text-accent"/><span className="flex-1"><strong className="block text-sm">Keep this device's progress</strong><span className="mt-1 block text-xs text-muted">Sync the device's copy and replace the cloud copy.</span></span><ArrowRight size={18}/></button>
          <button onClick={() => finishChoice(choice.cloud, choice.revision, false)} className="flex items-center gap-4 rounded-2xl border border-line p-5 text-left"><Download size={22} className="shrink-0 text-muted"/><span className="flex-1"><strong className="block text-sm">Use cloud progress</strong><span className="mt-1 block text-xs text-muted">Replace the unsynced device copy with the cloud copy.</span></span><ArrowRight size={18}/></button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><p className="flex items-center gap-2 text-[11px] text-muted"><TriangleAlert size={15}/> If unsure, save a backup first.</p><button onClick={() => progressExport(user.id)} className="rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-accent">Download device backup</button></div>
      </>}
      {!!error && <div role="alert" className="mt-7 rounded-2xl border border-bad/25 bg-bad/10 p-5"><p className="font-semibold text-bad">Couldn't open your saved progress</p><p className="mt-2 text-xs leading-6 text-muted">{error}</p><button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white">Retry safely</button></div>}
    </motion.section>
  </div>
}

function Loading({ text }: { text: string }) {
  return <div className="grid min-h-dvh place-items-center bg-canvas px-4 text-ink"><div className="text-center"><div className="mx-auto mb-5 grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-accent/15 text-accent"><Cloud size={24}/></div><h1 className="text-xl font-bold">FirstPass Q-Bank</h1><p className="mt-2 text-sm text-muted">{text}</p></div></div>
}
FIRSTPASS_ACCOUNTS_5_EOF
cat <<'FIRSTPASS_ACCOUNTS_6_EOF' > 'src/components/AuthScreen.tsx'
import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, BookOpen, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isCloudConfigured, supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'forgot' | 'recover'

export default function AuthScreen() {
  const { recoveringPassword, finishPasswordRecovery } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const currentMode = recoveringPassword ? 'recover' : mode

  const changeMode = (next: Mode) => {
    setMode(next); setError(''); setMessage(''); setPassword(''); setConfirmPassword('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setMessage('')
    if (!supabase) return
    if ((currentMode === 'signup' || currentMode === 'recover') && password !== confirmPassword) {
      setError('Passwords do not match.'); return
    }
    if ((currentMode === 'signup' || currentMode === 'recover') && password.length < 8) {
      setError('Use at least 8 characters for your password.'); return
    }
    setBusy(true)
    try {
      if (currentMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (currentMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setMessage(data.session
          ? 'Account created. Your private study space is ready.'
          : 'Check your inbox for a verification link, then come back and log in.')
        if (!data.session) { setMode('login'); setPassword(''); setConfirmPassword('') }
      } else if (currentMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setMessage('If this email has an account, a password-reset link is on its way.')
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        finishPasswordRecovery()
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setMessage('Password updated successfully.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete your request. Please try again.')
    } finally { setBusy(false) }
  }

  const title = currentMode === 'signup' ? 'Your journey starts here.'
    : currentMode === 'forgot' ? 'Reset your password.'
    : currentMode === 'recover' ? 'Choose a new password.' : 'Welcome back.'

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(470px,0.82fr)]">
      <section className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-[#2d2341] px-[clamp(32px,6vw,112px)] py-12 text-[#faf5ff] lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 65% 40%,#8553b44f,transparent 55%),radial-gradient(circle at 12% 100%,#784f944f,transparent 40%)' }} />
        <div className="relative flex items-center gap-3 text-xl font-bold tracking-tight"><Logo /> FirstPass <span className="font-light">Q-Bank</span></div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .48 }} className="relative max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d6b8ff3b] bg-[#bd98ef1c] px-4 py-2 text-[11px] font-extrabold tracking-[.22em] text-[#debfff]"><Sparkles size={14} /> YOUR STUDY JOURNEY</span>
          <h2 className="mt-7 font-display text-[clamp(58px,6.2vw,100px)] leading-[.97] tracking-[-.075em]">Medicine is a journey.<span className="block text-[#c6a0ff]">Make it yours.</span></h2>
          <p className="mt-8 max-w-md text-[16px] leading-8 text-[#ddd0e9]">One beautifully focused place for every First Aid concept, every practice question, and every step of your progress.</p>
        </motion.div>
        <div className="relative flex flex-wrap gap-5 text-xs text-[#d3c2e5]"><span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Private cloud progress</span><span className="inline-flex items-center gap-2"><BookOpen size={16} /> Your whole question bank</span></div>
      </section>

      <section className="flex min-h-dvh flex-col px-5 pb-16 pt-8 sm:px-10 lg:justify-center lg:px-[clamp(32px,6vw,110px)]">
        <div className="mb-14 flex items-center gap-2.5 text-[18px] font-bold lg:hidden"><Logo /> FirstPass <span className="font-normal">Q-Bank</span></div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={currentMode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .18 }} className="mx-auto w-full max-w-[440px]">
            <span className="text-[11px] font-extrabold uppercase tracking-[.23em] text-accent">Your personal study space</span>
            <h1 className="mt-3 font-display text-[clamp(43px,4vw,62px)] leading-[1.07] tracking-[-.065em]">{title}</h1>
            <p className="mt-4 text-sm leading-7 text-muted">{currentMode === 'signup' ? 'Create an account to keep your learning safe and synced.' : currentMode === 'forgot' ? 'We’ll send you a secure link to get back in.' : currentMode === 'recover' ? 'Use a strong new password to protect your progress.' : 'Log in to pick up right where you left off.'}</p>

            {!isCloudConfigured ? (
              <div className="mt-9 rounded-2xl border border-[#eac69a] bg-[#fff4e6] p-5 text-[#674423] dark:bg-[#3d3028] dark:text-[#f8dbbe]">
                <p className="font-bold">Cloud setup needed</p>
                <p className="mt-2 text-[13px] leading-6">Create a Supabase project, run the supplied database SQL, and add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>. Then restart Vite. Your existing progress is unchanged.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-8 space-y-4">
                {currentMode !== 'recover' && <label className="block"><span className="mb-2 block text-[12px] font-bold">Email address</span><span className="relative block"><Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"/><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="doctor@example.com" className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-4 text-[14px] outline-none transition focus:border-accent" /></span></label>}
                {currentMode !== 'forgot' && <label className="block"><span className="mb-2 block text-[12px] font-bold">{currentMode === 'recover' ? 'New password' : 'Password'}</span><span className="relative block"><LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"/><input required type={reveal ? 'text' : 'password'} autoComplete={currentMode === 'login' ? 'current-password' : 'new-password'} minLength={currentMode === 'login' ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-12 text-[14px] outline-none transition focus:border-accent" /><button type="button" aria-label={reveal ? 'Hide password' : 'Show password'} onClick={() => setReveal(!reveal)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">{reveal ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
                {(currentMode === 'signup' || currentMode === 'recover') && <label className="block"><span className="mb-2 block text-[12px] font-bold">Confirm password</span><input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" className="h-14 w-full rounded-2xl border border-line bg-surface px-4 text-[14px] outline-none transition focus:border-accent" /></label>}
                {currentMode === 'login' && <div className="text-right"><button type="button" onClick={() => changeMode('forgot')} className="text-xs font-semibold text-accent hover:underline">Forgot password?</button></div>}
                {error && <p role="alert" className="rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-xs leading-5 text-bad">{error}</p>}
                {message && <p role="status" className="flex gap-2 rounded-xl border border-good/25 bg-good/10 px-4 py-3 text-xs leading-5 text-good"><Check size={16} className="shrink-0" />{message}</p>}
                <button disabled={busy} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#783aca] px-5 text-[14px] font-bold text-white shadow-[0_13px_30px_-14px_#783acaaa] transition hover:bg-[#682ac1] disabled:opacity-60">{busy ? 'Please wait…' : currentMode === 'signup' ? 'Create my account' : currentMode === 'forgot' ? 'Send reset link' : currentMode === 'recover' ? 'Save new password' : 'Log in to FirstPass'} <ArrowRight size={18} /></button>
              </form>
            )}

            {isCloudConfigured && currentMode !== 'recover' && <div className="mt-8 border-t border-line pt-6 text-center text-[13px] text-muted">{currentMode === 'login' ? 'New to FirstPass?' : 'Already have an account?'} <button onClick={() => changeMode(currentMode === 'login' ? 'signup' : 'login')} className="ml-1 font-bold text-accent hover:underline">{currentMode === 'login' ? 'Create an account' : 'Log in'}</button></div>}
            <p className="mt-12 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted"><ShieldCheck size={14}/> Your progress is private to your account.</p>
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  )
}

function Logo() {
  return <span aria-hidden className="flex h-9 items-center gap-1"><span className="h-6 w-3 -skew-x-[18deg] rounded-[4px] bg-[#b78cfa]"/><span className="h-6 w-3 -skew-x-[18deg] rounded-[4px] bg-[#7130c7]"/></span>
}
FIRSTPASS_ACCOUNTS_6_EOF
cat <<'FIRSTPASS_ACCOUNTS_7_EOF' > 'src/lib/store.tsx'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Confidence, PersistedState, Progress, Question, RawQuestion } from '../types/qbank'
import { loadBundledQuestions, makeId, toQuestions, validateQuestions } from './data'
import { dateKey } from './stats'
import { conceptKey } from './sessionBuilder'
import { fieldKey } from './accountStorage'

export const DAILY_GOAL = 20

const blank = (): Progress => ({ attempts: 0, correct: 0, wrong: 0 })

function loadState(userId: string): PersistedState {
  const fallback: PersistedState = {
    progress: {},
    flagged: [],
    studyDates: [],
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  }
  try {
    const s = JSON.parse(localStorage.getItem(fieldKey(userId, 'state')) || 'null')
    const persisted = s ? { ...fallback, ...s } : fallback
    const uiTheme = localStorage.getItem(fieldKey(userId, 'theme'))
    return { ...persisted, theme: uiTheme === 'dark' || uiTheme === 'light' ? uiTheme : persisted.theme }
  } catch {
    return fallback
  }
}

function loadImported(userId: string): RawQuestion[] {
  try {
    return validateQuestions(JSON.parse(localStorage.getItem(fieldKey(userId, 'imported')) || '[]')).valid
  } catch {
    return []
  }
}

function loadDaily(userId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(fieldKey(userId, 'daily')) || '{}')
  } catch {
    return {}
  }
}

interface Store {
  bankStatus: 'loading' | 'ready' | 'error'
  questions: Question[]
  byId: Map<string, Question>
  state: PersistedState
  imported: RawQuestion[]
  daily: Record<string, number>
  importedCount: number
  todayCount: number
  dailyGoal: number
  importQuestions: (raw: RawQuestion[]) => { added: number; duplicates: number }
  clearImported: () => void
  recordAnswer: (id: string, correct: boolean) => void
  setConfidence: (id: string, level: Confidence) => void
  toggleFlag: (id: string) => void
  resetProgress: () => void
  toggleTheme: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [state, setState] = useState<PersistedState>(() => loadState(userId))
  const [imported, setImported] = useState<RawQuestion[]>(() => loadImported(userId))
  const [daily, setDaily] = useState<Record<string, number>>(() => loadDaily(userId))
  const [baseQuestions, setBaseQuestions] = useState<RawQuestion[]>([])
  const [bankStatus, setBankStatus] = useState<Store['bankStatus']>('loading')

  useEffect(() => {
    let current = true
    loadBundledQuestions().then((loaded) => {
      if (current) {
        setBaseQuestions(loaded)
        setBankStatus('ready')
      }
    }).catch((error: unknown) => {
      console.error('[FirstPass] Question bank failed to load:', error)
      if (current) setBankStatus('error')
    })
    return () => { current = false }
  }, [])

  const questions = useMemo(() => {
    const map = new Map<string, Question>()
    for (const q of toQuestions([...baseQuestions, ...imported])) if (!map.has(q.id)) map.set(q.id, q)
    return [...map.values()]
  }, [baseQuestions, imported])

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])

  useEffect(() => {
    localStorage.setItem(fieldKey(userId, 'state'), JSON.stringify(state))
    localStorage.setItem(fieldKey(userId, 'theme'), state.theme)
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
  }, [state, userId])

  useEffect(() => {
    localStorage.setItem(fieldKey(userId, 'imported'), JSON.stringify(imported))
  }, [imported, userId])

  useEffect(() => {
    localStorage.setItem(fieldKey(userId, 'daily'), JSON.stringify(daily))
  }, [daily, userId])

  const importQuestions = useCallback(
    (raw: RawQuestion[]) => {
      const existing = new Set(questions.map((q) => q.id))
      const fresh: RawQuestion[] = []
      let duplicates = 0
      for (const r of raw) {
        const id = makeId(r)
        if (existing.has(id)) duplicates++
        else {
          existing.add(id)
          fresh.push(r)
        }
      }
      if (fresh.length) setImported((prev) => [...prev, ...fresh])
      return { added: fresh.length, duplicates }
    },
    [questions],
  )

  const clearImported = useCallback(() => setImported([]), [])

  const recordAnswer = useCallback((id: string, correct: boolean) => {
    const today = dateKey()
    setDaily((d) => ({ ...d, [today]: (d[today] ?? 0) + 1 }))
    setState((s) => {
      const p = s.progress[id] ?? blank()
      return {
        ...s,
        studyDates: s.studyDates.includes(today) ? s.studyDates : [...s.studyDates, today],
        progress: {
          ...s.progress,
          [id]: {
            ...p,
            attempts: p.attempts + 1,
            correct: p.correct + (correct ? 1 : 0),
            wrong: p.wrong + (correct ? 0 : 1),
            lastCorrect: correct,
            lastAt: Date.now(),
          },
        },
      }
    })
  }, [])

  const setConfidence = useCallback(
    (id: string, level: Confidence) => {
      setState((s) => {
        const progress = { ...s.progress }
        const cur = progress[id] ?? blank()
        progress[id] = { ...cur, status: level === 'hard' ? 'hard' : 'mastered' }
        if (level === 'easy') {
          const q = byId.get(id)
          if (q) {
            for (const o of questions) {
              if (conceptKey(o) === conceptKey(q) && o.id !== id) {
                const p = progress[o.id]
                if (!p || p.attempts === 0) progress[o.id] = { ...(p ?? blank()), status: 'skipped' }
              }
            }
          }
        }
        return { ...s, progress }
      })
    },
    [byId, questions],
  )

  const toggleFlag = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      flagged: s.flagged.includes(id) ? s.flagged.filter((x) => x !== id) : [...s.flagged, id],
    }))
  }, [])

  const resetProgress = useCallback(() => {
    setState((s) => ({ ...s, progress: {}, flagged: [], studyDates: [] }))
    setDaily({})
  }, [])

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))
  }, [])

  const value: Store = {
    bankStatus,
    questions,
    byId,
    state,
    imported,
    daily,
    importedCount: imported.length,
    todayCount: daily[dateKey()] ?? 0,
    dailyGoal: DAILY_GOAL,
    importQuestions,
    clearImported,
    recordAnswer,
    setConfidence,
    toggleFlag,
    resetProgress,
    toggleTheme,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used inside StoreProvider')
  return c
}
FIRSTPASS_ACCOUNTS_7_EOF
cat <<'FIRSTPASS_ACCOUNTS_8_EOF' > 'src/lib/learning.tsx'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { conceptKey, selectSessionQuestions } from './sessionBuilder'
import type { Answer, Confidence, OptionKey, Progress, Question, Session, SessionMode } from '../types/qbank'
import { fieldKey, LEGACY_KEYS } from './accountStorage'

export const LEARNING_KEY = 'fp:learning:v1'
const DAY = 86_400_000

export interface ReviewItem {
  dueAt: number
  intervalDays: number
  repetitions: number
  lastReviewed: number
}

export interface AttemptEvent {
  id: string
  at: number
  correct: boolean
  seconds: number
  mode: SessionMode
}

export interface HistoryEntry {
  id: string
  title: string
  completedAt: number
  mode: SessionMode
  ids: string[]
  selections: Record<string, OptionKey | null>
  times: Record<string, number>
  elapsed: number
  correct: number
  answered: number
}

export interface ActiveSession {
  session: Session
  queue: string[]
  position: number
  answers: Record<string, Answer>
  ratings: Record<string, Confidence>
  times: Record<string, number>
  startedAt: number
  updatedAt: number
}

export interface StudyNote { text: string; updatedAt: number }
export interface Flashcard {
  id: string
  questionId: string
  front: string
  back: string
  dueAt: number
  intervalDays: number
  reviews: number
}

export interface LearningSettings {
  dailyGoal: number
  examDate: string
}

export interface LearningState {
  schedule: Record<string, ReviewItem>
  attempts: AttemptEvent[]
  history: HistoryEntry[]
  active: ActiveSession | null
  notes: Record<string, StudyNote>
  flashcards: Flashcard[]
  settings: LearningSettings
}

function defaults(): LearningState {
  return {
    schedule: {}, attempts: [], history: [], active: null,
    notes: {}, flashcards: [], settings: { dailyGoal: 20, examDate: '' },
  }
}

function load(userId: string): LearningState {
  const fallback = defaults()
  try {
    const value = JSON.parse(localStorage.getItem(fieldKey(userId, 'learning')) || 'null') as Partial<LearningState> | null
    if (!value || typeof value !== 'object') return fallback
    return {
      schedule: value.schedule && typeof value.schedule === 'object' ? value.schedule : {},
      attempts: Array.isArray(value.attempts) ? value.attempts : [],
      history: Array.isArray(value.history) ? value.history : [],
      active: value.active?.session && Array.isArray(value.active.queue) ? value.active : null,
      notes: value.notes && typeof value.notes === 'object' ? value.notes : {},
      flashcards: Array.isArray(value.flashcards) ? value.flashcards : [],
      settings: { ...fallback.settings, ...value.settings },
    }
  } catch { return fallback }
}

interface LearningContextValue extends LearningState {
  setActive: (snapshot: ActiveSession | null) => void
  recordAttempt: (q: Question, correct: boolean, seconds: number, mode: SessionMode) => void
  rateConcept: (q: Question, rating: Confidence) => void
  recordHistory: (entry: Omit<HistoryEntry, 'id' | 'completedAt'>) => void
  saveNote: (id: string, text: string) => void
  addFlashcard: (question: Question) => void
  gradeFlashcard: (id: string, rating: Confidence) => void
  setSettings: (settings: Partial<LearningSettings>) => void
  clearLearningProgress: () => void
}

const Context = createContext<LearningContextValue | null>(null)

export function LearningProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [data, setData] = useState<LearningState>(() => load(userId))

  useEffect(() => {
    try { localStorage.setItem(fieldKey(userId, 'learning'), JSON.stringify(data)) }
    catch (error) { console.error('[FirstPass] Could not save extended learning data', error) }
  }, [data, userId])

  const setActive = useCallback((snapshot: ActiveSession | null) => {
    setData((s) => ({ ...s, active: snapshot }))
  }, [])

  const recordAttempt = useCallback((q: Question, correct: boolean, seconds: number, mode: SessionMode) => {
    const now = Date.now()
    setData((s) => {
      const key = conceptKey(q)
      const prev = s.schedule[key]
      const intervalDays = correct ? Math.max(3, prev?.intervalDays ?? 3) : 1
      return {
        ...s,
        attempts: [...s.attempts.slice(-14_999), { id: q.id, at: now, correct, seconds: Math.max(0, seconds), mode }],
        schedule: {
          ...s.schedule,
          [key]: { dueAt: now + intervalDays * DAY, intervalDays,
            repetitions: correct ? (prev?.repetitions ?? 0) + 1 : 0, lastReviewed: now },
        },
      }
    })
  }, [])

  const rateConcept = useCallback((q: Question, rating: Confidence) => {
    const now = Date.now()
    setData((s) => {
      const key = conceptKey(q)
      const prev = s.schedule[key]
      const intervalDays = rating === 'hard' ? 1 : rating === 'good'
        ? Math.min(90, prev?.repetitions ? Math.max(3, Math.round(prev.intervalDays * 2)) : 3)
        : Math.min(120, prev?.repetitions ? Math.max(7, Math.round(prev.intervalDays * 2.5)) : 7)
      return { ...s, schedule: { ...s.schedule, [key]: {
        dueAt: now + intervalDays * DAY, intervalDays,
        repetitions: rating === 'hard' ? 0 : (prev?.repetitions ?? 0) + 1,
        lastReviewed: now,
      } } }
    })
  }, [])

  const recordHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'completedAt'>) => {
    setData((s) => ({ ...s, history: [{ ...entry, id: crypto.randomUUID(), completedAt: Date.now() }, ...s.history].slice(0, 120) }))
  }, [])

  const saveNote = useCallback((id: string, value: string) => {
    setData((s) => ({ ...s, notes: { ...s.notes, [id]: { text: value, updatedAt: Date.now() } } }))
  }, [])

  const addFlashcard = useCallback((q: Question) => {
    setData((s) => {
      if (s.flashcards.some((c) => c.questionId === q.id)) return s
      return { ...s, flashcards: [...s.flashcards, {
        id: crypto.randomUUID(), questionId: q.id, front: q.concept_name,
        back: q.high_yield_pearl, dueAt: Date.now(), intervalDays: 0, reviews: 0,
      }] }
    })
  }, [])

  const gradeFlashcard = useCallback((id: string, rating: Confidence) => {
    setData((s) => ({ ...s, flashcards: s.flashcards.map((c) => {
      if (c.id !== id) return c
      const intervalDays = rating === 'hard' ? 1 : rating === 'good'
        ? Math.max(3, Math.round(c.intervalDays * 2))
        : Math.max(7, Math.round(c.intervalDays * 2.5))
      return { ...c, intervalDays, reviews: c.reviews + 1, dueAt: Date.now() + intervalDays * DAY }
    }) }))
  }, [])

  const setSettings = useCallback((settings: Partial<LearningSettings>) => {
    setData((s) => ({ ...s, settings: { ...s.settings, ...settings } }))
  }, [])

  const clearLearningProgress = useCallback(() => {
    setData((s) => ({ ...s, schedule: {}, attempts: [], history: [], active: null, flashcards: [] }))
  }, [])

  const value = useMemo(() => ({ ...data, setActive, recordAttempt, rateConcept,
    recordHistory, saveNote, addFlashcard, gradeFlashcard, setSettings, clearLearningProgress }),
  [data, setActive, recordAttempt, rateConcept, recordHistory, saveNote, addFlashcard, gradeFlashcard, setSettings, clearLearningProgress])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLearning(): LearningContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('useLearning must be inside LearningProvider')
  return context
}

export function dueConceptQuestions(questions: Question[], schedule: Record<string, ReviewItem>, progress: Record<string, Progress>): Question[] {
  const now = Date.now()
  const pool = questions.filter((q) => schedule[conceptKey(q)]?.dueAt <= now)
  return selectSessionQuestions(pool, 'core_concepts', progress)
}

export function progressExport(userId: string): void {
  const keys = Object.keys(LEGACY_KEYS) as (keyof typeof LEGACY_KEYS)[]
  const payload: Record<string, string | null> = {}
  for (const field of keys) payload[LEGACY_KEYS[field]] = localStorage.getItem(fieldKey(userId, field))
  const blob = new Blob([JSON.stringify({ app: 'FirstPass Q-Bank', version: 3, exportedAt: new Date().toISOString(), userId, storage: payload }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `firstpass-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
FIRSTPASS_ACCOUNTS_8_EOF
cat <<'FIRSTPASS_ACCOUNTS_9_EOF' > 'src/lib/accountStorage.ts'
import type { PersistedState, RawQuestion } from '../types/qbank'
import type { LearningState } from './learning'
import type { DoctorAvatar } from '../components/DoctorWalk'

// The original keys are deliberately never removed or rewritten during migration.
export const LEGACY_KEYS = {
  state: 'fp:state:v1',
  imported: 'fp:imported:v1',
  daily: 'fp:daily:v1',
  learning: 'fp:learning:v1',
  theme: 'ui_theme',
  avatar: 'ui_doctor_avatar',
} as const

export type AccountField = keyof typeof LEGACY_KEYS

export const scopedKey = (userId: string, key: string): string => `fp:account:${userId}:${key}`
export const fieldKey = (userId: string, field: AccountField): string => scopedKey(userId, LEGACY_KEYS[field])
export const pendingKey = (userId: string): string => scopedKey(userId, 'pending-cloud-sync:v1')

export interface AccountSnapshot {
  schema: 1
  state: PersistedState
  imported: RawQuestion[]
  daily: Record<string, number>
  learning: LearningState
  avatar: DoctorAvatar | null
}

export function emptySnapshot(): AccountSnapshot {
  return {
    schema: 1,
    state: { progress: {}, flagged: [], studyDates: [], theme: 'light' },
    imported: [], daily: {},
    learning: { schedule: {}, attempts: [], history: [], active: null, notes: {},
      flashcards: [], settings: { dailyGoal: 20, examDate: '' } },
    avatar: null,
  }
}

function parse(raw: string | null): unknown {
  try { return raw === null ? null : JSON.parse(raw) } catch { return null }
}

export function readSnapshot(userId?: string): AccountSnapshot {
  const get = (field: AccountField) => localStorage.getItem(userId ? fieldKey(userId, field) : LEGACY_KEYS[field])
  const fallback = emptySnapshot()
  const rawState = parse(get('state'))
  const rawLearning = parse(get('learning'))
  const rawImported = parse(get('imported'))
  const rawDaily = parse(get('daily'))
  const theme = get('theme')
  const avatar = get('avatar')
  const state = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
    ? { ...fallback.state, ...rawState as Partial<PersistedState> } : fallback.state
  const learning = rawLearning && typeof rawLearning === 'object' && !Array.isArray(rawLearning)
    ? { ...fallback.learning, ...rawLearning as Partial<LearningState> } : fallback.learning
  return {
    schema: 1,
    state: { ...state, theme: theme === 'dark' || theme === 'light' ? theme : state.theme },
    learning: { ...learning, settings: { ...fallback.learning.settings, ...learning.settings } },
    imported: Array.isArray(rawImported) ? rawImported as RawQuestion[] : [],
    daily: rawDaily && typeof rawDaily === 'object' && !Array.isArray(rawDaily)
      ? rawDaily as Record<string, number> : {},
    avatar: avatar === 'male' || avatar === 'female' ? avatar : null,
  }
}

export function isSnapshot(value: unknown): value is AccountSnapshot {
  if (!value || typeof value !== 'object') return false
  const x = value as Partial<AccountSnapshot>
  return x.schema === 1 && !!x.state && typeof x.state.progress === 'object' &&
    !!x.learning && Array.isArray(x.learning.attempts) && Array.isArray(x.imported) &&
    !!x.daily && typeof x.daily === 'object' && (x.avatar === null || x.avatar === 'male' || x.avatar === 'female')
}

export function hasAccountCache(userId: string): boolean {
  return localStorage.getItem(fieldKey(userId, 'state')) !== null
}

export function hasLegacyProgress(): boolean {
  const s = readSnapshot()
  return Object.keys(s.state.progress).length > 0 || s.state.flagged.length > 0 ||
    s.learning.attempts.length > 0 || s.learning.history.length > 0 ||
    Object.keys(s.learning.notes).length > 0 || s.learning.flashcards.length > 0 ||
    s.learning.active !== null || s.imported.length > 0 || Object.keys(s.daily).length > 0 ||
    s.avatar !== null
}

/** A completed import writes only namespaced keys. It never changes legacy progress. */
export function saveSnapshot(userId: string, snapshot: AccountSnapshot): void {
  const entries: [AccountField, string][] = [
    ['state', JSON.stringify(snapshot.state)],
    ['imported', JSON.stringify(snapshot.imported)],
    ['daily', JSON.stringify(snapshot.daily)],
    ['learning', JSON.stringify(snapshot.learning)],
    ['theme', snapshot.state.theme],
    ['avatar', snapshot.avatar ?? ''],
  ]
  for (const [field, value] of entries) localStorage.setItem(fieldKey(userId, field), value)
}

export function setPending(userId: string, pending: boolean): void {
  try { localStorage.setItem(pendingKey(userId), pending ? 'true' : 'false') } catch { /* Quota/private mode */ }
}

export function isPending(userId: string): boolean {
  return localStorage.getItem(pendingKey(userId)) === 'true'
}

export function downloadLegacyBackup(): void {
  const storage: Record<string, string | null> = {}
  for (const key of Object.values(LEGACY_KEYS)) storage[key] = localStorage.getItem(key)
  const json = JSON.stringify({ app: 'FirstPass Q-Bank', version: 2,
    source: 'browser progress before accounts', exportedAt: new Date().toISOString(), storage }, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `firstpass-original-progress-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
FIRSTPASS_ACCOUNTS_9_EOF
cat <<'FIRSTPASS_ACCOUNTS_10_EOF' > 'src/lib/auth.tsx'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  recoveringPassword: boolean
  finishPasswordRecovery: () => void
  signOut: () => Promise<void>
}

const Context = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [recoveringPassword, setRecoveringPassword] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let mounted = true
    // Synchronous subscription callback avoids Supabase auth-lock deadlocks.
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true)
      if (event === 'SIGNED_OUT') setRecoveringPassword(false)
    })
    client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) console.warn('[FirstPass] Could not restore login:', error.message)
      setSession(data.session)
      setLoading(false)
    }).catch(() => { if (mounted) setLoading(false) })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    loading,
    recoveringPassword,
    finishPasswordRecovery: () => setRecoveringPassword(false),
    signOut: async () => {
      if (!supabase) return
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    },
  }), [session, loading, recoveringPassword])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
FIRSTPASS_ACCOUNTS_10_EOF
cat <<'FIRSTPASS_ACCOUNTS_11_EOF' > 'src/lib/cloudSync.tsx'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Cloud, CloudOff, RefreshCw, ShieldAlert } from 'lucide-react'
import { useLearning, progressExport } from './learning'
import { useStore } from './store'
import { fieldKey, saveSnapshot, setPending, type AccountSnapshot } from './accountStorage'
import { supabase } from './supabase'
import type { AccountBoot } from '../components/AccountGate'

type SyncStatus = 'saved' | 'saving' | 'pending' | 'offline' | 'conflict'

interface CloudSyncValue {
  status: SyncStatus
  lastError: string
  retry: () => void
  notifyChanged: () => void
}

const Context = createContext<CloudSyncValue | null>(null)

export function useCloudSync(): CloudSyncValue {
  const value = useContext(Context)
  if (!value) throw new Error('useCloudSync must be used inside CloudSyncProvider')
  return value
}

export function CloudSyncProvider({ children, userId, boot }: { children: ReactNode; userId: string; boot: AccountBoot }) {
  const { state, imported, daily } = useStore()
  const { schedule, attempts, history, active, notes, flashcards, settings } = useLearning()
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [retryVersion, setRetryVersion] = useState(0)
  const [status, setStatus] = useState<SyncStatus>(boot.pending ? 'pending' : 'saved')
  const [lastError, setLastError] = useState('')
  const revision = useRef(boot.revision)
  const lastSaved = useRef(!boot.pending && boot.revision ? JSON.stringify(boot.snapshot) : '')
  const busy = useRef(false)
  const conflicted = useRef(false)

  const notifyChanged = useCallback(() => setAvatarVersion((v) => v + 1), [])
  const retry = useCallback(() => { if (conflicted.current) return; setRetryVersion((v) => v + 1) }, [])

  const snapshot: AccountSnapshot = useMemo(() => ({
    schema: 1, state, imported, daily,
    learning: { schedule, attempts, history, active, notes, flashcards, settings },
    avatar: localStorage.getItem(fieldKey(userId, 'avatar')) === 'female' ? 'female'
      : localStorage.getItem(fieldKey(userId, 'avatar')) === 'male' ? 'male' : null,
  // The avatar is changed by App, which calls notifyChanged after saving it.
  }), [state, imported, daily, schedule, attempts, history, active, notes, flashcards, settings, userId, avatarVersion])
  const serialized = JSON.stringify(snapshot)
  const latest = useRef(serialized)
  latest.current = serialized

  useEffect(() => {
    function onOnline() { setRetryVersion((v) => v + 1) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  useEffect(() => {
    if (!supabase || conflicted.current || serialized === lastSaved.current) return
    setPending(userId, true)
    setStatus('pending')
    const timer = window.setTimeout(() => { void save(serialized) }, 1300)
    async function save(body: string) {
      if (!supabase || busy.current || conflicted.current) return
      busy.current = true
      setStatus('saving')
      try {
        const snapshot = JSON.parse(body) as AccountSnapshot
        const currentRevision = revision.current
        const request = currentRevision === 0
          ? supabase.from('user_qbank_state').insert({ user_id: userId, snapshot, revision: 1 })
            .select('revision').maybeSingle()
          : supabase.from('user_qbank_state').update({ snapshot, revision: currentRevision + 1, updated_at: new Date().toISOString() })
            .eq('user_id', userId).eq('revision', currentRevision).select('revision').maybeSingle()
        const { data, error } = await request
        if (error) {
          // 23505 means another device created the initial row first.
          if (error.code === '23505') {
            conflicted.current = true
            setStatus('conflict')
            setLastError('Your account was updated on another device.')
            return
          }
          throw error
        }
        if (!data) {
          conflicted.current = true
          setStatus('conflict')
          setLastError('Your cloud account was updated elsewhere. Choose which version to keep.')
          return
        }
        revision.current = Number(data.revision)
        lastSaved.current = body
        if (latest.current === body) {
          setPending(userId, false)
          setStatus('saved')
          setLastError('')
        } else {
          setPending(userId, true)
          setStatus('pending')
        }
      } catch (err) {
        setPending(userId, true)
        setStatus('offline')
        setLastError(err instanceof Error ? err.message : 'Cloud sync is unavailable.')
      } finally {
        busy.current = false
        if (latest.current !== lastSaved.current && !conflicted.current && latest.current !== body) {
          setRetryVersion((v) => v + 1)
        }
      }
    }
    return () => window.clearTimeout(timer)
  }, [serialized, retryVersion, userId])

  async function resolveConflict(choice: 'cloud' | 'device') {
    if (!supabase) return
    const description = choice === 'cloud'
      ? 'Replace unsynced progress on this device with the cloud copy? Download a backup first if you need these changes.'
      : 'Replace the newer cloud copy with this device’s progress? This cannot be undone on other devices.'
    if (!window.confirm(description)) return
    try {
      const { data, error } = await supabase.from('user_qbank_state')
        .select('snapshot, revision').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (choice === 'cloud') {
        if (!data?.snapshot) throw new Error('Could not find the newer cloud snapshot.')
        saveSnapshot(userId, data.snapshot as AccountSnapshot)
        setPending(userId, false)
        window.location.reload()
      } else {
        revision.current = Number(data?.revision ?? 0)
        lastSaved.current = ''
        conflicted.current = false
        setRetryVersion((v) => v + 1)
      }
    } catch (err) {
      setStatus('offline')
      setLastError(err instanceof Error ? err.message : 'Could not resolve the conflict.')
    }
  }

  const value = useMemo(() => ({ status, lastError, retry, notifyChanged }), [status, lastError, retry, notifyChanged])
  return <Context.Provider value={value}>
    {children}
    {status === 'offline' && <aside role="status" className="fixed bottom-24 right-4 z-[80] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[#e1bd84] bg-surface p-4 text-ink shadow-2xl md:bottom-5">
      <p className="flex items-center gap-2 text-[13px] font-bold"><CloudOff size={17} className="text-[#c58b4c]"/> Progress saved on this device</p><p className="mt-1 text-xs leading-5 text-muted">Cloud sync paused: {lastError}. Your answers remain in this account's browser cache.</p><button onClick={retry} className="mt-3 flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white"><RefreshCw size={14}/> Retry sync</button>
    </aside>}
    {status === 'conflict' && <aside role="alert" className="fixed bottom-24 right-4 z-[80] w-[min(410px,calc(100vw-32px))] rounded-2xl border border-bad/30 bg-surface p-5 text-ink shadow-2xl md:bottom-5">
      <p className="flex items-center gap-2 text-[13px] font-bold"><ShieldAlert size={18} className="text-bad"/> Two devices have different progress</p>
      <p className="mt-2 text-xs leading-6 text-muted">{lastError} Your local changes are preserved. Download a backup, then decide which version should win.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => progressExport(userId)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Download backup</button><button onClick={() => void resolveConflict('cloud')} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Use cloud</button><button onClick={() => void resolveConflict('device')} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Keep device</button></div>
    </aside>}
  </Context.Provider>
}

export function CloudSyncIndicator() {
  const { status, retry } = useCloudSync()
  return <button onClick={retry} title="Your answers are stored on this device first, then synced securely" className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-2 text-[10px] font-semibold text-muted shadow-sm sm:inline-flex" aria-label={`Cloud progress: ${status}`}>
    {status === 'offline' || status === 'conflict' ? <CloudOff size={14} className="text-bad"/> : <Cloud size={14} className={status === 'saved' ? 'text-good' : 'text-accent'}/>} {status === 'saved' ? 'Saved to cloud' : status === 'saving' ? 'Syncing…' : status === 'pending' ? 'Saving soon…' : status === 'conflict' ? 'Sync conflict' : 'Retry sync'}
  </button>
}
FIRSTPASS_ACCOUNTS_11_EOF
cat <<'FIRSTPASS_ACCOUNTS_12_EOF' > 'src/lib/supabase.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isCloudConfigured = Boolean(
  url && publishableKey && /^https:\/\//.test(url) &&
  !url.includes('YOUR_PROJECT') && !publishableKey.includes('YOUR_PUBLISHABLE'),
)

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, publishableKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'firstpass-auth-v1',
    },
  }) : null
FIRSTPASS_ACCOUNTS_12_EOF
cat <<'FIRSTPASS_ACCOUNTS_13_EOF' > 'supabase/firstpass_accounts.sql'
-- FirstPass Q-Bank: one private progress snapshot per verified Supabase user.
-- Run once in the Supabase SQL Editor (not in a Codespaces terminal).
-- No question JSON is stored in this table; the built-in bank remains public app data.

create table if not exists public.user_qbank_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

alter table public.user_qbank_state enable row level security;

-- Only logged-in accounts may use the table. Anonymous users receive no grants.
revoke all on public.user_qbank_state from public, anon;
grant select, insert, update on public.user_qbank_state to authenticated;

drop policy if exists "FirstPass users read only own progress" on public.user_qbank_state;
create policy "FirstPass users read only own progress"
  on public.user_qbank_state for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "FirstPass users create only own progress" on public.user_qbank_state;
create policy "FirstPass users create only own progress"
  on public.user_qbank_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "FirstPass users update only own progress" on public.user_qbank_state;
create policy "FirstPass users update only own progress"
  on public.user_qbank_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- There is intentionally no DELETE policy. Account deletion is managed separately.
FIRSTPASS_ACCOUNTS_13_EOF
cat <<'FIRSTPASS_ACCOUNTS_14_EOF' > '.env.example'
# Copy these two public client values from Supabase > Project Settings > API Keys.
# Use a publishable/anon key here; NEVER use the service_role/secret key in Vite.
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
FIRSTPASS_ACCOUNTS_14_EOF
if [ -f .gitignore ]; then
  if ! grep -Fxq ".env.local" .gitignore && ! grep -Fxq "*.local" .gitignore; then printf "\n.env.local\n" >> .gitignore; fi
else
  cat <<'FIRSTPASS_ACCOUNTS_GITIGNORE_EOF' > .gitignore
node_modules
dist
.env.local
FIRSTPASS_ACCOUNTS_GITIGNORE_EOF
fi
echo "Accounts code installed. Next: run supabase/firstpass_accounts.sql in your Supabase SQL Editor; set your public URL and publishable key in .env.local."
echo "Verifying TypeScript and Vite…"
npm run build
