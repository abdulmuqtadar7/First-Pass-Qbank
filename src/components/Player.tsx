import { ArrowLeft, Check, ChevronLeft, ChevronRight, EyeOff, Flag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { distractorOf, optionKeysOf, optionText } from '../lib/options'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, iconBtn, label, tag } from '../lib/ui'
import type { Answer, Confidence, OptionKey, Session } from '../types/qbank'
import BlockReport from './BlockReport'

interface Props {
  session: Session
  onExit: () => void
  onReview: (ids: string[], prefill: Record<string, OptionKey>) => void
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

export default function Player({ session, onExit, onReview }: Props) {
  const { byId, state, recordAnswer, setConfidence, toggleFlag } = useStore()
  const mode = session.mode
  const [queue] = useState(() => session.ids.filter((id) => byId.has(id)))
  const total = queue.length
  const [pos, setPos] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const init: Record<string, Answer> = {}
    if (session.prefill) for (const [id, sel] of Object.entries(session.prefill)) init[id] = { selected: sel, struck: [] }
    return init
  })
  const [ratings, setRatings] = useState<Record<string, Confidence>>({})
  const [done, setDone] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const startedAt = useRef(Date.now())
  const times = useRef<Record<string, number>>({})
  const curId = useRef('')
  const dir = useRef(1)
  const submitted = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)

  const q = byId.get(queue[pos])
  curId.current = q?.id ?? ''
  const limit = total * 90
  const remaining = Math.max(0, limit - Math.floor((now - startedAt.current) / 1000))
  const ans: Answer = (q && answers[q.id]) || EMPTY
  const locked = mode === 'review' || (mode === 'tutor' && ans.selected !== null)
  const reveal = locked
  const answeredCount = queue.filter((id) => answers[id]?.selected).length

  useEffect(() => {
    if (done) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (curId.current) times.current[curId.current] = (times.current[curId.current] ?? 0) + 1
    }, 1000)
    return () => window.clearInterval(t)
  }, [done])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    strip.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [pos])

  function submit() {
    if (submitted.current) return
    submitted.current = true
    if (mode === 'exam') {
      for (const id of queue) {
        const a = answers[id]
        const qq = byId.get(id)
        if (a?.selected && qq) recordAnswer(id, a.selected === qq.correct_option)
      }
    }
    setDone(true)
  }

  function finish() {
    if (mode === 'review') onExit()
    else submit()
  }

  function go(delta: number) {
    const np = pos + delta
    if (np < 0) return
    if (np >= total) {
      if (mode !== 'exam') finish()
      return
    }
    dir.current = delta
    setPos(np)
  }

  function choose(k: OptionKey) {
    if (!q || locked) return
    setAnswers((a) => ({ ...a, [q.id]: { selected: k, struck: a[q.id]?.struck ?? [] } }))
    if (mode === 'tutor') recordAnswer(q.id, k === q.correct_option)
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
    setConfidence(q.id, level)
    setRatings((r) => ({ ...r, [q.id]: level }))
    go(1)
  }

  useEffect(() => {
    if (mode === 'exam' && !done && total > 0 && remaining <= 0) submit()
  })

  useEffect(() => {
    if (done || mode !== 'tutor' || !q) return
    if (dir.current > 0 && !answers[q.id]?.selected && state.progress[q.id]?.status === 'skipped') go(1)
  }, [pos, state.progress])

  useEffect(() => {
    if (done) return
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey || !q) return
      const key = e.key.toLowerCase()

      if (reveal && (key === 'x' || key === '3')) {
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
        elapsed={Math.floor((Date.now() - startedAt.current) / 1000)}
        onReview={onReview}
        onExit={onExit}
      />
    )
  }

  const keys = optionKeysOf(q)
  const flagged = state.flagged.includes(q.id)
  const isCorrectPick = ans.selected === q.correct_option
  const strikeHint = keys.length === 5 ? 'Shift + A–E' : 'Shift + A–D'
  const timerCls =
    remaining < 60
      ? 'animate-pulse border-amber-500 text-amber-600 dark:text-amber-400'
      : remaining < 300
        ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
        : 'border-line text-muted'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink">
      <header className="border-b border-line bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="h-[1.5px] w-full bg-line">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${((pos + 1) / total) * 100}%` }} />
        </div>
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-3">
          <button onClick={onExit} aria-label="Exit block" className={iconBtn}>
            <ArrowLeft size={18} />
          </button>
          <span className="font-mono text-sm font-medium tabular-nums">
            {pad(pos + 1)} / {pad(total)}
          </span>
          <span className="min-w-0 flex-1 truncate px-2 text-xs text-muted">
            {mode === 'exam' ? q.system : `${q.system} · ${q.concept_name}`}
          </span>
          {mode === 'exam' && (
            <span className={`rounded border px-2 py-1 font-mono text-xs font-medium tabular-nums ${timerCls}`}>
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
        <div ref={strip} className="no-scrollbar mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-2">
          {queue.map((id, i) => {
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
                className={`relative h-6 min-w-7 shrink-0 rounded px-1.5 font-mono text-[11px] tabular-nums transition-colors ${
                  cur ? 'bg-ink font-semibold text-canvas' : cls
                }`}
              >
                {pad(i + 1)}
                {state.flagged.includes(id) && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
            )
          })}
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div key={q.id} className="animate-rise mx-auto max-w-3xl space-y-5 px-4 py-6">
          <article className={card}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
              <span className={label}>First Aid 36th Ed</span>
              <span className="flex items-center gap-1.5">
                <span className={tag}>{q.system}</span>
                <span className={tag}>Tier {q.tier}</span>
              </span>
            </div>
            <p className="max-w-[65ch] px-5 py-5 font-reading text-[15.5px] leading-[1.68]">{q.stem}</p>
          </article>

          <div className="space-y-2">
            {keys.map((k) => {
              const isCorrect = k === q.correct_option
              const picked = ans.selected === k
              const struck = ans.struck.includes(k)
              let tone = 'idle'
              if (reveal) tone = isCorrect ? 'correct' : picked ? 'wrong' : 'dim'
              else if (picked) tone = 'picked'
              return (
                <div key={k} className="group relative">
                  <button
                    disabled={locked}
                    onClick={() => choose(k)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      strike(k)
                    }}
                    className={`flex w-full items-start gap-3 rounded-md border border-l-[3px] py-3 pl-3 pr-12 text-left transition-colors ${TONE[tone]}`}
                  >
                    <span
                      className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded border font-mono text-xs font-medium ${KEY[tone]}`}
                    >
                      {reveal && isCorrect ? <Check size={14} strokeWidth={3} /> : reveal && picked ? <X size={14} strokeWidth={3} /> : k}
                    </span>
                    <span className={`flex-1 text-[15px] leading-snug ${struck && !reveal ? 'text-muted line-through' : ''}`}>
                      {optionText(q, k)}
                    </span>
                  </button>
                  {!locked && (
                    <button
                      onClick={() => strike(k)}
                      aria-label={`Strike through option ${k}`}
                      className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded text-muted transition hover:bg-sunken hover:text-ink md:opacity-0 md:group-hover:opacity-100 ${
                        struck ? 'bg-sunken text-ink md:opacity-100' : ''
                      }`}
                    >
                      <EyeOff size={15} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {reveal && (
            <section className={`${card} animate-fade divide-y divide-line`}>
              <div className="flex items-center gap-2 px-5 py-3 text-sm font-medium">
                {mode === 'review' ? (
                  <span className="font-mono text-xs tabular-nums">
                    {ans.selected ? `Your answer ${ans.selected}` : 'Not answered'} · Correct {q.correct_option}
                  </span>
                ) : (
                  <>
                    <span className={`h-2 w-2 rounded-full ${isCorrectPick ? 'bg-good' : 'bg-bad'}`} />
                    <span className={isCorrectPick ? 'text-good' : 'text-bad'}>
                      {isCorrectPick ? 'Correct' : `Incorrect — answer is ${q.correct_option}`}
                    </span>
                  </>
                )}
              </div>

              <div className="px-5 py-4">
                <div className="border-l-2 border-accent pl-4">
                  <p className={label}>Key takeaway</p>
                  <p className="mt-1.5 max-w-[65ch] text-[15px] font-medium leading-relaxed">{q.high_yield_pearl}</p>
                </div>
              </div>

              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className={label}>Mechanism &amp; pathophysiology</p>
                  <span className={tag}>FA 36e • p. {q.correct_fa_page}</span>
                </div>
                <p className="mt-2 max-w-[65ch] text-[15px] leading-[1.65]">{q.correct_explanation}</p>
              </div>

              <div className="px-5 py-4">
                <p className={label}>Differential / option analysis</p>
                <ul className="mt-1 divide-y divide-line">
                  {keys.map((k) => {
                    const d = distractorOf(q, k)
                    const ok = k === q.correct_option
                    return (
                      <li key={k} className="flex items-start gap-3 py-2.5">
                        <span
                          className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded border font-mono text-[11px] font-medium ${
                            ok ? 'border-good bg-good text-white' : 'border-line bg-sunken text-muted'
                          }`}
                        >
                          {k}
                        </span>
                        <p className="flex-1 text-sm leading-snug">{d.reason}</p>
                        <span className={tag}>p. {d.fa_page}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      <footer className="border-t border-line bg-surface/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
          <button onClick={() => go(-1)} disabled={pos === 0} aria-label="Previous question" className={`${iconBtn} border border-line bg-surface`}>
            <ChevronLeft size={18} />
          </button>

          {mode === 'exam' ? (
            <>
              <span className="hidden font-mono text-xs tabular-nums text-muted sm:block">
                {answeredCount}/{total} answered
              </span>
              <button onClick={submit} className={`${btnPrimary} flex-1`}>
                End &amp; Grade Block
              </button>
            </>
          ) : reveal ? (
            <div role="group" className="flex flex-1 divide-x divide-line overflow-hidden rounded-md border border-line bg-surface">
              {RATINGS.map((r) => (
                <button
                  key={r.k}
                  onClick={() => rate(r.k)}
                  className={`flex flex-1 items-center justify-center gap-2 px-2 py-2.5 text-[13px] font-medium transition-colors ${
                    ratings[q.id] === r.k ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken'
                  }`}
                >
                  <span className="sm:hidden">{r.short}</span>
                  <span className="hidden sm:inline">{r.full}</span>
                  <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] text-muted md:inline">{r.hot}</kbd>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="flex-1 text-center text-xs text-muted">Select an answer · {strikeHint} to strike</p>
              {mode === 'tutor' && (
                <button onClick={finish} className={`${btnGhost} px-3 py-2 text-xs`}>
                  End Block
                </button>
              )}
            </>
          )}

          <button onClick={() => go(1)} disabled={mode === 'exam' && pos >= total - 1} aria-label="Next question" className={`${iconBtn} border border-line bg-surface`}>
            <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </div>
  )
}
