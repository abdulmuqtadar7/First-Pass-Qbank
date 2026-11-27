import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Cloud, Download, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { downloadLegacyBackup, emptySnapshot, hasAccountCache, hasLegacyProgress, isPending,
  readSnapshot, saveSnapshot, setPending, type AccountSnapshot } from '../lib/accountStorage'
import { decodeCloudSnapshot } from '../lib/cloudCodec'
import { loadBundledQuestions } from '../lib/data'
import { progressExport } from '../lib/learning'
import { supabase } from '../lib/supabase'
import AuthScreen from './AuthScreen'
import ConnectivityGate, { useBrowserOnline } from './ConnectivityGate'
import { readSyncBase, writeSyncBase } from '../lib/syncBase'
import { mergeCloudSnapshots, sameSnapshotValue } from '../lib/cloudMerge'

export interface AccountBoot {
  snapshot: AccountSnapshot
  revision: number
  pending: boolean
}

type Choice =
  | { kind: 'legacy' }
  | { kind: 'conflict'; local: AccountSnapshot; cloud: AccountSnapshot; revision: number }

export default function AccountGate({ children }: { children: (userId: string, boot: AccountBoot) => ReactNode }) {
  const { user, loading, recoveringPassword } = useAuth()
  const [boot, setBoot] = useState<AccountBoot | null>(null)
  const [bootUser, setBootUser] = useState<string|null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const browserOnline = useBrowserOnline()
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    setBoot(null); setBootUser(null); setChoice(null); setError('')
    if (!user || !supabase) return
    const userId = user.id
    const client = supabase
    let canceled = false
    const controller = new AbortController()
    const deadline = window.setTimeout(()=>controller.abort(),15000)
    // Warm the exact existing full-bank loader during the small account fetch.
    void loadBundledQuestions().catch(() => {})
    async function initialize() {
      setBusy(true)
      try {
        const { data, error: dbError } = await client.from('user_qbank_state')
          .select('snapshot, revision').eq('user_id', userId).abortSignal(controller.signal).maybeSingle()
        if (canceled) return
        if (dbError) throw dbError
        if (data) {
          const cloud = decodeCloudSnapshot(data.snapshot)
          const local = readSnapshot(userId)
          if (hasAccountCache(userId) && isPending(userId) && !sameSnapshotValue(local, cloud)) {
            const base = readSyncBase(userId)
            const rev = Number(data.revision)
            const merged = base && base.revision <= rev
              ? base.revision === rev && sameSnapshotValue(base.snapshot, cloud) ? local : mergeCloudSnapshots(base.snapshot, local, cloud)
              : null
            if (merged) {
              finalize(JSON.parse(JSON.stringify(merged)) as AccountSnapshot, rev, !sameSnapshotValue(merged, cloud), cloud)
            } else setChoice({ kind: 'conflict', cloud, local, revision: rev })
          } else {
            finalize(cloud, Number(data.revision), false)
          }
        } else if (hasAccountCache(userId)) {
          finalize(readSnapshot(userId), 0, true)
        } else if (hasLegacyProgress()) {
          setChoice({ kind: 'legacy' })
        } else {
          finalize(emptySnapshot(), 0, true)
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : 'Could not connect to your secure cloud account.')
      } finally { window.clearTimeout(deadline); if (!canceled) setBusy(false) }
    }
    function finalize(snapshot: AccountSnapshot, revision: number, pending: boolean, common?: AccountSnapshot) {
      if (canceled) return
      try {
        saveSnapshot(userId, snapshot)
        setPending(userId, pending)
        if (common || !pending) writeSyncBase(userId, revision, common ?? snapshot)
        setBootUser(userId)
        setBoot({ snapshot, revision, pending })
        setChoice(null)
        setError('')
      } catch {
        setError('Browser storage is full or unavailable. Please free some space before continuing; your original progress is unchanged.')
      }
    }
    void initialize()
    return () => { canceled = true; window.clearTimeout(deadline); controller.abort() }
  }, [user?.id, retryVersion])

  // A loaded account is never unmounted because connectivity changed. Before
  // boot, retry failed connection attempts automatically, including reconnect.
  useEffect(() => {
    if (boot || !user || choice || busy) return
    const reconnect = () => setRetryVersion(v=>v+1)
    window.addEventListener('online', reconnect)
    const timer = error ? window.setInterval(() => { if(navigator.onLine)reconnect() }, 10000) : undefined
    return () => { window.removeEventListener('online', reconnect); if(timer!==undefined)window.clearInterval(timer) }
  }, [boot,user,choice,busy,error])

  const finishChoice = (snapshot: AccountSnapshot, revision: number, pending: boolean) => {
    if (!user) return
    try {
      saveSnapshot(user.id, snapshot)
      setPending(user.id, pending)
      if (choice?.kind === 'conflict') writeSyncBase(user.id, revision, choice.cloud)
      else if (!pending) writeSyncBase(user.id, revision, snapshot)
      setBootUser(user.id)
      setBoot({ snapshot, revision, pending })
      setChoice(null)
    } catch { setError('Browser storage is unavailable. No progress has been deleted.') }
  }

  if (!boot && !browserOnline) return <ConnectivityGate />
  if (loading) return <Loading text="Restoring your secure study account…" />
  if (!user || recoveringPassword) return <AuthScreen />
  if (boot && bootUser === user.id) return <>{children(user.id, boot)}</>
  if (error && !choice && !error.includes('storage')) return <ConnectivityGate retry={()=>setRetryVersion(v=>v+1)} />

  return <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 text-ink">
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[600px] rounded-[30px] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-10">
      <p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.2em] text-accent"><Sparkles size={15} /> Your private learning space</p>
      {busy && !choice && !error && <div className="mt-7"><h1 className="font-display text-4xl tracking-tight">Preparing your account…</h1><p className="mt-3 text-sm leading-6 text-muted">Checking your saved cloud progress before opening the dashboard.</p><div className="mt-7 h-1 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div></div>}
      {choice?.kind === 'legacy' && <>
        <h1 className="mt-5 font-display text-[45px] leading-tight tracking-tight">We found your previous progress.</h1>
        <p className="mt-4 text-sm leading-7 text-muted">This browser has FirstPass progress from before accounts existed. Choose whether to copy it into <strong className="text-ink">{user.email}</strong>. Your original browser data will not be deleted or changed.</p>
        <div className="mt-7 grid gap-3">
          <button onClick={() => finishChoice(readSnapshot(), 0, true)} className="group flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-left transition hover:border-accent"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white"><Download size={21}/></span><span className="flex-1"><strong className="block text-sm">Import my existing progress</strong><span className="mt-1 block text-xs leading-5 text-muted">Copy answers, streaks, notes, flashcards and any imported questions into this account.</span></span><ArrowRight size={19} className="text-accent"/></button>
          <button onClick={() => finishChoice(emptySnapshot(), 0, true)} className="flex items-center gap-4 rounded-2xl border border-line p-5 text-left transition hover:bg-sunken"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sunken text-muted"><Cloud size={21}/></span><span className="flex-1"><strong className="block text-sm">Start fresh with this account</strong><span className="mt-1 block text-xs leading-5 text-muted">Do not import the old progress. You can still access a backup of it later.</span></span><ArrowRight size={19} className="text-muted"/></button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><p className="flex items-center gap-2 text-[11px] text-muted"><ShieldCheck size={15}/> Your old progress stays untouched.</p><button onClick={downloadLegacyBackup} className="rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-accent">Download old progress backup</button></div>
      </>}
      {choice?.kind === 'conflict' && <>
        <h1 className="mt-5 font-display text-[42px] leading-tight tracking-tight">Two versions of your progress.</h1>
        <p className="mt-4 text-sm leading-7 text-muted">This device has changes that haven't synced, and your cloud account has a different copy. Choose which one to keep. Nothing will be replaced until you decide.</p>
        <div className="mt-7 grid gap-3">
          <button onClick={() => finishChoice(choice.local, choice.revision, true)} className="flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-left"><Cloud size={22} className="shrink-0 text-accent"/><span className="flex-1"><strong className="block text-sm">Keep this device's progress</strong><span className="mt-1 block text-xs text-muted">Sync the device's copy and replace the cloud copy.</span></span><ArrowRight size={18}/></button>
          <button onClick={() => finishChoice(choice.cloud, choice.revision, false)} className="flex items-center gap-4 rounded-2xl border border-line p-5 text-left"><Download size={22} className="shrink-0 text-muted"/><span className="flex-1"><strong className="block text-sm">Use cloud progress</strong><span className="mt-1 block text-xs text-muted">Replace the unsynced device copy with the cloud copy.</span></span><ArrowRight size={18}/></button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><p className="flex items-center gap-2 text-[11px] text-muted"><TriangleAlert size={15}/> If unsure, save a backup first.</p><button onClick={() => progressExport(user.id)} className="rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-accent">Download device backup</button></div>
      </>}
      {!!error && <div role="alert" className="mt-7 rounded-2xl border border-bad/25 bg-bad/10 p-5"><p className="font-semibold text-bad">Couldn't open your saved progress</p><p className="mt-2 text-xs leading-6 text-muted">{error}</p><button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white">Retry safely</button></div>}
    </motion.section>
  </div>
}

function Loading({ text }: { text: string }) {
  return <div className="grid min-h-dvh place-items-center bg-canvas px-4 text-ink"><div className="text-center"><div className="mx-auto mb-5 grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-accent/15 text-accent"><Cloud size={24}/></div><h1 className="text-xl font-bold">FirstPass Q-Bank</h1><p className="mt-2 text-sm text-muted">{text}</p></div></div>
}
