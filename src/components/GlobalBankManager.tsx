import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Database, Search, UploadCloud } from 'lucide-react'
import { useStore } from '../lib/store'
import { makeEntry, MAX_BATCH, prepareUpload, publishGlobalBank, type BankEntry } from '../lib/globalBank'
import { OPTION_KEYS, type OptionKey, type Question, type RawQuestion } from '../types/qbank'
import { btnGhost, btnPrimary, card, label } from '../lib/ui'

const field = 'w-full rounded-xl border border-line bg-canvas p-3 text-sm text-ink'
const errorText = (err: unknown) => err instanceof Error ? err.message : 'Unexpected error. Please retry.'
function TextField({ title, value, onChange, rows = 2 }: { title: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-muted">{title}</span><textarea rows={rows} className={field} value={value} onChange={e=>onChange(e.target.value)}/></label>
}

export default function GlobalBankManager({ onBack, onPersonal, initialSearch = '' }: { onBack: () => void; onPersonal: () => void; initialSearch?: string }) {
  const { sharedQuestions, globalBank, bankStatus } = useStore()
  const [drafts, setDrafts] = useState<BankEntry[]>([])
  const [search, setSearch] = useState(initialSearch)
  const [system, setSystem] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<{ id: string; q: RawQuestion } | null>(null)
  const [preview, setPreview] = useState<BankEntry | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [published, setPublished] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const ids = useMemo(()=>new Set(sharedQuestions.map(q=>encodeURIComponent(q.id))),[sharedQuestions])
  const systems = useMemo(()=>[...new Set(sharedQuestions.map(q=>q.system))].sort(),[sharedQuestions])
  const matches = useMemo(()=>{ const term=search.toLowerCase().trim(); return sharedQuestions.filter(q=>(!system||q.system===system)&&(!term||`${q.id} ${q.concept_name} ${q.stem}`.toLowerCase().includes(term))) },[sharedQuestions,search,system])
  const newCount = drafts.filter(d=>!ids.has(d.key)).length
  const editCount = drafts.length-newCount
  const safeLeave = (go:()=>void) => { if ((!drafts.length&&!editing)||window.confirm('Discard unpublished changes and leave?')) go() }
  function edit(q: Question) {
    try { setEditing({id:q.id,q:structuredClone(drafts.find(d=>d.key===encodeURIComponent(q.id))?.question ?? q)});setError('');setPreview(null) }
    catch(e){setError(errorText(e))}
  }
  const patch = <K extends keyof RawQuestion>(key: K, val: RawQuestion[K]) => setEditing(old=>old?{...old,q:{...old.q,[key]:val}}:null)
  function stageEdit() {
    if(!editing) return
    try {
      const e=makeEntry(editing.q,editing.id)
      if(!drafts.some(d=>d.key===e.key)&&drafts.length>=MAX_BATCH) throw new Error(`Maximum ${MAX_BATCH} staged questions.`)
      setDrafts(old=>[...old.filter(d=>d.key!==e.key),e]);setEditing(null);setError('');setNotice('Correction staged. It is not live until you publish.')
    } catch(e){setError(errorText(e))}
  }
  async function upload(file: File | undefined) {
    if(!file) return
    setBusy(true);setError('');setNotice('');setPreview(null)
    try {
      if(file.size>15_000_000) throw new Error('File exceeds 15 MB. Split into smaller batches.')
      const {entries,duplicates}=prepareUpload(JSON.parse(await file.text()),sharedQuestions,drafts)
      if(drafts.length+entries.length>MAX_BATCH) throw new Error(`Maximum ${MAX_BATCH} staged questions per publication.`)
      setDrafts(old=>[...old,...entries]);setNotice(`${file.name}: ${entries.length} new questions staged, ${duplicates} existing IDs skipped. Nothing published yet.`)
    }catch(e){setError(errorText(e))}finally{setBusy(false);if(input.current)input.current.value=''}
  }
  async function publish() {
    if(busy||!drafts.length||editing||!window.confirm(`Publish ${newCount} new question(s) and ${editCount} correction(s) for every student? Existing saved scores will not be recalculated.`))return
    setBusy(true);setError('');setNotice('')
    try {
      const revision=await publishGlobalBank(globalBank.revision,drafts)
      setDrafts([]);setPreview(null);setPublished(true);setNotice(`Published revision ${revision}. Reload QB360 to use the new shared bank.`)
    }catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  const q=editing?.q
  const options=q?OPTION_KEYS.filter(k=>k!=='E'||!!q.option_E):[]
  return <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:px-8"><div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><button className={btnGhost} disabled={busy||published} onClick={()=>safeLeave(onBack)}><ArrowLeft size={15}/> Owner dashboard</button><p className={`${label} mt-6 flex items-center gap-2`}><Database size={15}/> Shared question bank</p><h1 className="mt-2 font-reading text-4xl font-semibold">Publish questions for everyone.</h1><p className="mt-2 text-sm text-muted">Upload, review and publish without changing the bundled files or saved question IDs.</p></div><button className={btnGhost} disabled={busy||published} onClick={()=>safeLeave(onPersonal)}>Personal import tools</button></header>
    {error&&<p role="alert" className={`${card} p-4 text-sm text-bad whitespace-pre-wrap`}>{error}</p>}
    {notice&&<p role="status" className={`${card} p-4 text-sm text-ink`}>{notice}</p>}
    {published?<section className={`${card} p-5`}><button className={btnPrimary} onClick={()=>window.location.reload()}>Reload published bank</button></section>:bankStatus!=='ready'?<section className={`${card} p-5`}><p>{bankStatus==='error'?'Shared bank failed to load. Check the database setup and retry.':'Loading shared question bank…'}</p>{bankStatus==='error'&&<button className={`${btnGhost} mt-3`} onClick={()=>window.location.reload()}>Retry</button>}</section>:<>
    <div className="grid gap-4 sm:grid-cols-3"><section className={`${card} p-5`}><p className={label}>Available to all students</p><p className="mt-2 text-3xl font-bold">{sharedQuestions.length.toLocaleString()}</p></section><section className={`${card} p-5`}><p className={label}>Published additions / corrections</p><p className="mt-2 text-3xl font-bold">{globalBank.entries.length.toLocaleString()}</p></section><section className={`${card} p-5`}><p className={label}>Bank revision</p><p className="mt-2 text-3xl font-bold">{globalBank.revision}</p></section></div>
    <section className={`${card} space-y-3 p-5`}><UploadCloud className="text-accent"/><h2 className="text-xl font-bold">Upload a new question bank</h2><p className="text-sm text-muted">Choose a JSON file in the existing QB360 format. Duplicates by question ID are skipped; invalid files are rejected in full. Maximum 2,000 questions and 15 MB per batch. Review the draft before publishing.</p><input ref={input} type="file" accept=".json,application/json" hidden disabled={busy||!!editing} onChange={e=>void upload(e.target.files?.[0])}/><button className={btnPrimary} disabled={busy||!!editing} onClick={()=>input.current?.click()}>Choose JSON file</button></section>
    <section className={`${card} space-y-4 p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Unpublished draft</h2><p className="text-xs text-muted">{newCount} additions · {editCount} corrections. Drafts stay in this open page until published.</p></div><button className={btnPrimary} disabled={busy||!drafts.length||!!editing} onClick={()=>void publish()}>{busy?'Working…':`Publish ${drafts.length} questions`}</button></div>
    {drafts.length>0&&<><div className="max-h-80 overflow-auto divide-y divide-line">{drafts.map(d=><div key={d.key} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{d.question.concept_name}</p><p className="text-xs text-muted line-clamp-1">{d.question.stem}</p></div><button className={btnGhost} disabled={busy||!!editing} onClick={()=>setPreview(d)}>Preview</button><button className={btnGhost} disabled={busy||!!editing} onClick={()=>{setDrafts(old=>old.filter(x=>x.key!==d.key));setPreview(old=>old?.key===d.key?null:old)}}>Remove</button></div>)}</div><button className={btnGhost} disabled={busy||!!editing} onClick={()=>{if(window.confirm('Discard the entire unpublished draft?')){setDrafts([]);setPreview(null)}}}>Discard all drafts</button></>}
    {preview&&<article className="rounded-xl border border-line p-4 space-y-2"><div className="flex justify-between gap-2"><strong>{preview.question.concept_name}</strong><button className={btnGhost} onClick={()=>setPreview(null)}>Close preview</button></div><p className="whitespace-pre-wrap text-sm">{preview.question.stem}</p>{OPTION_KEYS.filter(k=>k!=='E'||preview.question.option_E).map(k=><p key={k} className={`text-sm ${k===preview.question.correct_option?'text-good font-semibold':''}`}>{k}. {preview.question[`option_${k}`]}</p>)}<p className="text-sm font-semibold">Correct answer: {preview.question.correct_option} · Page {preview.question.correct_fa_page}</p><p className="text-sm whitespace-pre-wrap">{preview.question.correct_explanation}</p>{OPTION_KEYS.filter(k=>k!=='E'||preview.question.option_E).map(k=><p key={k} className="text-xs whitespace-pre-wrap text-muted">{k}: {preview.question.distractor_explanations[k]?.reason} (p. {preview.question.distractor_explanations[k]?.fa_page})</p>)}<p className="text-sm whitespace-pre-wrap">{preview.question.high_yield_pearl}</p>{preview.question.topic_overview&&<p className="text-sm whitespace-pre-wrap">{preview.question.topic_overview}</p>}</article>}
    </section>
    <section className={`${card} space-y-4 p-5`}><h2 className="text-xl font-bold">Find and correct an existing question</h2><p className="text-sm text-muted">Corrections retain the original question ID, system and concept. Historical attempts and scores remain as recorded. Use the report’s question wording or concept name to find it.</p>
    {editing&&q?<div className="space-y-3 rounded-xl border border-accent/30 p-4"><p className="text-sm font-bold">Editing {q.system} · {q.concept_name}</p><p className="text-xs text-muted break-all">ID: {editing.id}</p><TextField title="Question stem" value={q.stem} rows={5} onChange={v=>patch('stem',v)}/>{options.map(k=><TextField key={k} title={`Option ${k}`} value={q[`option_${k}`]??''} onChange={v=>patch(`option_${k}`,v)}/>)}<label className="block text-xs font-semibold text-muted">Correct option<select className={field} value={q.correct_option} onChange={e=>patch('correct_option',e.target.value as OptionKey)}>{options.map(k=><option key={k}>{k}</option>)}</select></label><TextField title="Correct explanation" value={q.correct_explanation} rows={5} onChange={v=>patch('correct_explanation',v)}/><label className="block text-xs font-semibold text-muted">Correct First Aid page<input className={field} type="number" value={q.correct_fa_page} onChange={e=>patch('correct_fa_page',e.target.valueAsNumber)}/></label>{options.map(k=><div key={k} className="space-y-2"><TextField title={`Option ${k} explanation`} value={q.distractor_explanations[k]?.reason??''} onChange={v=>patch('distractor_explanations',{...q.distractor_explanations,[k]:{...q.distractor_explanations[k],reason:v}})}/><label className="block text-xs font-semibold text-muted">Option {k} First Aid page<input type="number" className={field} value={q.distractor_explanations[k]?.fa_page??''} onChange={e=>patch('distractor_explanations',{...q.distractor_explanations,[k]:{...q.distractor_explanations[k],fa_page:e.target.valueAsNumber}})}/></label></div>)}<TextField title="High-yield pearl" value={q.high_yield_pearl} onChange={v=>patch('high_yield_pearl',v)}/><TextField title="Topic overview" value={q.topic_overview??''} rows={6} onChange={v=>patch('topic_overview',v)}/><div className="flex flex-wrap gap-2"><button className={btnPrimary} onClick={stageEdit}>Stage correction</button><button className={btnGhost} onClick={()=>{if(window.confirm('Discard this edit?'))setEditing(null)}}>Cancel edit</button></div></div>:<><div className="flex flex-wrap gap-2"><label className="flex flex-1 min-w-[180px] items-center gap-2"><Search size={18}/><input aria-label="Search questions" className={field} placeholder="Search concept, stem or ID" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/></label><select aria-label="Filter system" className="rounded-xl border border-line bg-canvas p-3 text-sm" value={system} onChange={e=>{setSystem(e.target.value);setPage(0)}}><option value="">All systems</option>{systems.map(s=><option key={s}>{s}</option>)}</select></div><p className="text-xs text-muted">{matches.length} matching questions</p><div className="divide-y divide-line">{matches.slice(page*20,page*20+20).map(q=><div key={q.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-bold">{q.concept_name} · {q.system}</p><p className="mt-1 text-xs text-muted line-clamp-3">{q.stem}</p></div><button className={btnGhost} disabled={busy} onClick={()=>edit(q)}>Edit</button></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2"><button className={btnGhost} disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span className="text-xs text-muted">Page {page+1} of {Math.max(1,Math.ceil(matches.length/20))}</span><button className={btnGhost} disabled={(page+1)*20>=matches.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></>}
    </section></>}
  </div></main>
}
