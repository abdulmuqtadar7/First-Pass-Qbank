import { useMemo, useState } from 'react'
import { ArrowLeft, Clock3, ClipboardCheck } from 'lucide-react'
import { useStore } from '../lib/store'
import { useLearning } from '../lib/learning'
import { countConcepts } from '../lib/sessionBuilder'
import { MOCK_PRESETS, mockPool, mockQueue, BLOCK_SIZE } from '../lib/mockExam'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'
import type { MockConfig, OptionKey } from '../types/qbank'

interface Props { onStart: (ids: string[], config: MockConfig) => void; onResume: () => void; onReview: (ids: string[], prefill: Record<string, OptionKey>) => void; onBack: () => void }
export default function ExamCenter({ onStart, onResume, onReview, onBack }: Props) {
  const { questions, byId } = useStore()
  const { active, history } = useLearning()
  const systems = useMemo(() => [...new Map(questions.map(q => [q.system.trim().toLowerCase(), q.system])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [questions])
  const [selected, setSelected] = useState(() => systems.map(([key]) => key))
  const [preset, setPreset] = useState('Quick Mock')
  const [size, setSize] = useState('40')
  const [minutes, setMinutes] = useState('60')
  const [breaks, setBreaks] = useState(true)
  const available = useMemo(() => countConcepts(mockPool(questions, selected)), [questions, selected])
  const n = Number(size), m = Number(minutes)
  const valid = Number.isInteger(n) && n >= 1 && n <= 200 && n <= available && Number.isInteger(m) && m >= 1 && m <= 600 && m * 60 >= n
  const blocks = valid ? Math.ceil(n / BLOCK_SIZE) : 0
  const config: MockConfig = { name: preset, size: n, minutes: m, systems: selected, breakMinutes: breaks ? 5 : 0 }
  const mocks = history.filter(h => h.mode === 'exam' && h.mock)
  const score = (h: typeof mocks[number]) => Math.round(100 * h.correct / Math.max(1, h.ids.length))
  return <div className="space-y-6">
    <button onClick={onBack} className={btnGhost}><ArrowLeft size={16}/> Practice</button>
    <header><p className={label}>Timed assessment</p><h1 className="mt-2 font-display text-[39px] leading-tight tracking-[-.05em] sm:text-[50px]">Exam Center<span className="text-accent">.</span></h1><p className="mt-2 text-sm text-muted">Simulate exam day with timed blocks and review your performance afterward.</p></header>
    {active?.session.source?.kind === 'mock' && <section className={`${card} flex flex-wrap items-center justify-between gap-4 p-5`}><div><h2 className="font-bold">Unfinished mock examination</h2><p className="text-sm text-muted">{active.session.title} · Block {(active.mock?.block ?? 0) + 1} · {Object.values(active.answers).filter(a => a.selected).length}/{active.queue.length} answered</p></div><button className={btnPrimary} onClick={onResume}>Resume mock</button></section>}
    <section className={`${card} space-y-5 p-5 sm:p-7`}>
      <h2 className="text-lg font-bold">Choose your examination</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[...MOCK_PRESETS, {name:'Custom Mock',size:40,minutes:60}].map(p => <button key={p.name} aria-pressed={preset===p.name} onClick={() => {setPreset(p.name); setSize(String(p.size)); setMinutes(String(p.minutes))}} className={`rounded-2xl border p-4 text-left ${preset===p.name?'border-accent bg-accent/10':'border-line bg-sunken/40'}`}><ClipboardCheck size={20} className="mb-3 text-accent"/><p className="font-bold">{p.name}</p><p className="mt-1 text-xs text-muted">{p.name==='Custom Mock'?'Choose your own limits':`${p.size} questions · ${p.minutes} min`}</p></button>)}</div>
      {preset==='Custom Mock' && <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Questions (1–200)<input aria-label="Mock question count" type="number" min={1} max={200} value={size} onChange={e=>setSize(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-sunken p-3"/></label><label className="text-sm font-semibold">Minutes (1–600)<input aria-label="Mock duration" type="number" min={1} max={600} value={minutes} onChange={e=>setMinutes(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-sunken p-3"/></label></div>}
      <div><h3 className="mb-2 font-semibold">Include systems</h3><div className="flex flex-wrap gap-2">{systems.map(([key,name])=><button key={key} aria-pressed={selected.includes(key)} onClick={()=>setSelected(s=>s.includes(key)?s.filter(k=>k!==key):[...s,key])} className={`rounded-full border px-4 py-2 text-sm ${selected.includes(key)?'border-accent bg-accent/10 text-accent':'border-line text-muted'}`}>{name}</button>)}</div><p className="mt-2 text-xs text-muted">{available} distinct concepts available · one question per concept</p></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={breaks} onChange={e=>setBreaks(e.target.checked)}/> Five-minute breaks between blocks</label>
      <div className="rounded-xl bg-sunken p-4 text-sm text-muted"><p className="font-semibold text-ink">{valid?`${n} questions · ${blocks} timed block${blocks===1?'':'s'} · ${m} exam minutes`:'Choose valid limits and enough available concepts.'}</p>{valid&&<p className="mt-1">Up to {breaks?(blocks-1)*5:0} additional break minutes. Finish each block to lock its answers; time expiry advances automatically. Answers and explanations stay hidden until final grading. Save & exit pauses the timer.</p>}</div>
      <button className={btnPrimary} disabled={!valid} onClick={()=>{const ids=mockQueue(questions,config);if(ids.length!==n){window.alert('Not enough eligible concepts.');return}onStart(ids,config)}}>Start mock examination</button>
    </section>
    <section className={`${card} space-y-4 p-5 sm:p-7`}><h2 className="text-lg font-bold">Mock examination history</h2><p className="text-xs text-muted">Scores include unanswered questions. Compare mocks with similar size and system selection; history shares the existing 120-session archive.</p>{!mocks.length?<p className="py-6 text-center text-sm text-muted">No completed mocks yet.</p>:mocks.map(h=><article key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><div><p className="font-bold">{h.title}</p><p className="text-xs text-muted">{new Date(h.completedAt).toLocaleDateString()} · {h.answered}/{h.ids.length} answered · <Clock3 size={12} className="inline"/> {Math.floor(h.elapsed/60)} min</p></div><div className="flex items-center gap-3"><span className="text-xl font-bold">{score(h)}%</span><button className={btnGhost} disabled={!h.ids.some(id=>byId.has(id))} onClick={()=>{const prefill:Record<string,OptionKey>={};for(const [id,answer] of Object.entries(h.selections)) if(answer)prefill[id]=answer;onReview(h.ids.filter(id=>byId.has(id)),prefill)}}>Review</button></div></article>)}</section>
  </div>
}
