import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ShieldCheck, RefreshCw, Users, BookOpen, Activity, Flag } from 'lucide-react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/nav'
import { useOwnerAccess, analyticsKey } from '../lib/ownerAccess'
import { supabase } from '../lib/supabase'
import Admin from './Admin'
import GlobalBankManager from './GlobalBankManager'

type Report = { id: string; question_key: string; category: string; detail: string; created_at: string; resolved_at: string | null }
type Difficulty = { key: string; attempts: number; correct: number; learners: number }
type Overview = { registered: number; verified: number; synced: number; unreadable: number; today: number; month: number; attempts: number; correct: number; openReports: number; hardest: Difficulty[]; reports: Report[] }
const panel = 'rounded-[24px] border border-line bg-surface p-5 shadow-sm sm:p-6'
const btn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-semibold hover:text-accent disabled:opacity-50'
const fmt = (n: number) => Number(n).toLocaleString()
export default function OwnerDashboard() {
  const access = useOwnerAccess()
  const { questions, bankStatus, importedCount } = useStore()
  const [data, setData] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [manage, setManage] = useState<'global' | 'personal' | null>(null)
  const [initialSearch, setInitialSearch] = useState('')
  const [resolving, setResolving] = useState<string | null>(null)
  const lookup = useMemo(() => new Map(questions.map(q => [analyticsKey(q.id), q])), [questions])
  const reportLookup = useMemo(() => new Map(questions.map(q => [encodeURIComponent(q.id), q])), [questions])
  const systems = useMemo(() => { const counts = new Map<string, number>(); for (const q of questions) counts.set(q.system, (counts.get(q.system) ?? 0) + 1); return [...counts].sort((a,b)=>a[0].localeCompare(b[0])) }, [questions])
  useEffect(() => {
    if (access !== 'owner' || !supabase || bankStatus !== 'ready') return
    const client = supabase
    let live = true
    setBusy(true); setError('')
    void (async () => {
      try {
        const keys = [...lookup.keys()].filter(k=>!k.includes('\u0000'))
        const { data: response, error: failure } = await client.rpc('firstpass_owner_overview', { p_bank_keys: keys })
        if (failure) throw failure
        if (!response || typeof response.registered !== 'number') throw new Error('Invalid dashboard response')
        if (live) setData(response as Overview)
      } catch (e) { if (live) { setData(null); setError(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Could not load owner statistics.') } }
      finally { if (live) setBusy(false) }
    })()
    return () => { live = false }
  }, [access, lookup, bankStatus, refresh])
  async function resolve(id: string) {
    if (!supabase || resolving || !window.confirm('Mark this report resolved? This does not edit the question.')) return
    setResolving(id)
    try { const { error: failure } = await supabase.rpc('firstpass_resolve_report', { p_id:id }); if (failure) throw failure; setRefresh(v=>v+1) }
    catch { setError('Could not resolve the report. Please refresh and retry.') }
    finally { setResolving(null) }
  }
  if (access !== 'owner') return <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-ink"><div className={`${panel} max-w-md text-center`}><ShieldCheck className="mx-auto mb-4 text-accent" size={32}/><h1 className="text-2xl font-bold">{access==='loading'?'Checking owner access…':'Owner access only'}</h1><p className="mt-3 text-sm text-muted">{access==='error'?'Could not verify permissions. Check the owner SQL setup or your connection.':access==='denied'?'This account does not have owner permission.':'Checking your account with the database.'}</p><button className={`${btn} mt-5`} onClick={()=>navigate('/')}>Return to study</button></div></main>
  if (manage === 'global') return <GlobalBankManager initialSearch={initialSearch} onBack={()=>setManage(null)} onPersonal={()=>setManage('personal')}/>
  if (manage === 'personal') return <div className="bg-canvas text-ink"><div className="mx-auto max-w-2xl px-4 pt-5"><button className={btn} onClick={()=>setManage('global')}>← Shared bank manager</button><p className="mt-3 text-xs text-muted">Personal imports belong to your account only. Use the shared bank manager to publish for all students.</p></div><Admin/></div>
  const metrics = data ? [
    {label:'Registered accounts',value:data.registered,sub:`${fmt(data.verified)} email verified`,Icon:Users},
    {label:'Studied today',value:data.today,sub:'Accounts with recorded answers',Icon:Activity},
    {label:'30-day learners',value:data.month,sub:'Accounts with recorded answers',Icon:Users},
    {label:'Recorded attempts',value:data.attempts,sub:`${data.attempts?Math.round(data.correct/data.attempts*100):0}% correct`,Icon:BookOpen},
    {label:'Cloud progress records',value:data.synced,sub:'Accounts with saved snapshots',Icon:ShieldCheck},
    {label:'Open reports',value:data.openReports,sub:'Awaiting review',Icon:Flag},
  ] : []
  return <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><button className={btn} onClick={()=>navigate('/')}><ArrowLeft size={15}/> Study dashboard</button><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-accent">FirstPass · Private owner workspace</p><h1 className="mt-2 font-reading text-4xl font-semibold sm:text-5xl">Platform overview.</h1><p className="mt-2 text-sm text-muted">Aggregate learning activity and question quality.</p></div><button className={btn} disabled={busy} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={16}/>{busy?'Refreshing…':'Refresh data'}</button></header>
    {error && <p role="alert" className={`${panel} text-bad`}>{error}</p>}{(!data && !error) && <p className={panel}>{bankStatus==='error'?'Question bank failed to load. Return to Study and retry.':'Loading platform statistics…'}</p>}
    {data && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(({label,value,sub,Icon})=><section key={label} className={panel}><Icon size={20} className="mb-4 text-accent"/><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-2 text-4xl font-bold tabular-nums">{fmt(value)}</p><p className="mt-2 text-xs text-muted">{sub}</p></section>)}</div><p className="text-xs leading-relaxed text-muted">Counts reflect currently synced student progress, not live visits or immutable lifetime events. Activity compares recorded local study dates to the Pakistan calendar. {data.unreadable>0?`${data.unreadable} unreadable snapshot(s) excluded from learning statistics.`:''}</p>
    <section className={panel}><h2 className="text-xl font-bold">Most difficult questions</h2><p className="mt-1 text-xs text-muted">Lowest recorded accuracy, at least 3 learners and 5 attempts per question.</p>{data.hardest.length===0?<p className="mt-5 text-sm text-muted">Not enough shared study activity yet.</p>:<div className="mt-4 divide-y divide-line">{data.hardest.map(r=>{const q=lookup.get(r.key); return <div key={r.key} className="flex items-start justify-between gap-3 py-4"><div className="min-w-0"><p className="text-sm font-semibold">{q?.concept_name ?? 'Question no longer in bank'}</p><p className="mt-1 line-clamp-2 text-xs text-muted">{q?.stem}</p><p className="mt-1 text-xs text-muted">{fmt(r.learners)} learners · {fmt(r.attempts)} attempts</p></div><span className="shrink-0 font-bold text-bad">{Math.round(r.correct/r.attempts*100)}%</span></div>})}</div>}</section>
    <section className={panel}><h2 className="text-xl font-bold">Question reports</h2><p className="mt-1 text-xs text-muted">Latest 100 reports, unresolved first. No student names or emails shown.</p>{!data.reports.length?<p className="mt-5 text-sm text-muted">No reports yet.</p>:<div className="mt-4 divide-y divide-line">{data.reports.map(r=>{const q=reportLookup.get(r.question_key);return <article key={r.id} className="space-y-2 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{q?.concept_name ?? 'Question not in current bank'} · {r.category}</p><span className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</span></div>{q&&<p className="line-clamp-2 text-xs text-muted">{q.stem}</p>}<p className="whitespace-pre-wrap break-words text-sm">{r.detail}</p>{q&&<button className={btn} onClick={()=>{setInitialSearch(q.id);setManage('global')}}>Find question to correct</button>}{r.resolved_at?<p className="text-xs font-semibold text-good">Resolved</p>:<button className={btn} disabled={!!resolving} onClick={()=>void resolve(r.id)}>Mark resolved</button>}</article>})}</div>}</section></>}
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Question bank inventory</h2><p className="mt-1 text-xs text-muted">{fmt(questions.length)} loaded questions · {fmt(importedCount)} personal imports</p></div><button className={btn} onClick={()=>{setInitialSearch('');setManage('global')}}>Manage shared bank</button></div><div className="mt-4 divide-y divide-line">{systems.map(([name,count])=><div key={name} className="flex justify-between py-2 text-sm"><span>{name}</span><span className="tabular-nums">{fmt(count)}</span></div>)}</div></section>
    </div></main>
}
