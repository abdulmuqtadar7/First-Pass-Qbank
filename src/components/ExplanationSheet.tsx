import { distractorOf, optionKeysOf, optionText } from '../lib/options'
import { card, label, tag } from '../lib/ui'
import type { Answer, Question, SessionMode } from '../types/qbank'
import TopicSummary from './TopicSummary'

interface Props {
  q: Question
  ans: Answer
  mode: SessionMode
  isCorrectPick: boolean
}

export default function ExplanationSheet({ q, ans, mode, isCorrectPick }: Props) {
  const keys = optionKeysOf(q)
  return (
    <>
      <section className={`${card} animate-fade divide-y divide-line overflow-hidden`}>
        <div className="flex items-center gap-2 bg-sunken px-5 py-2.5 text-sm font-medium">
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
          <div className="border-l-2 border-accent bg-accent/5 py-2.5 pl-4 pr-3">
            <p className={label}>High-yield pearl</p>
            <p className="mt-1.5 max-w-[65ch] text-[15px] font-medium leading-[1.6]">{q.high_yield_pearl}</p>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={label}>Mechanistic &amp; clinical explanation</p>
            <span className={tag}>FA 36e • p. {q.correct_fa_page}</span>
          </div>
          <p className="mt-3 max-w-[65ch] whitespace-pre-line text-[15px] leading-[1.7]">{q.correct_explanation}</p>
        </div>

        <div className="px-5 py-4">
          <p className={label}>Option-by-option differential analysis</p>
          <ul className="mt-2 divide-y divide-line">
            {keys.map((k) => {
              const d = distractorOf(q, k)
              const ok = k === q.correct_option
              const picked = ans.selected === k
              return (
                <li key={k} className="py-3.5">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded border font-mono text-xs font-medium ${
                        ok
                          ? 'border-good bg-good text-white'
                          : picked
                            ? 'border-bad bg-bad text-white'
                            : 'border-line bg-sunken text-muted'
                      }`}
                    >
                      {k}
                    </span>
                    <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-muted">{optionText(q, k)}</p>
                    <span className={tag}>p. {d.fa_page}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line pl-9 text-[14.5px] leading-[1.65]">{d.reason}</p>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {q.topic_overview && (
        <section className={`${card} animate-fade overflow-hidden`}>
          <div className="border-b border-line bg-sunken px-5 py-3">
            <p className={label}>Topic overview</p>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
              First Aid 36th Ed • Topic Summary: {q.concept_name}
            </h3>
          </div>
          <TopicSummary text={q.topic_overview} />
        </section>
      )}
    </>
  )
}
