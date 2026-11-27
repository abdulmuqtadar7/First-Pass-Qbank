import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

  // Mark local changes before the browser can reload and prefer an older cloud snapshot.
  useLayoutEffect(() => {
    if (serialized !== lastSaved.current) setPending(userId, true)
  }, [serialized, userId])

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

  // Do not display Saved while a newer snapshot is waiting for the debounce.
  const visibleStatus: SyncStatus = status === 'saved' && serialized !== lastSaved.current ? 'pending' : status
  const value = useMemo(() => ({ status: visibleStatus, lastError, retry, notifyChanged }), [visibleStatus, lastError, retry, notifyChanged])
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
