import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Cloud, CloudOff, ShieldAlert } from 'lucide-react'
import { useLearning, progressExport } from './learning'
import { useStore } from './store'
import { fieldKey, saveSnapshot, setPending, type AccountSnapshot } from './accountStorage'
import { decodeCloudSnapshot, encodeCloudSnapshot } from './cloudCodec'
import { mergeCloudSnapshots, sameSnapshotValue as same } from './cloudMerge'
import { readSyncBase, writeSyncBase } from './syncBase'
import { supabase } from './supabase'
import type { AccountBoot } from '../components/AccountGate'

type SyncStatus = 'saved' | 'saving' | 'pending' | 'offline' | 'conflict'
type Connection = 'online' | 'checking' | 'offline'
interface CloudSyncValue {
  status: SyncStatus; connection: Connection; lastError: string; cloudVersion: number
  retry: () => void; notifyChanged: () => void; setPlayerOpen: (open: boolean) => void
}
const Context = createContext<CloudSyncValue | null>(null)
export function useCloudSync(): CloudSyncValue {
  const value = useContext(Context)
  if (!value) throw new Error('useCloudSync must be used inside CloudSyncProvider')
  return value
}
const parse = (s:string) => JSON.parse(s) as AccountSnapshot
const openDraft = () => Array.from(document.querySelectorAll('textarea,[contenteditable="true"],[role="dialog"]')).some(el=>el.getClientRects().length>0)

