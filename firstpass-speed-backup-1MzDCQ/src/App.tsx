import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppNav, { type Tab } from './components/AppNav'
import StudyTab from './components/StudyTab'
import ReviewTab from './components/ReviewTab'
import ProgressTab from './components/ProgressTab'
import HistoryTab from './components/HistoryTab'
import NotebookTab from './components/NotebookTab'
import AvatarPicker from './components/AvatarPicker'
import { AVATAR_KEY, readAvatar, type DoctorAvatar } from './components/DoctorWalk'
import Player from './components/Player'
import Admin from './components/Admin'
import { buildBlock, shuffle } from './lib/blocks'
import { buildSystemSession } from './lib/sessionBuilder'
import { weakQuestions } from './lib/stats'
import { dueConceptQuestions, useLearning } from './lib/learning'
import { useStore } from './lib/store'
import { page } from './lib/ui'
import type { OptionKey, Session, SessionMode, SessionSource } from './types/qbank'

export default function App() {
  const { questions, state } = useStore()
  const { active, setActive, schedule } = useLearning()
  const [path, setPath] = useState(window.location.pathname)
  const [tab, setTab] = useState<Tab>('study')
  const [session, setSession] = useState<Session | null>(() => active?.session ?? null)
  const [sKey, setSKey] = useState(0)
  const [avatar, setAvatar] = useState<DoctorAvatar | null>(readAvatar)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(() => !readAvatar())

  const chooseAvatar = useCallback((choice: DoctorAvatar) => {
    setAvatar(choice)
    try { localStorage.setItem(AVATAR_KEY, choice) } catch { /* private mode */ }
    setAvatarPickerOpen(false)
  }, [])

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
