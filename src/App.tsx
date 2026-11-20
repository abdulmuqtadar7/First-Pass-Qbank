import { useCallback, useEffect, useMemo, useState } from 'react'
import AppNav, { type Tab } from './components/AppNav'
import StudyTab from './components/StudyTab'
import ReviewTab from './components/ReviewTab'
import ProgressTab from './components/ProgressTab'
import Player from './components/Player'
import Admin from './components/Admin'
import { weakQuestions } from './lib/stats'
import { useStore } from './lib/store'
import { page } from './lib/ui'
import type { OptionKey, Session, SessionMode } from './types/qbank'

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

  const start = useCallback((ids: string[], title: string, mode: SessionMode = 'tutor') => {
    if (!ids.length) return
    setSession({ ids, title, mode })
    setSKey((k) => k + 1)
  }, [])

  const review = useCallback((ids: string[], prefill: Record<string, OptionKey>) => {
    if (!ids.length) return
    setSession({ ids, title: 'Review', mode: 'review', prefill })
    setSKey((k) => k + 1)
  }, [])

  const due = useMemo(
    () => weakQuestions(questions, state.progress, state.flagged).length,
    [questions, state.progress, state.flagged],
  )

  if (path.startsWith('/admin')) return <Admin />

  if (session) {
    return <Player key={sKey} session={session} onExit={() => setSession(null)} onReview={review} />
  }

  return (
    <div className={page}>
      <AppNav tab={tab} onChange={setTab} reviewCount={due} />
      <main
        key={tab}
        className="animate-fade mx-auto w-full max-w-5xl px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] md:px-6 md:pb-16 md:pt-8"
      >
        {tab === 'study' && <StudyTab onStart={start} />}
        {tab === 'review' && <ReviewTab onStart={start} />}
        {tab === 'progress' && <ProgressTab />}
      </main>
    </div>
  )
}
