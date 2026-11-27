import { ArrowLeft, Check, ChevronLeft, ChevronRight, Flag, Flame, RotateCcw, Shuffle, Strikethrough, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { initialMockState, mockRange, mockRemaining, mockExamElapsed, nextMockPhase } from '../lib/mockExam'
import { fisherYates } from '../lib/sessionBuilder'
import { useLearning } from '../lib/learning'
import { computeStreak } from '../lib/stats'
import { optionKeysOf, optionText } from '../lib/options'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, iconBtn, label, tag } from '../lib/ui'
import type { Answer, Confidence, OptionKey, Session } from '../types/qbank'
import BlockReport from './BlockReport'
import ExplanationSheet from './ExplanationSheet'
import QuestionReport from './QuestionReport'
import NoteEditor from './NoteEditor'
import { useCloudSync } from '../lib/cloudSync'

interface Props {
  session: Session
  onExit: () => void
  onReview: (ids: string[], prefill: Record<string, OptionKey>) => void
  onRestart: () => void
}

interface RatingDef {
  k: Confidence
  short: string
  full: string
  hot: string
}

const RATINGS: RatingDef[] = [
  { k: 'hard', short: 'Again', full: 'Again / Hard', hot: 'H' },
  { k: 'good', short: 'Good', full: 'Good', hot: 'G' },
  { k: 'easy', short: 'Easy', full: 'Easy · Skip Similar', hot: 'X' },
]

const TONE: Record<string, string> = {
  idle: 'border-line border-l-line bg-surface hover:bg-sunken',
  picked: 'border-accent/40 border-l-accent bg-accent/5',
  correct: 'border-good/30 border-l-good bg-good/5',
  wrong: 'border-bad/30 border-l-bad bg-bad/5',
  dim: 'border-line border-l-line bg-surface opacity-55',
}

const KEY: Record<string, string> = {
  idle: 'border-line bg-sunken text-muted',
  picked: 'border-accent bg-accent text-white',
  correct: 'border-good bg-good text-white',
  wrong: 'border-bad bg-bad text-white',
  dim: 'border-line bg-sunken text-muted',
}

const LETTERS: Record<string, OptionKey> = {
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
  '5': 'E',
}