export function CloudSyncProvider({ children, userId, boot }: { children: ReactNode; userId: string; boot: AccountBoot }) {
  const { state, imported, daily, applyCloudMerge: applyStore } = useStore()
  const { schedule, attempts, history, active, notes, flashcards, settings, applyCloudMerge: applyLearning } = useLearning()
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [cloudVersion, setCloudVersion] = useState(0)
  const [status, setStatus] = useState<SyncStatus>(boot.pending ? 'pending' : 'saved')
  const [connection, setConnection] = useState<Connection>(navigator.onLine ? 'online' : 'offline')
  const [lastError, setLastError] = useState('')
  const revision = useRef(boot.revision)
  const saved = useRef(!boot.pending && boot.revision ? JSON.stringify(boot.snapshot) : '')
  const [bootBase]=useState(()=>readSyncBase(userId))
  const ancestor = useRef<AccountSnapshot|null>(!boot.pending&&boot.revision ? boot.snapshot : bootBase?.revision===boot.revision ? bootBase.snapshot : null)
  const mounted = useRef(false), busy = useRef(false), conflict = useRef(false), playerOpen = useRef(false)
  const syncRequest = useRef<() => void>(()=>{})
  const notifyChanged = useCallback(() => setAvatarVersion(v=>v+1), [])
  const retry = useCallback(() => { syncRequest.current() }, [])
  const setPlayerOpen = useCallback((open:boolean) => { playerOpen.current=open; if(!open)syncRequest.current() }, [])
  const snapshot: AccountSnapshot = useMemo(()=>({schema:1,state,imported,daily,
    learning:{schedule,attempts,history,active,notes,flashcards,settings},
    avatar:localStorage.getItem(fieldKey(userId,'avatar'))==='female'?'female':localStorage.getItem(fieldKey(userId,'avatar'))==='male'?'male':null,
  }),[state,imported,daily,schedule,attempts,history,active,notes,flashcards,settings,userId,avatarVersion])
  const serialized=JSON.stringify(snapshot), latest=useRef(serialized)
  latest.current=serialized
  useLayoutEffect(()=>{
    mounted.current=true
    if(!boot.pending&&boot.revision)writeSyncBase(userId,boot.revision,boot.snapshot)
    return ()=>{mounted.current=false}
  },[userId,boot])
  useLayoutEffect(()=>{if(serialized!==saved.current)setPending(userId,true)},[serialized,userId])

  useEffect(()=>{
    if(!supabase)return
    const client=supabase
    let alive=true, timer:number|undefined, queued=false
    let controller:AbortController|undefined
    const valid=()=>alive&&mounted.current
    function enqueue(ms=0){
      if(!valid())return
      if(timer!==undefined)window.clearTimeout(timer)
      timer=window.setTimeout(()=>{timer=undefined;void run()},ms)
    }
    function acknowledge(body:string,rev:number){
      revision.current=rev;ancestor.current=parse(body);saved.current=body
      writeSyncBase(userId,rev,ancestor.current)
      const clean=same(parse(latest.current),ancestor.current)
      if(clean)saved.current=latest.current
      setPending(userId,!clean);setStatus(clean?'saved':'pending');setLastError('')
    }
    function apply(body:AccountSnapshot){
      // Run only outside an active player/draft. Keep React providers and their
      // namespaced browser cache in lockstep; don't reload an ongoing exam.
      localStorage.setItem(fieldKey(userId,'avatar'),body.avatar??'')
      flushSync(()=>{applyStore(body);applyLearning(body.learning);setAvatarVersion(v=>v+1);setCloudVersion(v=>v+1)})
      if(!same(parse(latest.current),body))throw new Error('Could not apply the cloud state safely.')
    }
    function holdConflict(){
      conflict.current=true;setPending(userId,true);setStatus('conflict')
      setLastError('Some unsynchronized changes cannot safely be ordered or combined. Neither version has been overwritten.')
    }
    async function run(){
      if(!valid())return
      if(!navigator.onLine){setConnection('offline');setStatus('offline');return}
      if(busy.current){queued=true;return}
      if(conflict.current){setConnection('online');return}
      busy.current=true
      controller=new AbortController()
      const timeout=window.setTimeout(()=>controller?.abort(),15000)
      try{
        // Probe the current account row. A browser can report online even when
        // the internet (or Supabase) is unreachable.
        const meta=await client.from('user_qbank_state').select('revision').eq('user_id',userId).abortSignal(controller.signal).maybeSingle()
        if(!valid())return
        if(meta.error)throw meta.error
        const remoteRev=Number(meta.data?.revision??0)
        if(!Number.isSafeInteger(remoteRev)||remoteRev<revision.current)throw new Error('Cloud revision is unavailable.')
        if(remoteRev!==revision.current){
          const fetched=await client.from('user_qbank_state').select('snapshot,revision').eq('user_id',userId).abortSignal(controller.signal).maybeSingle()
          if(!valid())return
          if(fetched.error||!fetched.data)throw fetched.error??new Error('Cloud state not found')
          const cloud=decodeCloudSnapshot(fetched.data.snapshot),rev=Number(fetched.data.revision),local=parse(latest.current)
          if(!Number.isSafeInteger(rev)||rev<=revision.current)throw new Error('Cloud revision changed during refresh')
          if(same(local,cloud)){acknowledge(latest.current,rev)}
          else if(openDraft()){
            // Never replace a loaded player's private answer state mid-exam.
            // Reconcile when the student finishes or saves and exits.
            setConnection('online');setStatus('pending');return
          }else{
            const clean=!!saved.current&&same(local,parse(saved.current))
            const merged=clean?cloud:ancestor.current?mergeCloudSnapshots(ancestor.current,local,cloud):null
            if(!merged){if(playerOpen.current){setStatus('pending');setConnection('online');return}holdConflict();setConnection('online');return}
            // Normalize optional undefined fields before applying JSON snapshots.
            const normalized=parse(JSON.stringify(merged))
            if(playerOpen.current && (!same(normalized.learning.active,local.learning.active)||!same(normalized.imported,local.imported))){
              setConnection('online');setStatus('pending');return
            }
            try{apply(normalized)}catch{holdConflict();setConnection('online');return}
            acknowledge(JSON.stringify(cloud),rev)
          }
        }
        if(!navigator.onLine){setConnection('offline');setStatus('offline');return}
        setConnection('online')
        const body=latest.current
        if(saved.current&&same(parse(body),parse(saved.current))){saved.current=body;setPending(userId,false);setStatus('saved');return}
        setPending(userId,true);setStatus('saving')
        const encoded=encodeCloudSnapshot(parse(body)), rev=revision.current
        const query=rev===0?client.from('user_qbank_state').insert({user_id:userId,snapshot:encoded,revision:1}).select('revision'):
          client.from('user_qbank_state').update({snapshot:encoded,revision:rev+1,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('revision',rev).select('revision')
        const {data,error}=await query.abortSignal(controller.signal).maybeSingle()
        if(!valid())return
        if(error&&error.code!=='23505')throw error
        if(error||!data){setStatus('pending');queued=true;return}
        if(Number(data.revision)!==rev+1)throw new Error('Unexpected cloud revision')
        acknowledge(body,rev+1)
        if(latest.current!==saved.current)queued=true
      }catch{
        if(valid()){setConnection('offline');setStatus('offline');setLastError('Could not reach your secure cloud account. Retrying automatically.')}
      }finally{
        window.clearTimeout(timeout);controller=undefined;busy.current=false
        if(valid()&&queued){queued=false;enqueue(500)}
      }
    }
    function foreground(){if(document.visibilityState==='hidden')return;if(!navigator.onLine){offline();return}setConnection('checking');enqueue()}
    function offline(){controller?.abort();setConnection('offline');setStatus('offline')}
    function reconnect(){if(!navigator.onLine){offline();return}setConnection('checking');enqueue()}
    syncRequest.current=()=>enqueue()
    const interval=window.setInterval(()=>{if(document.visibilityState!=='hidden')enqueue()},10000)
    window.addEventListener('online',reconnect);window.addEventListener('offline',offline);window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground)
    enqueue(0)
    return ()=>{alive=false;controller?.abort();if(timer!==undefined)window.clearTimeout(timer);window.clearInterval(interval);window.removeEventListener('online',reconnect);window.removeEventListener('offline',offline);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground);syncRequest.current=()=>{}}
  },[userId,applyStore,applyLearning])

  // Coalesce rapid answer changes but don't wait for another user interaction
  // after a request fails. The interval and connectivity events retry.
  useEffect(()=>{if(serialized===saved.current||conflict.current)return;const t=window.setTimeout(()=>syncRequest.current(),600);return()=>window.clearTimeout(t)},[serialized])

  async function resolveConflict(choice:'cloud'|'device'){
    if(!supabase||busy.current||!mounted.current||!navigator.onLine)return
    if(!window.confirm(choice==='cloud'?'Replace unsynchronized changes on this device with the cloud version?':'Replace the newer cloud version with this device’s progress?'))return
    busy.current=true
    try{
      const {data,error}=await supabase.from('user_qbank_state').select('snapshot,revision').eq('user_id',userId).maybeSingle()
      if(!mounted.current)return
      if(error||!data)throw error??new Error('Cloud state unavailable')
      const cloud=decodeCloudSnapshot(data.snapshot),rev=Number(data.revision)
      if(choice==='cloud'){saveSnapshot(userId,cloud);writeSyncBase(userId,rev,cloud);setPending(userId,false);window.location.reload();return}
      // An explicit keep-device decision still uses the current server revision.
      revision.current=rev;ancestor.current=cloud;saved.current=JSON.stringify(cloud);writeSyncBase(userId,rev,cloud);conflict.current=false;setStatus('pending');setLastError('')
    }catch{setConnection('offline');setStatus('offline')}
    finally{busy.current=false;syncRequest.current()}
  }
  const visibleStatus=status==='saved'&&serialized!==saved.current?'pending':status
  const value=useMemo(()=>({status:visibleStatus,connection,lastError,retry,notifyChanged,setPlayerOpen,cloudVersion}),[visibleStatus,connection,lastError,retry,notifyChanged,setPlayerOpen,cloudVersion])
  return <Context.Provider value={value}>
    {children}
    {status==='conflict'&&<aside role="alert" className="fixed bottom-24 right-4 z-[80] w-[min(410px,calc(100vw-32px))] rounded-2xl border border-bad/30 bg-surface p-5 text-ink shadow-2xl md:bottom-5"><p className="flex items-center gap-2 text-[13px] font-bold"><ShieldAlert size={18} className="text-bad"/> Two devices have different progress</p><p className="mt-2 text-xs leading-6 text-muted">{lastError} Choose only if you are sure.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>progressExport(userId)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Download existing progress export</button><button onClick={()=>void resolveConflict('cloud')} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Use cloud</button><button onClick={()=>void resolveConflict('device')} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Keep device</button></div></aside>}
  </Context.Provider>
}
export function CloudSyncIndicator(){
  const {status,connection,retry}=useCloudSync()
  return <button onClick={retry} title="Cloud progress synchronizes automatically" className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-2 text-[10px] font-semibold text-muted shadow-sm sm:inline-flex" aria-label={`Cloud progress: ${status}`}>
    {connection==='offline'||status==='conflict'?<CloudOff size={14} className="text-bad"/>:<Cloud size={14} className={status==='saved'?'text-good':'text-accent'}/>} {connection==='offline'?'Offline — retry pending':status==='saved'?'Saved to cloud':status==='saving'?'Syncing…':status==='pending'?'Saving soon…':status==='conflict'?'Sync conflict':'Checking connection…'}
  </button>
}
