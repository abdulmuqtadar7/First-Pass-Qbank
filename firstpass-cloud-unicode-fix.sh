#!/usr/bin/env bash
# FirstPass cloud sync: lossless PostgreSQL JSONB compatibility fix.
# Backups and localStorage progress remain untouched.
set -euo pipefail
for file in src/lib/cloudSync.tsx src/components/AccountGate.tsx src/lib/accountStorage.ts; do
  if [ ! -f "$file" ]; then echo "Missing $file. Run this in the FirstPass project root after installing accounts." >&2; exit 1; fi
done
if [ -f src/lib/cloudCodec.ts ] && grep -Fq "firstpass-utf8-base64-v1" src/lib/cloudCodec.ts; then
  echo "Cloud Unicode fix already installed. Checking the build…"
  npm run build
  exit 0
fi
if [ -e src/lib/cloudCodec.ts ]; then echo "Custom src/lib/cloudCodec.ts already exists. No changes made." >&2; exit 1; fi
echo "Verifying the expected installed accounts files…"
if ! sha256sum --status -c <<'FIRSTPASS_CODEC_BASELINE_SHA'
6ca054b55349ed376765366fcbcdf76bdc467a65287fca44ac97fba5731047cd  src/lib/cloudSync.tsx
0f8a9b2085c2d855b0132ec3e6742ed9413da8af420c7a6f33763dca0e910ff3  src/components/AccountGate.tsx
FIRSTPASS_CODEC_BASELINE_SHA
then
  echo "Your accounts code differs from the tested version. No changes made; ask for a tailored fix." >&2
  exit 1
fi
backup_path=$(mktemp --suffix=.tar.gz ./firstpass-before-unicode-fix-XXXXXX)
tar -czf "$backup_path" 'src/lib/cloudSync.tsx' 'src/components/AccountGate.tsx'
echo "Source backup saved: $backup_path"
echo "Only cloud sync code will change; question JSON, Supabase settings and browser progress are untouched."
mkdir -p src/lib src/components
cat <<'FIRSTPASS_CODEC_FILE_0_EOF' > 'src/lib/cloudCodec.ts'
import { isSnapshot, type AccountSnapshot } from './accountStorage'

/**
 * PostgreSQL JSONB cannot store U+0000 inside JSON strings or object keys.
 * Transport the *entire* snapshot as base64-encoded UTF-8 JSON instead of
 * removing or changing question IDs, notes, answers, or imported questions.
 * This is an encoding for compatibility, NOT encryption; RLS remains essential.
 */
const CODEC = 'firstpass-utf8-base64-v1'

export interface CloudSnapshot {
  codec: typeof CODEC
  payload: string
}

export function encodeCloudSnapshot(snapshot: AccountSnapshot): CloudSnapshot {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
  const pieces: string[] = []
  // Avoid a browser argument-limit error on large progress snapshots.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }
  return { codec: CODEC, payload: btoa(pieces.join('')) }
}

export function decodeCloudSnapshot(value: unknown): AccountSnapshot {
  // Preserve compatibility with snapshots saved before this transport fix.
  if (isSnapshot(value)) return value
  if (!value || typeof value !== 'object') throw new Error('Invalid cloud progress format. Your browser progress was not changed.')
  const cloud = value as Partial<CloudSnapshot>
  if (cloud.codec !== CODEC || typeof cloud.payload !== 'string') {
    throw new Error('Unknown cloud progress format. Your browser progress was not changed.')
  }
  try {
    const binary = atob(cloud.payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!isSnapshot(decoded)) throw new Error('Progress snapshot failed validation')
    return decoded
  } catch {
    throw new Error('Could not decode cloud progress. Your browser progress was not changed.')
  }
}
FIRSTPASS_CODEC_FILE_0_EOF
cat <<'FIRSTPASS_CODEC_FILE_1_EOF' > 'src/lib/cloudSync.tsx'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Cloud, CloudOff, RefreshCw, ShieldAlert } from 'lucide-react'
import { useLearning, progressExport } from './learning'
import { useStore } from './store'
import { fieldKey, saveSnapshot, setPending, type AccountSnapshot } from './accountStorage'
import { decodeCloudSnapshot, encodeCloudSnapshot } from './cloudCodec'
import { supabase } from './supabase'
import type { AccountBoot } from '../components/AccountGate'

type SyncStatus = 'saved' | 'saving' | 'pending' | 'offline' | 'conflict'

interface CloudSyncValue {
  status: SyncStatus
  lastError: string
  retry: () => void
  notifyChanged: () => void
}

const Context = createContext<CloudSyncValue | null>(null)

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : ''
    return error.message + code
  }
  return 'Cloud sync is unavailable.'
}