const EMPTY: Answer = { selected: null, struck: [] }
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`

export default function Player({ session, onExit, onReview, onRestart }: Props) {
  const { byId, state, recordAnswer, setConfidence, toggleFlag } = useStore()
  const { active, setActive, recordAttempt, rateConcept, recordHistory } = useLearning()
  const { connection, setPlayerOpen } = useCloudSync()
  const mode = session.mode
  const restored = active?.session.title === session.title && active.session.mode === session.mode
    && active.session.ids.join('|') === session.ids.join('|') ? active : null
  const [queue, setQueue] = useState(() => {
    const existing = (restored?.queue ?? session.ids).filter((id) => byId.has(id))
    // App has already selected and ordered the queue. Never reorder a restored block.
    return existing
  })
  const total = queue.length
  const [pos, setPos] = useState(Math.min(Math.max(restored?.position ?? 0, 0), Math.max(0, total - 1)))
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    if (restored) return restored.answers
    const init: Record<string, Answer> = {}
    if (session.prefill) for (const [id, sel] of Object.entries(session.prefill)) init[id] = { selected: sel, struck: [] }
    return init
  })
  const [ratings, setRatings] = useState<Record<string, Confidence>>(restored?.ratings ?? {})
  const mockConfig = session.source?.kind === 'mock' ? session.source.config : undefined
  const [mock, setMock] = useState(() => restored?.mock ?? initialMockState())
  const [finalElapsed, setFinalElapsed] = useState(0)
  const [strikeMode, setStrikeMode] = useState(false)
  const [done, setDone] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const startedAt = useRef(restored ? Date.now() - Math.max(0, restored.updatedAt - restored.startedAt) : Date.now())
  const times = useRef<Record<string, number>>(restored?.times ?? {})
  const curId = useRef('')
  const dir = useRef(restored ? 0 : 1)
  const submitted = useRef(false)
  const leaving = useRef(false)
  const tutorSelections = useRef(new Set<string>())
  const scroller = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)

  const q = byId.get(queue[pos])
  curId.current = q?.id ?? ''
  const limit = total * (session.source?.kind === 'block' ? session.source.config.secondsPerQuestion ?? 90 : 90)
  const elapsedNow = Math.max(0, Math.floor((now - startedAt.current) / 1000))
  const range = mockConfig ? mockRange(total, mock.block) : { start: 0, end: total, count: 1 }
  const onBreak = !!mockConfig && mock.phase === 'break'
  const remaining = mockConfig && total > 0 ? mockRemaining(mockConfig, total, mock, elapsedNow) : Math.max(0, limit - elapsedNow)
  const ans: Answer = (q && answers[q.id]) || EMPTY
  const coverageMode = session.source?.kind === 'system' ? session.source.coverageMode : session.source?.kind === 'block' ? session.source.config.coverageMode : undefined
  const locked = mode === 'review' || (mode === 'tutor' && ans.selected !== null)
  const reveal = locked
  const answeredCount = queue.filter((id) => answers[id]?.selected).length
  const unansweredAhead = queue.slice(pos + 1).filter((id) => !answers[id]?.selected).length
  const streak = computeStreak(state.studyDates)

  function shuffleRemaining() {
    if (mockConfig || unansweredAhead < 2) return
    setQueue((previous) => {
      const slots: number[] = []
      const pending: string[] = []
      for (let i = pos + 1; i < previous.length; i++) {
        if (!answers[previous[i]]?.selected) {
          slots.push(i)
          pending.push(previous[i])
        }
      }
      const mixed = fisherYates(pending)
      const next = [...previous]
      slots.forEach((slot, i) => { next[slot] = mixed[i] })
      return next
    })
  }

  function restartSession() {
    if (connection !== 'online' || !navigator.onLine) { window.alert('Please check your internet connection before starting a new session.'); return }
    if (answeredCount > 0 && !window.confirm(session.source?.kind === 'adaptive' ? 'Rebuild your adaptive queue? Recorded progress stays intact.' : 'Start a new random session? This clears current session answers, but preserves saved progress.')) return
    onRestart()
  }

  useEffect(() => {
    if (done) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (!onBreak && curId.current) times.current[curId.current] = (times.current[curId.current] ?? 0) + 1
    }, 1000)
    return () => window.clearInterval(t)
  }, [done, onBreak])

  const saveSession = useCallback(() => {
    if (done || mode === 'review' || submitted.current || leaving.current || !queue.length) return
    setActive({
      session, queue, position: pos, answers, ratings, times: { ...times.current },
      startedAt: startedAt.current, updatedAt: Date.now(), ...(mockConfig ? { mock } : {}),
    })
  }, [session, queue, pos, answers, ratings, mode, done, setActive, mockConfig, mock])

  // Checkpoint each committed interaction before the next paint.
  useLayoutEffect(() => { saveSession() }, [saveSession])

  useEffect(() => {
    if (done || mode === 'review') return
    const timer = window.setInterval(saveSession, 10_000)
    const checkpointOnHide = () => {
      if (document.visibilityState === 'hidden') flushSync(saveSession)
    }
    const checkpointOnPageHide = () => flushSync(saveSession)
    document.addEventListener('visibilitychange', checkpointOnHide)
    window.addEventListener('pagehide', checkpointOnPageHide)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', checkpointOnHide)
      window.removeEventListener('pagehide', checkpointOnPageHide)
    }
  }, [saveSession, done, mode])

  function saveAndExit() {
    if (leaving.current) return
    saveSession()
    leaving.current = true
    onExit()
  }

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    strip.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [pos, queue])

  function submit() {
    if (submitted.current || leaving.current) return
    submitted.current = true
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000))
    const examElapsed = mockConfig ? mockExamElapsed(mockConfig, total, mock, elapsed) : elapsed
    setFinalElapsed(examElapsed)
    if (mode === 'exam') {
      for (const id of queue) {
        const a = answers[id]
        const qq = byId.get(id)
        if (a?.selected && qq) {
          const correct = a.selected === qq.correct_option
          recordAnswer(id, correct)
          recordAttempt(qq, correct, times.current[id] ?? 0, mode, session.syncId ? `${session.syncId}:${id}` : undefined)
        }
      }
    }
    if (mode !== 'review') {
      const selections: Record<string, OptionKey | null> = {}
      let correct = 0; let answered = 0
      for (const id of queue) {
        const selected = answers[id]?.selected ?? null
        selections[id] = selected
        if (selected) answered++
        if (selected && selected === byId.get(id)?.correct_option) correct++
      }
      recordHistory({ title: session.title, mode, ids: [...queue], selections,
        times: { ...times.current }, elapsed: examElapsed,
        correct, answered, ...(mockConfig ? { mock: mockConfig } : {}) }, session.syncId)
    }
    setActive(null)
    setDone(true)
    setPlayerOpen(false)
  }

  function advanceMock(automatic = false) {
    if (!mockConfig || submitted.current || leaving.current || done) return
    if (!automatic && !onBreak && !window.confirm(range.end === total ? 'Submit this examination and grade all questions? Unanswered questions will count as incorrect.' : 'Finish this block? You cannot return to it until the examination is graded.')) return
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000))
    const next = nextMockPhase(mockConfig, total, mock, elapsed)
    if (!next) { submit(); return }
    setMock(next)
    setStrikeMode(false)
    if (next.phase === 'block') setPos(mockRange(total, next.block).start)
    setNow(Date.now())
  }

  function finish() {
    if (mode === 'review') onExit()
    else submit()
  }

  function go(delta: number) {
    const np = pos + delta
    if (np < range.start || (mockConfig && np >= range.end) || onBreak) return
    if (np >= total) {
      if (mode !== 'exam') finish()
      return
    }
    dir.current = delta
    setPos(np)
  }

  function choose(k: OptionKey) {
    if (!q || locked || leaving.current || submitted.current || onBreak || (mockConfig && mockRemaining(mockConfig, total, mock, Math.floor((Date.now() - startedAt.current) / 1000)) <= 0)) return
    if (mode === 'tutor') {
      // Prevent repeated input before React commits the first selected answer.
      if (tutorSelections.current.has(q.id)) return
      tutorSelections.current.add(q.id)
    }
    setAnswers((a) => ({ ...a, [q.id]: { selected: k, struck: a[q.id]?.struck ?? [] } }))
    setStrikeMode(false)
    if (mode === 'tutor') {
      const correct = k === q.correct_option
      recordAnswer(q.id, correct)
      recordAttempt(q, correct, times.current[q.id] ?? 0, mode, session.syncId ? `${session.syncId}:${q.id}` : undefined)
    }
  }

  function strike(k: OptionKey) {
    if (!q || locked) return
    setAnswers((a) => {
      const cur = a[q.id] ?? EMPTY
      const struck = cur.struck.includes(k) ? cur.struck.filter((x) => x !== k) : [...cur.struck, k]
      return { ...a, [q.id]: { ...cur, struck } }
    })
  }

  function rate(level: Confidence) {
    if (q === undefined || mode === 'exam' || reveal === false) return
    // Confidence cannot turn an incorrect answer into demonstrated mastery.
    const effective = ans.selected === q.correct_option ? level : 'hard'
    if (mode === 'tutor' || effective === 'hard') {
      setConfidence(q.id, effective)
      rateConcept(q, effective)
    }
    setRatings((r) => ({ ...r, [q.id]: effective }))
    go(1)
  }

  useEffect(() => {
    if (mode === 'exam' && !done && total > 0 && remaining <= 0) { if (mockConfig) advanceMock(true); else submit() }
  })

  useEffect(() => {
    // Explicit coverage sessions must present their full selected queue, even if
    // progress previously marked an angle as skipped through "Easy".
    if (done || mode !== 'tutor' || !q || coverageMode !== undefined || session.source?.kind === 'adaptive') return
    if (dir.current > 0 && !answers[q.id]?.selected && state.progress[q.id]?.status === 'skipped') go(1)
  }, [pos, state.progress, coverageMode, session.source])

  useEffect(() => {
    if (done || onBreak) return
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey || !q) return
      const key = e.key.toLowerCase()

      if (reveal && key === 'x') {
        e.preventDefault()
        rate('easy')
        return
      }
      if (reveal && key === 'h') {
        e.preventDefault()
        rate('hard')
        return
      }
      if (reveal && key === 'g') {
        e.preventDefault()
        rate('good')
        return
      }

      if (key === 's' && !locked) {
        e.preventDefault()
        setStrikeMode((value) => !value)
        return
      }

      const k = LETTERS[key]
      if (k) {
        e.preventDefault()
        if (!optionKeysOf(q).includes(k)) return
        if (e.shiftKey) {
          if (/^[a-e]$/.test(key)) strike(k)
        } else choose(k)
        return
      }
      if (key === 'arrowright' || key === 'enter') {
        e.preventDefault()
        go(1)
      } else if (key === 'arrowleft') {
        e.preventDefault()
        go(-1)
      } else if (key === 'f') toggleFlag(q.id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (total === 0 || !q) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-8 text-center text-ink">
        <div className="space-y-4">
          <p className="text-sm text-muted">No questions in this block.</p>
          <button onClick={onExit} className={btnPrimary}>
            Back
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    const qs = queue.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
    return (
      <BlockReport
        questions={qs}
        answers={answers}
        times={times.current}
        mode={mode}
        elapsed={finalElapsed}
        isMock={!!mockConfig}
        onReview={onReview}
        onRestart={onRestart}
        onExit={onExit}
      />
    )
  }

  if (onBreak) return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-canvas p-5 text-ink"><section className={`${card} w-full max-w-md space-y-5 p-7 text-center`}><p className={label}>Mock examination · scheduled break</p><h1 className="text-2xl font-bold">Block {mock.block + 1} complete</h1><p className="text-sm text-muted">Answers are locked. The next block begins when the break ends, or you can continue now.</p><p className="font-mono text-5xl font-bold text-accent tabular-nums">{fmt(remaining)}</p><button className={`${btnPrimary} w-full`} onClick={() => advanceMock()}>Start next block</button><button className={btnGhost} onClick={saveAndExit}>Save &amp; exit</button></section></div>

  const keys = optionKeysOf(q)
  const flagged = state.flagged.includes(q.id)
  const isCorrectPick = ans.selected === q.correct_option
  const strikeHint = keys.length === 5 ? '1–5 / A–E to answer · S for strike mode' : '1–4 / A–D to answer · S for strike mode'
  const timerCls =
    remaining < 60
      ? 'animate-pulse border-amber-500 text-amber-600 dark:text-amber-400'
      : remaining < 300
        ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
        : 'border-line text-muted'

  return (
    <div className="fp-player-shell fixed inset-0 z-50 flex flex-col bg-canvas text-ink">
      <header className="relative z-10 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] shadow-[0_12px_40px_-35px_rgba(0,0,0,.3)] backdrop-blur-xl">
        <div className="h-[2px] w-full bg-sunken">
          <motion.div className="h-full rounded-r-full bg-accent" animate={{ width: `${((pos + 1) / total) * 100}%` }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }} />
        </div>
        <div className="mx-auto flex h-[62px] max-w-4xl items-center gap-2 px-3 sm:px-5">
          <button onClick={saveAndExit} aria-label={mode === 'review' ? 'Exit review' : 'Save and exit'} title={mode === 'exam' ? 'Save and exit (timer pauses when saved)' : 'Save and exit'} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-sunken px-2.5 py-2 text-xs font-semibold text-muted hover:text-ink">
            <ArrowLeft size={18} /><span className="hidden sm:inline">{mode === 'review' ? 'Exit' : 'Save & exit'}</span>
          </button>
          <div className="min-w-0 flex-1 pl-1 sm:pl-3"><p className="truncate text-[12px] font-semibold tracking-tight">{session.title}</p><p className="mt-0.5 truncate font-mono text-[10px] text-muted">Question {pad(pos + 1)} <span className="text-muted/50">/</span> {pad(total)} <span className="px-1 text-muted/40">·</span> {mockConfig ? `Block ${mock.block + 1}/${range.count}` : mode === 'exam' ? q.system : q.concept_name}</p></div>
          <span title="Daily study streak" className="hidden items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1.5 text-[11px] font-semibold text-muted sm:inline-flex"><Flame size={13} className="text-orange-500" /> {streak}d</span>
          {mode === 'exam' && (
            <span className={`rounded-lg border px-2.5 py-2 font-mono text-[11px] font-semibold tabular-nums ${timerCls}`}>
              {fmt(remaining)}
            </span>
          )}
          <button
            onClick={() => toggleFlag(q.id)}
            aria-label="Flag question"
            aria-pressed={flagged}
            className={`${iconBtn} ${flagged ? 'text-accent' : ''}`}
          >
            <Flag size={17} fill={flagged ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 pb-3 sm:px-5">
          <span className="mr-auto inline-flex min-w-0 items-center truncate rounded-lg border border-accent/15 bg-accent/8 px-2.5 py-1.5 text-[10px] font-semibold text-accent">
            {mockConfig ? `Mock · Block ${mock.block + 1} of ${range.count}` : session.source?.kind === 'adaptive' ? 'Adaptive practice · 1 per concept' : coverageMode === 'core_concepts' ? 'Complete Coverage · 1 per concept' : coverageMode === 'all' ? 'Full Bank · All angles' : mode === 'review' ? 'Review session' : 'Practice drill'}
          </span>
          <button type="button" aria-pressed={strikeMode} onClick={() => setStrikeMode((value) => !value)} title="Toggle strike mode (S)" disabled={locked} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-35 ${strikeMode ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:bg-sunken'}`}><Strikethrough size={14} /><span className="hidden sm:inline">Strike mode</span><span className="sm:hidden">S</span></button>
          <button
            type="button"
            onClick={shuffleRemaining}
            disabled={!!mockConfig || unansweredAhead < 2}
            aria-label="Shuffle Remaining"
            title="Shuffle remaining unanswered questions; keep this and answered questions in place"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-35"
          >
            <Shuffle size={13} /> <span className="hidden sm:inline">Shuffle Remaining</span><span className="sm:hidden">Shuffle</span>
          </button>
          <button
            type="button"
            onClick={restartSession}
            disabled={!!mockConfig}
            title="Restart with a new random question queue and fresh concept representatives"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <RotateCcw size={13} /> <span className="hidden sm:inline">New Random Session</span><span className="sm:hidden">Restart</span>
          </button>
        </div>
        <div ref={strip} aria-label="Question navigator" className="fp-player-navigator no-scrollbar mx-auto flex max-w-4xl gap-1.5 overflow-x-auto px-3 pb-3 sm:px-5">
          {queue.map((id, i) => {
            if (i < range.start || i >= range.end) return null
            const a = answers[id]
            const qq = byId.get(id)
            let cls = 'text-muted hover:bg-sunken'
            if (a?.selected) {
              if (mode === 'exam') cls = 'bg-accent/15 text-accent'
              else cls = a.selected === qq?.correct_option ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'
            }
            const cur = i === pos
            return (
              <button
                key={id}
                data-active={cur}
                onClick={() => {
                  dir.current = i >= pos ? 1 : -1
                  setPos(i)
                }}
                className={`relative h-7 min-w-8 shrink-0 rounded-lg px-1.5 font-mono text-[10px] font-semibold tabular-nums transition-colors ${
                  cur ? 'bg-accent text-white shadow-sm' : cls
                }`}
              >
                {pad(i + 1)}
                {state.flagged.includes(id) && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
            )
          })}
        </div>
      </header>

      <div ref={scroller} className="fp-player-scroll flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={q.id} initial={{ opacity: 0, x: dir.current > 0 ? 22 : -22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir.current > 0 ? -14 : 14 }} transition={{ duration: 0.15, ease: 'easeOut' }} className="fp-player-content mx-auto max-w-4xl space-y-5 px-4 py-6 pb-16 sm:px-5 sm:py-8">
          <article className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken/45 px-5 py-3 sm:px-7">
              <span className={`${label} flex items-center gap-2`}><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Clinical question / First Aid 36e</span>
              <span className="flex items-center gap-1.5">
                <span className={tag}>{q.system}</span>
                <span className={tag}>Tier {q.tier}</span>
              </span>
            </div>
            <p className="fp-player-stem max-w-[76ch] px-5 py-7 font-reading text-[17px] leading-[1.9] tracking-[-.005em] sm:px-7 sm:py-9 sm:text-[18px]">{q.stem}</p>
            {connection === 'online' && <QuestionReport key={q.id} q={q} />}
          </article>

          <div className="fp-player-options space-y-2.5" role="group" aria-label="Answer options">
            {keys.map((k) => {
              const isCorrect = k === q.correct_option
              const picked = ans.selected === k
              const struck = ans.struck.includes(k)
              let tone = 'idle'
              if (reveal) tone = isCorrect ? 'correct' : picked ? 'wrong' : 'dim'
              else if (picked) tone = 'picked'
              return (
                <motion.div key={k} whileHover={!locked ? { x: 3 } : undefined} className="group relative">
                  <button
                    disabled={locked}
                    onClick={() => strikeMode ? strike(k) : choose(k)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      strike(k)
                    }}
                    className={`surface-card flex w-full items-start gap-4 rounded-xl border border-l-[3px] py-4 pl-4 pr-12 text-left transition-all ${TONE[tone]}`}
                  >
                    <span
                      className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs font-bold ${KEY[tone]}`}
                    >
                      {reveal && isCorrect ? <Check size={14} strokeWidth={3} /> : reveal && picked ? <X size={14} strokeWidth={3} /> : k}
                    </span>
                    <span className={`flex-1 text-[14px] leading-relaxed sm:text-[15px] ${struck && !reveal ? 'text-muted line-through decoration-bad/70 decoration-2' : ''}`}>
                      {optionText(q, k)}
                    </span>
                  </button>
                  {!locked && (
                    <button
                      onClick={() => strike(k)}
                      aria-label={`Strike through option ${k}`}
                      className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink md:opacity-40 md:group-hover:opacity-100 ${
                        struck ? 'bg-sunken text-ink md:opacity-100' : ''
                      }`}
                    >
                      <Strikethrough size={15} />
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>

          {connection === 'online' && mode === 'tutor' && !reveal && <details className={`${card} p-4`}>
            <summary className="cursor-pointer text-sm font-semibold text-accent">Personal note</summary>
            <div className="mt-3"><NoteEditor q={q} /></div>
          </details>}

          {reveal && (
            <div className="space-y-5 pb-6">
              <ExplanationSheet q={q} ans={ans} mode={mode} isCorrectPick={isCorrectPick} />
            </div>
          )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_-36px_rgba(0,0,0,.4)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-3 sm:px-5">
          <button onClick={() => go(-1)} disabled={pos === range.start} aria-label="Previous question" className={`${iconBtn} border border-line bg-sunken`}>
            <ChevronLeft size={18} />
          </button>

          {mode === 'exam' ? (
            <>
              <span className="hidden font-mono text-xs tabular-nums text-muted sm:block">
                {answeredCount}/{total} answered
              </span>
              <button onClick={() => mockConfig ? advanceMock() : submit()} className={`${btnPrimary} flex-1`}>
                {mockConfig ? (range.end === total ? 'Submit mock exam' : 'Finish block') : 'End & Grade Block'}
              </button>
            </>
          ) : reveal ? (
            <div role="group" className="flex flex-1 divide-x divide-line overflow-hidden rounded-xl border border-line bg-sunken/65">
              {RATINGS.map((r) => (
                <button
                  key={r.k}
                  onClick={() => rate(r.k)}
                  disabled={mode === 'tutor' && !isCorrectPick && r.k !== 'hard'}
                  title={mode === 'tutor' && !isCorrectPick && r.k !== 'hard' ? 'Incorrect answers are scheduled for review tomorrow' : undefined}
                  className={`disabled:opacity-40 flex flex-1 items-center justify-center gap-2 px-2 py-2.5 text-[12px] font-semibold transition-colors ${
                    ratings[q.id] === r.k ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken'
                  }`}
                >
                  <span className="sm:hidden">{r.short}</span>
                  <span className="hidden sm:inline">{r.full}</span>
                  <kbd className="kbd hidden md:inline-flex">{r.hot}</kbd>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="flex-1 text-center text-[11px] text-muted">{strikeMode ? 'Strike mode active · select options to cross out' : strikeHint}</p>
              {mode === 'tutor' && (
                <button onClick={finish} className={`${btnGhost} px-3 py-2 text-xs`}>
                  End Block
                </button>
              )}
            </>
          )}

          <button onClick={() => go(1)} disabled={mode === 'exam' && pos >= range.end - 1} aria-label="Next question" className={`${iconBtn} border border-line bg-sunken`}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="mx-auto hidden max-w-4xl items-center justify-center gap-4 border-t border-line/60 px-5 py-2 text-[10px] text-muted md:flex"><span><span className="kbd">A–E</span> Choose</span><span><span className="kbd">S</span> Strike mode</span><span><span className="kbd">↵</span> Next</span><span><span className="kbd">F</span> Flag</span><span>Right-click an option to strike through</span></div>
      </footer>
    </div>
  )
}
