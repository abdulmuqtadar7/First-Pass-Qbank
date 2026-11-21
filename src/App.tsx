import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppNav, { type Tab } from './components/AppNav'
import StudyTab from './components/StudyTab'
import ReviewTab from './components/ReviewTab'
import ProgressTab from './components/ProgressTab'
import Player from './components/Player'
import Admin from './components/Admin'
import { buildBlock, shuffle } from './lib/blocks'
import { buildSystemSession } from './lib/sessionBuilder'
import { weakQuestions } from './lib/stats'
import { useStore } from './lib/store'
import { page } from './lib/ui'
import type { OptionKey, Session, SessionMode, SessionSource } from './types/qbank'

export default function App() {
  const { questions, state } = useStore()
  const [path, setPath] = useState(window.location.pathname)
  const [tab, setTab] = useState<Tab>('study')
  const [session, setSession] = useState<Session | null>(null)
  const [sKey, setSKey] = useState(0)

  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  const start = useCallback((ids: string[], title: string, mode: SessionMode = 'tutor', source?: SessionSource) => {
    if (!ids.length) return
    setSession({ ids: shuffle(ids), title, mode, source })
    setSKey((k) => k + 1)
  }, [])

  const review = useCallback((ids: string[], prefill: Record<string, OptionKey>) => {
    if (!ids.length) return
    setSession({ ids: shuffle(ids), title: 'Review', mode: 'review', prefill })
    setSKey((k) => k + 1)
  }, [])

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
    setSession({ ...session, ids: shuffle(ids) })
    setSKey((k) => k + 1)
  }, [questions, session, state])

  const due = useMemo(
    () => weakQuestions(questions, state.progress, state.flagged).length,
    [questions, state.progress, state.flagged],
  )

  if (path.startsWith('/admin')) return <Admin />

  if (session) {
    return <Player key={sKey} session={session} onExit={() => setSession(null)} onReview={review} onRestart={restart} />
  }

  return (
    <div className={`${page} study-shell`}>
      <AppNav tab={tab} onChange={setTab} reviewCount={due} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="mx-auto w-full max-w-6xl px-4 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 md:pb-20 md:pt-10 lg:px-8"
        >
          {tab === 'study' && <StudyTab onStart={start} />}
          {tab === 'review' && <ReviewTab onStart={start} />}
          {tab === 'progress' && <ProgressTab />}
        </motion.main>
      </AnimatePresence>
    </div>
  )
}
