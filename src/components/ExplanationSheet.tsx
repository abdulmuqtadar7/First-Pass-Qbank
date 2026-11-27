import { BookOpen, Check, CheckCircle2, ChevronDown, FileText, Highlighter, ListChecks, NotebookPen, Plus, Sparkles, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { distractorOf, optionKeysOf, optionText } from '../lib/options'
import { card, label, tag } from '../lib/ui'
import { useLearning } from '../lib/learning'
import { useCloudSync } from '../lib/cloudSync'
import type { Answer, Question, SessionMode } from '../types/qbank'
import TopicSummary from './TopicSummary'
import NoteEditor from './NoteEditor'

interface Props {
  q: Question
  ans: Answer
  mode: SessionMode
  isCorrectPick: boolean
}

type ExplanationTab = 'mechanism' | 'options' | 'overview'

const TABS: { key: ExplanationTab; name: string; Icon: typeof BookOpen }[] = [
  { key: 'mechanism', name: 'Core Mechanism', Icon: Sparkles },
  { key: 'options', name: 'Option Rule-Outs', Icon: ListChecks },
  { key: 'overview', name: 'First Aid Topic Overview', Icon: FileText },
]

export default function ExplanationSheet({ q, ans, mode, isCorrectPick }: Props) {
  const { connection } = useCloudSync()
  const [tab, setTab] = useState<ExplanationTab>('mechanism')
  const [noteOpen, setNoteOpen] = useState(false)
  const { notes, saveNote, flashcards, addFlashcard } = useLearning()
  const keys = optionKeysOf(q)
  const saved = flashcards.some((c) => c.questionId === q.id)

  function captureHighlight() {
    const selected = window.getSelection()?.toString().trim()
    if (!selected) { setNoteOpen(true); return }
    const previous = notes[q.id]?.text ?? ''
    saveNote(q.id, previous ? `${previous}\n\n• ${selected}` : `• ${selected}`)
    setNoteOpen(true)
  }

  return (
    <motion.section initial={{ opacity: 0, height: 0, y: -12 }} animate={{ opacity: 1, height: 'auto', y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }} className={`${card} overflow-hidden border-accent/20`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${mode === 'review' ? 'bg-accent/10 text-accent' : isCorrectPick ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
            {mode === 'review' ? <BookOpen size={18} /> : isCorrectPick ? <CheckCircle2 size={19} /> : <XCircle size={19} />}
          </span>
          <div>
            <p className="text-[13px] font-bold tracking-tight">{mode === 'review' ? 'Answer review' : isCorrectPick ? 'Correct. Nicely done.' : 'Let’s unpack this one.'}</p>
            <p className="mt-0.5 text-[11px] text-muted">{mode === 'review' ? `Your answer: ${ans.selected ?? 'not answered'}` : `Correct answer: ${q.correct_option}`} · First Aid 36th Edition</p>
          </div>
        </div>
        <span className={tag}>FA 36e · p. {q.correct_fa_page}</span>
      </header>

      <div className="border-b border-line px-3 pt-2 sm:px-5">
        <div role="tablist" aria-label="Explanation sections" className="no-scrollbar flex gap-2 overflow-x-auto">
          {TABS.map(({ key, name, Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`relative flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-3 text-[11px] font-semibold transition-colors ${tab === key ? 'text-accent' : 'text-muted hover:text-ink'}`}>
              <Icon size={14} /> {name}
              {tab === key && <motion.span layoutId="explanation-tab-underline" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }} className="px-5 py-6 sm:px-7">
          {tab === 'mechanism' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-accent/15 bg-accent/5 p-4"><p className={`${label} flex items-center gap-2 text-accent`}><Sparkles size={13} /> The high-yield takeaway</p><p className="mt-2.5 text-[15px] font-semibold leading-[1.65] tracking-[-.015em]">{q.high_yield_pearl}</p></div>
              <div><p className={label}>Core pathophysiology &amp; clinical reasoning</p><p className="mt-3 max-w-[75ch] whitespace-pre-line font-reading text-[16px] leading-[1.85]">{q.correct_explanation}</p></div>
            </div>
          )}

          {tab === 'options' && (
            <div><p className={label}>Clinical differential / All answer choices</p><ul className="mt-3 divide-y divide-line">{keys.map((k) => {
              const correct = k === q.correct_option
              const picked = ans.selected === k
              const reason = correct ? q.correct_explanation : distractorOf(q, k).reason
              return <li key={k} className="py-4"><div className="flex items-start gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs font-semibold ${correct ? 'border-good/20 bg-good/10 text-good' : picked ? 'border-bad/20 bg-bad/10 text-bad' : 'border-line bg-sunken text-muted'}`}>{correct ? <Check size={15} /> : k}</span><div className="min-w-0 flex-1"><p className={`text-[13px] font-semibold leading-relaxed ${correct ? 'text-good' : ''}`}>{optionText(q, k)}</p><p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted">{reason}</p></div><span className={tag}>p. {correct ? q.correct_fa_page : distractorOf(q, k).fa_page}</span></div></li>
            })}</ul></div>
          )}

          {tab === 'overview' && (
            <div><div className="mb-3 flex items-center gap-2"><BookOpen size={16} className="text-accent" /><p className="text-[14px] font-semibold">{q.concept_name}</p></div>{q.topic_overview ? <TopicSummary text={q.topic_overview} /> : <div className="rounded-xl border border-dashed border-line bg-sunken/40 px-5 py-8 text-center"><p className="text-[13px] font-semibold">Topic overview not provided</p><p className="mt-1 text-[12px] text-muted">Use Core Mechanism and Option Rule-Outs for full explanations.</p></div>}</div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/35 px-5 py-3">
        <button disabled={connection!=='online'} onClick={() => setNoteOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted hover:text-accent"><NotebookPen size={13}/> Personal note</button>
        <button disabled={connection!=='online'} onClick={captureHighlight} title="Select a passage above, then save it to your note" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-semibold text-muted hover:text-accent"><Highlighter size={13}/> Save selection</button>
        <button onClick={() => addFlashcard(q)} disabled={saved||connection!=='online'} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] font-semibold text-accent disabled:opacity-55"><Plus size={13}/>{saved ? 'Flashcard saved' : 'Make flashcard'}</button>
        <span className="ml-auto hidden items-center gap-1 text-[10px] text-muted sm:flex">Scroll to explore <ChevronDown size={12}/></span>
      </div>
      {noteOpen && <fieldset disabled={connection!=='online'} className="border-0 p-0"><div className="border-t border-line p-5"><NoteEditor q={q} /></div></fieldset>}
    </motion.section>
  )
}
