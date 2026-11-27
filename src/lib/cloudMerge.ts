import type { AccountSnapshot } from './accountStorage'
import type { AttemptEvent, Flashcard, HistoryEntry, ActiveSession, StudyNote, ReviewItem } from './learning'
import type { Progress } from '../types/qbank'
import type { PlannerActivity } from './revisionPlanner'

// Only merge changes relative to an observed, common cloud revision. Never infer
// deletions or count increments from two snapshots without their ancestor.
const fail = (): never => { throw new Error('Changes require a choice') }
export function sameSnapshotValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x,i)=>sameSnapshotValue(x,b[i]))
  const x=a as Record<string,unknown>, y=b as Record<string,unknown>
  const keys=Object.keys(x)
  return keys.length===Object.keys(y).length && keys.every(k=>Object.prototype.hasOwnProperty.call(y,k)&&sameSnapshotValue(x[k],y[k]))
}
const same = sameSnapshotValue
function choose<T>(base:T, local:T, remote:T, rejectDouble=false): T {
  if(same(local,base)) return remote
  if(same(remote,base)) return local
  if(same(local,remote) && (!rejectDouble || local===undefined)) return local
  return fail()
}
function mapMerge<T>(base:Record<string,T>, local:Record<string,T>, remote:Record<string,T>, rejectDouble=false, resolve?: (base:T|undefined, local:T|undefined, remote:T|undefined)=>T|undefined):Record<string,T> {
  const out: [string,T][]=[]
  const get=(o:Record<string,T>,k:string):T|undefined=>Object.prototype.hasOwnProperty.call(o,k)?o[k]:undefined
  for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
    const a=get(base,k), b=get(local,k), c=get(remote,k)
    const v=resolve && !same(a,b) && !same(a,c) && (!same(b,c) || rejectDouble) ? resolve(a,b,c) : choose(a,b,c,rejectDouble)
    if(v!==undefined)out.push([k,v])
  }
  return Object.fromEntries(out)
}
function members(base:string[],local:string[],remote:string[],appendOnly=false):string[]{
  const b=new Set(base),l=new Set(local),r=new Set(remote)
  if(appendOnly && base.some(x=>!l.has(x)||!r.has(x)))fail()
  return [...new Set([...base,...local,...remote])].filter(k=>choose(b.has(k),l.has(k),r.has(k)))
}
function indexed<T extends {id:string}>(items:T[]):Record<string,T>{
  if(new Set(items.map(i=>i.id)).size!==items.length)fail()
  return Object.fromEntries(items.map(i=>[i.id,i]))
}
function newAttempts(base:AttemptEvent[],next:AttemptEvent[]):AttemptEvent[]{
  if(next.length<base.length||!base.every((v,i)=>same(v,next[i])))fail()
  return next.slice(base.length)
}
function newHistory(base:HistoryEntry[],next:HistoryEntry[]):HistoryEntry[]{
  const added=next.length-base.length
  if(added<0||!base.every((v,i)=>same(v,next[i+added])))fail()
  return next.slice(0,added)
}
const eventKey=(e:AttemptEvent)=>e.eventId ?? JSON.stringify([e.id,e.at,e.correct,e.seconds,e.mode])
function unique<T>(values:T[],key:(v:T)=>string){ if(new Set(values.map(key)).size!==values.length)fail() }
function integer(n:number){if(!Number.isSafeInteger(n)||n<0)fail();return n}
function dailyMerge(base:Record<string,number>,local:Record<string,number>,remote:Record<string,number>){
  return Object.fromEntries([...new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])].map(k=>{
    const b=integer(base[k]??0),l=integer(local[k]??0),r=integer(remote[k]??0)
    if(l<b||r<b)fail()
    return [k,integer(l+r-b)]
  }))
}
// Attempt events do not yet have globally unique event IDs. Only append-only,
// non-overlapping events with matching counter deltas can be combined.
function checkCounters(base:AccountSnapshot, next:AccountSnapshot, events:AttemptEvent[]){
  const expected=new Map<string,{correct:number;wrong:number}>()
  for(const e of events){const p=expected.get(e.id)??{correct:0,wrong:0};if(e.correct)p.correct++;else p.wrong++;expected.set(e.id,p)}
  for(const id of new Set([...Object.keys(base.state.progress),...Object.keys(next.state.progress),...expected.keys()])){
    const b=base.state.progress[id],n=next.state.progress[id],e=expected.get(id)??{correct:0,wrong:0}
    if(b&&!n)fail() // reset or removal is never inferred
    const c=integer(n?.correct??0)-integer(b?.correct??0), w=integer(n?.wrong??0)-integer(b?.wrong??0), a=integer(n?.attempts??0)-integer(b?.attempts??0)
    if(c!==e.correct||w!==e.wrong||a!==c+w)fail()
  }
  let total=0
  for(const k of new Set([...Object.keys(base.daily),...Object.keys(next.daily)])){
    const b=integer(base.daily[k]??0), n=integer(next.daily[k]??0);if(n<b)fail();total+=n-b
  }
  if(total!==events.length)fail()
}
function plannerActivity(b:Record<string,PlannerActivity>,l:Record<string,PlannerActivity>,r:Record<string,PlannerActivity>){
  const empty={cards:[],notes:[]} as PlannerActivity
  const entries=Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].map(k=>{
    const a=b[k]??empty,x=l[k]??empty,y=r[k]??empty
    const cards=members(a.cards,x.cards,y.cards,true),notes=members(a.notes,x.notes,y.notes,true)
    if(cards.length>500||notes.length>500)fail()
    return [k,{cards,notes}]
  }))
  if(Object.keys(entries).length>180)fail()
  return entries
}
function knownKeys(value:object,allowed:string[]){if(Object.keys(value).some(k=>!allowed.includes(k)))fail()}
function validateShape(s:AccountSnapshot){
  if(s.schema!==1)fail()
  knownKeys(s,['schema','state','imported','daily','learning','avatar'])
  knownKeys(s.state,['progress','flagged','studyDates','theme'])
  knownKeys(s.learning,['schedule','attempts','history','active','notes','flashcards','settings'])
  knownKeys(s.learning.settings,['dailyGoal','examDate','planner','plannerActivity'])
}
// New sessions have stable selection identities. Do not let a stale
// checkpoint from an older examination replace a newer intentional choice.
function activeIdentity(a:ActiveSession|null){return a?.session.syncId ?? (a ? JSON.stringify([a.session.title,a.session.mode,a.session.ids]) : null)}
function mergeActive(base:ActiveSession|null,l:ActiveSession|null,r:ActiveSession|null):ActiveSession|null{
  if(same(l,base))return r
  if(same(r,base))return l
  if(same(l,r))return l
  const bi=activeIdentity(base),li=activeIdentity(l),ri=activeIdentity(r)
  if(li===ri){
    // Two unsynchronized copies of the same session can disagree on answers;
    // a timer checkpoint is not evidence of a later intentional edit.
    if(l&&r&&same(l.answers,r.answers)&&same(l.ratings,r.ratings)&&same(l.queue,r.queue)&&same(l.mock,r.mock)&&l.position===r.position)return l.updatedAt>r.updatedAt?l:r
    return fail()
  }
  if(li===bi)return r
  if(ri===bi)return l
  if(!l||!r){
    const present=l??r
    if(present&&present.session.syncId&&present.session.selectedAt&&activeIdentity(present)!==bi)return present
    return fail()
  }
  const a=l.session.selectedAt,b=r.session.selectedAt
  if(!l.session.syncId||!r.session.syncId||!a||!b||a===b)return fail()
  return a>b?l:r
}
function latest<T>(l:T|undefined,r:T|undefined,time:(x:T)=>number):T|undefined{
  if(!l||!r)return fail() // no tombstone ordering for a true delete-versus-edit conflict
  const a=time(l),b=time(r); if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)return fail()
  return a>b?l:r
}
function mergeProgress(b:Progress|undefined,l:Progress|undefined,r:Progress|undefined):Progress{
  if(!l||!r)return fail()
  const baseline=b??{attempts:0,correct:0,wrong:0}
  const last=(l.lastAt??0)>(r.lastAt??0)?l:r
  const status=choose(b?.status,l.status,r.status)
  return {...last, status,attempts:integer(l.attempts+r.attempts-baseline.attempts),correct:integer(l.correct+r.correct-baseline.correct),wrong:integer(l.wrong+r.wrong-baseline.wrong)}
}
/** null = unresolved. No data is mutated; inputs remain intact. */
export function mergeCloudSnapshots(base:AccountSnapshot,local:AccountSnapshot,remote:AccountSnapshot):AccountSnapshot|null{
  try{
    for(const s of [base,local,remote])validateShape(s)
    // Even a saved unfinished session is a single logical record. Never merge
    // while one is present, and never treat a completed block as a new session.
    const active=mergeActive(base.learning.active,local.learning.active,remote.learning.active)
    // App owns the avatar's live UI state. Do not replace it behind its back.
    const avatar=choose(base.avatar,local.avatar,remote.avatar)

    const a=newAttempts(base.learning.attempts,local.learning.attempts),b=newAttempts(base.learning.attempts,remote.learning.attempts)
    unique([...base.learning.attempts,...a,...b],eventKey)
    checkCounters(base,local,a);checkCounters(base,remote,b)
    const attempts=[...base.learning.attempts,...[...a,...b].sort((x,y)=>x.at-y.at)]
    const history=[...newHistory(base.learning.history,local.learning.history),...newHistory(base.learning.history,remote.learning.history)].sort((x,y)=>y.completedAt-x.completedAt).concat(base.learning.history)
    unique(history,x=>x.id)
    if(attempts.length>15000||history.length>120)return null
    // Do not infer resets or review-history removal from a missing key.
    for(const k of Object.keys(base.learning.schedule))if(!Object.prototype.hasOwnProperty.call(local.learning.schedule,k)||!Object.prototype.hasOwnProperty.call(remote.learning.schedule,k))return null
    const cards=mapMerge<Flashcard>(indexed(base.learning.flashcards),indexed(local.learning.flashcards),indexed(remote.learning.flashcards),false, (b,l,r)=>{
      if(!l||!r)return fail()
      // Merge independently changed text and review fields; latest valid review wins.
      const content=(c:Flashcard|undefined)=>c&&({front:c.front,back:c.back,deck:c.deck})
      const text=choose(content(b),content(l),content(r))
      const review=(c:Flashcard|undefined)=>c&&({dueAt:c.dueAt,intervalDays:c.intervalDays,reviews:c.reviews,recallStreak:c.recallStreak,lastReviewed:c.lastReviewed})
      const br=review(b),lr=review(l),rr=review(r)
      const selected=same(lr,br)?r:same(rr,br)||same(lr,rr)?l:latest(l,r,c=>c.lastReviewed??0)
      return {...selected!,...text}
    })
    const flashcards=Object.values(cards)
    unique(flashcards.filter(c=>!!c.questionId),c=>c.questionId)
    const bs=base.learning.settings,ls=local.learning.settings,rs=remote.learning.settings
    const activity=bs.plannerActivity||ls.plannerActivity||rs.plannerActivity ? plannerActivity(bs.plannerActivity??{},ls.plannerActivity??{},rs.plannerActivity??{}) : undefined
    const planner=choose(bs.planner,ls.planner,rs.planner)
    return {schema:1,avatar,imported:choose(base.imported,local.imported,remote.imported),daily:dailyMerge(base.daily,local.daily,remote.daily),
      state:{progress:mapMerge(base.state.progress,local.state.progress,remote.state.progress,true,mergeProgress),flagged:members(base.state.flagged,local.state.flagged,remote.state.flagged),studyDates:members(base.state.studyDates,local.state.studyDates,remote.state.studyDates,true),theme:choose(base.state.theme,local.state.theme,remote.state.theme)},
      learning:{active,attempts,history,notes:mapMerge(base.learning.notes,local.learning.notes,remote.learning.notes,false,(_b,l,r)=>latest<StudyNote>(l,r,c=>c.updatedAt)),flashcards,schedule:mapMerge(base.learning.schedule,local.learning.schedule,remote.learning.schedule,false,(_b,l,r)=>latest<ReviewItem>(l,r,c=>c.lastReviewed)),settings:{dailyGoal:choose(bs.dailyGoal,ls.dailyGoal,rs.dailyGoal),examDate:choose(bs.examDate,ls.examDate,rs.examDate),...(planner?{planner}:{}),...(activity?{plannerActivity:activity}:{})}}}
  }catch{return null}
}