export function useCloudSync(): CloudSyncValue {
  const value = useContext(Context)
  if (!value) throw new Error('useCloudSync must be used inside CloudSyncProvider')
  return value
}

export function CloudSyncProvider({ children, userId, boot }: { children: ReactNode; userId: string; boot: AccountBoot }) {
  const { state, imported, daily } = useStore()
  const { schedule, attempts, history, active, notes, flashcards, settings } = useLearning()
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [retryVersion, setRetryVersion] = useState(0)
  const [status, setStatus] = useState<SyncStatus>(boot.pending ? 'pending' : 'saved')
  const [lastError, setLastError] = useState('')
  const revision = useRef(boot.revision)
  const lastSaved = useRef(!boot.pending && boot.revision ? JSON.stringify(boot.snapshot) : '')
  const busy = useRef(false)
  const conflicted = useRef(false)

  const notifyChanged = useCallback(() => setAvatarVersion((v) => v + 1), [])
  const retry = useCallback(() => { if (conflicted.current) return; setRetryVersion((v) => v + 1) }, [])

  const snapshot: AccountSnapshot = useMemo(() => ({
    schema: 1, state, imported, daily,
    learning: { schedule, attempts, history, active, notes, flashcards, settings },
    avatar: localStorage.getItem(fieldKey(userId, 'avatar')) === 'female' ? 'female'
      : localStorage.getItem(fieldKey(userId, 'avatar')) === 'male' ? 'male' : null,
  // The avatar is changed by App, which calls notifyChanged after saving it.
  }), [state, imported, daily, schedule, attempts, history, active, notes, flashcards, settings, userId, avatarVersion])
  const serialized = JSON.stringify(snapshot)
  const latest = useRef(serialized)
  latest.current = serialized

  useEffect(() => {
    function onOnline() { setRetryVersion((v) => v + 1) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  useEffect(() => {
    if (!supabase || conflicted.current || serialized === lastSaved.current) return
    setPending(userId, true)
    setStatus('pending')
    const timer = window.setTimeout(() => { void save(serialized) }, 1300)
    async function save(body: string) {
      if (!supabase || busy.current || conflicted.current) return
      busy.current = true
      setStatus('saving')
      try {
        const snapshot = encodeCloudSnapshot(JSON.parse(body) as AccountSnapshot)
        const currentRevision = revision.current
        const request = currentRevision === 0
          ? supabase.from('user_qbank_state').insert({ user_id: userId, snapshot, revision: 1 })
            .select('revision').maybeSingle()
          : supabase.from('user_qbank_state').update({ snapshot, revision: currentRevision + 1, updated_at: new Date().toISOString() })
            .eq('user_id', userId).eq('revision', currentRevision).select('revision').maybeSingle()
        const { data, error } = await request
        if (error) {
          // 23505 means another device created the initial row first.
          if (error.code === '23505') {
            conflicted.current = true
            setStatus('conflict')
            setLastError('Your account was updated on another device.')
            return
          }
          throw error
        }
        if (!data) {
          conflicted.current = true
          setStatus('conflict')
          setLastError('Your cloud account was updated elsewhere. Choose which version to keep.')
          return
        }
        revision.current = Number(data.revision)
        lastSaved.current = body
        if (latest.current === body) {
          setPending(userId, false)
          setStatus('saved')
          setLastError('')
        } else {
          setPending(userId, true)
          setStatus('pending')
        }
      } catch (err) {
        setPending(userId, true)
        setStatus('offline')
        setLastError(describeError(err))
      } finally {
        busy.current = false
        if (latest.current !== lastSaved.current && !conflicted.current && latest.current !== body) {
          setRetryVersion((v) => v + 1)
        }
      }
    }
    return () => window.clearTimeout(timer)
  }, [serialized, retryVersion, userId])

  async function resolveConflict(choice: 'cloud' | 'device') {
    if (!supabase) return
    const description = choice === 'cloud'
      ? 'Replace unsynced progress on this device with the cloud copy? Download a backup first if you need these changes.'
      : 'Replace the newer cloud copy with this device’s progress? This cannot be undone on other devices.'
    if (!window.confirm(description)) return
    try {
      const { data, error } = await supabase.from('user_qbank_state')
        .select('snapshot, revision').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (choice === 'cloud') {
        if (!data?.snapshot) throw new Error('Could not find the newer cloud snapshot.')
        saveSnapshot(userId, decodeCloudSnapshot(data.snapshot))
        setPending(userId, false)
        window.location.reload()
      } else {
        revision.current = Number(data?.revision ?? 0)
        lastSaved.current = ''
        conflicted.current = false
        setRetryVersion((v) => v + 1)
      }
    } catch (err) {
      setStatus('offline')
      setLastError(describeError(err))
    }
  }

  const value = useMemo(() => ({ status, lastError, retry, notifyChanged }), [status, lastError, retry, notifyChanged])
  return <Context.Provider value={value}>
    {children}
    {status === 'offline' && <aside role="status" className="fixed bottom-24 right-4 z-[80] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[#e1bd84] bg-surface p-4 text-ink shadow-2xl md:bottom-5">
      <p className="flex items-center gap-2 text-[13px] font-bold"><CloudOff size={17} className="text-[#c58b4c]"/> Progress saved on this device</p><p className="mt-1 text-xs leading-5 text-muted">Cloud sync paused: {lastError}. Your answers remain in this account's browser cache.</p><button onClick={retry} className="mt-3 flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white"><RefreshCw size={14}/> Retry sync</button>
    </aside>}
    {status === 'conflict' && <aside role="alert" className="fixed bottom-24 right-4 z-[80] w-[min(410px,calc(100vw-32px))] rounded-2xl border border-bad/30 bg-surface p-5 text-ink shadow-2xl md:bottom-5">
      <p className="flex items-center gap-2 text-[13px] font-bold"><ShieldAlert size={18} className="text-bad"/> Two devices have different progress</p>
      <p className="mt-2 text-xs leading-6 text-muted">{lastError} Your local changes are preserved. Download a backup, then decide which version should win.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => progressExport(userId)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Download backup</button><button onClick={() => void resolveConflict('cloud')} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Use cloud</button><button onClick={() => void resolveConflict('device')} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Keep device</button></div>
    </aside>}
  </Context.Provider>
}

export function CloudSyncIndicator() {
  const { status, retry } = useCloudSync()
  return <button onClick={retry} title="Your answers are stored on this device first, then synced securely" className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-2 text-[10px] font-semibold text-muted shadow-sm sm:inline-flex" aria-label={`Cloud progress: ${status}`}>
    {status === 'offline' || status === 'conflict' ? <CloudOff size={14} className="text-bad"/> : <Cloud size={14} className={status === 'saved' ? 'text-good' : 'text-accent'}/>} {status === 'saved' ? 'Saved to cloud' : status === 'saving' ? 'Syncing…' : status === 'pending' ? 'Saving soon…' : status === 'conflict' ? 'Sync conflict' : 'Retry sync'}
  </button>
}
FIRSTPASS_CODEC_FILE_1_EOF
cat <<'FIRSTPASS_CODEC_FILE_2_EOF' > 'src/components/AccountGate.tsx'
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
  const [choice, setChoice] = useState<Choice | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBoot(null); setChoice(null); setError('')
    if (!user || !supabase) return
    const userId = user.id
    const client = supabase
    let canceled = false
    // Warm the exact existing full-bank loader during the small account fetch.
    void loadBundledQuestions().catch(() => {})
    async function initialize() {
      setBusy(true)
      try {
        const { data, error: dbError } = await client.from('user_qbank_state')
          .select('snapshot, revision').eq('user_id', userId).maybeSingle()
        if (canceled) return
        if (dbError) throw dbError
        if (data) {
          const cloud = decodeCloudSnapshot(data.snapshot)
          const local = readSnapshot(userId)
          if (hasAccountCache(userId) && isPending(userId) && JSON.stringify(local) !== JSON.stringify(cloud)) {
            setChoice({ kind: 'conflict', cloud, local, revision: Number(data.revision) })
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
      } finally { if (!canceled) setBusy(false) }
    }
    function finalize(snapshot: AccountSnapshot, revision: number, pending: boolean) {
      if (canceled) return
      try {
        saveSnapshot(userId, snapshot)
        setPending(userId, pending)
        setBoot({ snapshot, revision, pending })
        setChoice(null)
        setError('')
      } catch {
        setError('Browser storage is full or unavailable. Please free some space before continuing; your original progress is unchanged.')
      }
    }
    void initialize()
    return () => { canceled = true }
  }, [user?.id])

  const finishChoice = (snapshot: AccountSnapshot, revision: number, pending: boolean) => {
    if (!user) return
    try {
      saveSnapshot(user.id, snapshot)
      setPending(user.id, pending)
      setBoot({ snapshot, revision, pending })
      setChoice(null)
    } catch { setError('Browser storage is unavailable. No progress has been deleted.') }
  }

  if (loading) return <Loading text="Restoring your secure study account…" />
  if (!user || recoveringPassword) return <AuthScreen />
  if (boot) return <>{children(user.id, boot)}</>

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
FIRSTPASS_CODEC_FILE_2_EOF
echo "Cloud sync transport updated. Checking TypeScript and Vite…"
npm run build
