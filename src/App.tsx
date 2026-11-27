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
import OwnerDashboard from './components/OwnerDashboard'
import { adaptiveQueue, analyzeConcepts } from './lib/adaptive'
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
  const { active, setActive, schedule, attempts } = useLearning()
  const [path, setPath] = useState(window.location.pathname)
  const [tab, setTab] = useState<Tab>('study')
  // Open the dashboard first, so students can explicitly resume or choose a new block.
  const [session, setSession] = useState<Session | null>(null)
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
    const next: Session = { ids: source?.kind === 'adaptive' ? ids : shuffle(ids), title, mode, source }
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
    if (session.source?.kind === 'adaptive') {
      ids = adaptiveQueue(analyzeConcepts(questions, state.progress, schedule, attempts), state.progress, session.source.mode, session.source.size)
      if (!ids.length) { window.alert('No matching adaptive concepts are available right now.'); return }
    }
    if (!ids.length) ids = session.ids
    const next: Session = { ...session, ids: session.source?.kind === 'adaptive' ? ids : shuffle(ids) }
    setSession(next)
    setActive(session.mode === 'review' ? null : { session: next, queue: next.ids, position: 0, answers: {}, ratings: {}, times: {}, startedAt: Date.now(), updatedAt: Date.now() })
    setSKey((k) => k + 1)
  }, [questions, session, state, schedule, attempts, setActive])

  const resume = useCallback(() => {
    if (!active) return
    const available = new Set(questions.map(q => q.id))
    if (!active.queue.length || active.queue.some(id => !available.has(id))) {
      window.alert("This saved session contains questions that are no longer available. Your recorded progress is safe. You can start a new block or try again after restoring the question bank.")
      return
    }
    setSession(active.session)
    setSKey((k) => k + 1)
  }, [active, questions])

  const due = useMemo(
    () => new Set([
      ...weakQuestions(questions, state.progress, state.flagged).map((q) => q.id),
      ...dueConceptQuestions(questions, schedule, state.progress).map((q) => q.id),
    ]).size,
    [questions, schedule, state.progress, state.flagged],
  )

  if (path.startsWith('/admin')) return <OwnerDashboard />

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
