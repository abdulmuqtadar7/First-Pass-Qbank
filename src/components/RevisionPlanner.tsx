import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Settings2, Coffee } from 'lucide-react'
import { useStore } from '../lib/store'
import { useLearning } from '../lib/learning'
import { analyzeConcepts, adaptiveQueue } from '../lib/adaptive'
import { atDate, dailyTarget, localKey, monday, preferences, shift, studyDaysUntil } from '../lib/revisionPlanner'
import { btnGhost, btnPrimary, card, iconBtn } from '../lib/ui'
import type { AdaptiveMode, SessionMode, SessionSource } from '../types/qbank'

const WEEK=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
type Props={onStart:(ids:string[],title:string,mode?:SessionMode,source?:SessionSource)=>void; onFlashcards?:()=>void; onNotes?:()=>void; onExam?:()=>void; onBrowse?:()=>void}
export default function RevisionPlanner({onStart,onFlashcards,onNotes,onExam,onBrowse}:Props){
  const {questions,state,daily}=useStore()
  const {settings,setSettings,schedule,attempts,flashcards,notes,history}=useLearning()
  const [now,setNow]=useState(Date.now)
  const [expanded,setExpanded]=useState(false)
  const [full,setFull]=useState(false)
  const [selected,setSelected]=useState(()=>localKey(new Date()))
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1,12))
  const [edit,setEdit]=useState(false)
  const [draft,setDraft]=useState(()=>({...preferences(settings),goal:settings.dailyGoal,exam:settings.examDate}))
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer)},[])
  const today=new Date(now), todayKey=localKey(today), p=preferences(settings), chosen=atDate(selected)
  const concepts=useMemo(()=>analyzeConcepts(questions,state.progress,schedule,attempts,now),[questions,state.progress,schedule,attempts,now])
  const remainingDays=studyDaysUntil(today,settings.examDate,p.days)
  const pace=remainingDays&&remainingDays>0?Math.ceil(concepts.filter(c=>c.status==='untouched').length/remainingDays):0
  const todayTarget=dailyTarget(today,settings.dailyGoal,p,daily,pace)
  const current=selected===todayKey, past=selected<todayKey, future=selected>todayKey
  const planned=dailyTarget(chosen,settings.dailyGoal,future?{...p,carry:false}:p,daily,current?pace:0)
  const answered=daily[selected]??0
  const week=monday(today)
  const start=monday(chosen), end=shift(start,6)
  const mockDay=[...Array(7)].map((_,i)=>shift(start,i)).filter(d=>p.days.includes(d.getDay())).at(-1)
  const mockDone=history.some(h=>!!h.mock&&localKey(new Date(h.completedAt))>=localKey(start)&&localKey(new Date(h.completedAt))<=localKey(end))
  const log=settings.plannerActivity?.[selected]
  const cardIds=new Set([...(log?.cards??[]),...flashcards.filter(c=>c.lastReviewed&&localKey(new Date(c.lastReviewed))===selected).map(c=>c.id)])
  const notesRead=new Set(log?.notes??[]).size
  const noteTarget=Math.min(3,Object.keys(notes).length)
  const dueCards=flashcards.filter(c=>c.dueAt<=now)
  const dueConcepts=concepts.filter(c=>c.due)
  const weak=concepts.filter(c=>c.status==='weak')
  const futureStart=new Date(chosen);futureStart.setHours(0,0,0,0)
  const futureEnd=shift(futureStart,1)
  const futureCards=flashcards.filter(c=>c.dueAt>=futureStart.getTime()&&c.dueAt<futureEnd.getTime()).length
  const futureConcepts=concepts.filter(c=>c.dueAt!==null&&c.dueAt>=futureStart.getTime()&&c.dueAt<futureEnd.getTime()).length
  const actualConcepts=useMemo(()=>{const ids=new Set(attempts.filter(a=>a.mode!=='review'&&localKey(new Date(a.at))===selected).map(a=>a.id));return concepts.filter(c=>c.questions.some(q=>ids.has(q.id))).length},[attempts,selected,concepts])
  function launch(mode:AdaptiveMode,size:number){const n=Math.min(40,Math.max(0,size));const ids=adaptiveQueue(concepts,state.progress,mode,n);if(ids.length)onStart(ids,mode==='daily'?'Calendar daily practice':mode==='review'?'Calendar spaced review':'Calendar weak concept practice','tutor',{kind:'adaptive',mode,size:n});else onBrowse?.()}
  function pick(d:Date){setSelected(localKey(d));setExpanded(true)}
  function showToday(){setSelected(todayKey);setMonth(new Date(today.getFullYear(),today.getMonth(),1,12))}
  function status(d:Date){const key=localKey(d),count=daily[key]??0;const target=dailyTarget(d,settings.dailyGoal,p,daily,key===todayKey?pace:0).target;if(!target)return {name:'Rest day',color:'bg-muted/40'};if(key>todayKey)return {name:'Scheduled',color:'bg-accent/60'};if(key<todayKey&&(!p.start||key<p.start))return {name:count?'Activity recorded':'No recorded activity',color:count?'bg-good':'bg-muted/20'};return count>=target?{name:'Question goal reached',color:'bg-good'}:count?{name:'Partial question goal',color:'bg-amber-500'}:key<todayKey?{name:'Missed question goal',color:'bg-bad'}:{name:'Scheduled',color:'bg-accent/60'}}
  function dateButton(d:Date,weekday=false){const key=localKey(d),s=status(d),active=selected===key;return <button key={key} type="button" aria-label={`${key}, ${s.name}`} aria-pressed={active} onClick={()=>pick(d)} className={`min-w-0 rounded-lg py-2 text-center text-xs font-semibold ${active?'bg-accent text-white':'bg-sunken hover:bg-accent/10'}`}>{weekday&&<span className="block text-[10px] opacity-80">{WEEK[(d.getDay()+6)%7]}</span>}<span className="block tabular-nums">{d.getDate()}</span><span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${active?'bg-white':s.color}`}/></button>}
  const offset=(month.getDay()+6)%7, length=new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
  const row=(title:string,sub:string,action?:()=>void,button='Open')=><div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2"><div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-muted">{sub}</p></div>{action&&<button type="button" className={`${btnGhost} shrink-0 !px-3 !py-2 !text-xs`} onClick={action}>{button}</button>}</div>
  return <section className={`${card} space-y-3 p-4 sm:p-5`} aria-label="Revision calendar">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><CalendarDays size={20} className="shrink-0 text-accent"/><div><h2 className="text-lg font-bold">Revision calendar</h2><p className="text-xs text-muted">{todayTarget.target?`${daily[todayKey]??0} / ${todayTarget.target} questions today`:'Today is a rest day'} · {dueCards.length} cards due</p></div></div><button className={btnGhost} aria-expanded={expanded} onClick={()=>{setExpanded(v=>!v);if(!expanded)showToday()}}>{expanded?'Hide calendar':'View calendar'}</button></div>
    {expanded&&<><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1"><button className={btnGhost} aria-pressed={!full} onClick={()=>{setFull(false);showToday()}}>Week</button><button className={btnGhost} aria-pressed={full} onClick={()=>{setFull(true);setMonth(new Date(chosen.getFullYear(),chosen.getMonth(),1,12))}}>Month</button></div><div className="flex items-center gap-1"><button className={btnGhost} onClick={showToday}>Today</button><button className={iconBtn} aria-label="Calendar settings" aria-expanded={edit} onClick={()=>{setDraft({...preferences(settings),goal:settings.dailyGoal,exam:settings.examDate});setEdit(v=>!v)}}><Settings2 size={19}/></button></div></div>
    {full?<><div className="flex items-center justify-between"><button className={iconBtn} aria-label="Previous month" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1,12))}><ChevronLeft size={20}/></button><h3 className="font-semibold" aria-live="polite">{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h3><button className={iconBtn} aria-label="Next month" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1,12))}><ChevronRight size={20}/></button></div><div className="grid grid-cols-7 gap-1">{WEEK.map(d=><span key={d} className="text-center text-[10px] text-muted">{d}</span>)}{Array.from({length:offset},(_,i)=><span key={`empty-${i}`}/>)}{Array.from({length:length},(_,i)=>dateButton(new Date(month.getFullYear(),month.getMonth(),i+1,12)))}</div></>:<div className="grid grid-cols-7 gap-1">{Array.from({length:7},(_,i)=>dateButton(shift(week,i),true))}</div>}
    <p className="text-[11px] text-muted">Dots show question-goal status: green reached, amber partial, red missed, purple planned, gray rest/no activity. Past goals are estimates using current preferences.</p>
    {edit&&<form className="space-y-3 rounded-xl border border-line p-3" onSubmit={e=>{e.preventDefault();if(!draft.days.length)return;setSettings({dailyGoal:draft.goal,examDate:draft.exam,planner:{days:draft.days,carry:draft.carry,weeklyMock:draft.weeklyMock,start:draft.start||todayKey}});setEdit(false)}}><h3 className="font-semibold">Calendar preferences</h3><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted">Daily question goal<input required type="number" min={1} max={500} value={draft.goal} onChange={e=>setDraft(d=>({...d,goal:Math.max(1,Math.min(500,Math.round(Number(e.target.value)||1)))}))} className="mt-1 block w-full rounded-lg border border-line bg-surface p-2 text-ink"/></label><label className="text-xs text-muted">Target exam date<input type="date" value={draft.exam} onChange={e=>setDraft(d=>({...d,exam:e.target.value}))} className="mt-1 block w-full rounded-lg border border-line bg-surface p-2 text-ink"/></label></div><p className="text-xs text-muted">Preferred study days</p><div className="grid grid-cols-7 gap-1">{WEEK.map((d,i)=>{const day=(i+1)%7;return <button type="button" key={d} aria-label={`Study on ${d}`} aria-pressed={draft.days.includes(day)} className={`rounded-lg py-2 text-xs ${draft.days.includes(day)?'bg-accent text-white':'bg-sunken text-muted'}`} onClick={()=>setDraft(v=>({...v,days:v.days.includes(day)?v.days.filter(x=>x!==day):[...v.days,day]}))}>{d}</button>})}</div><label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.carry} onChange={e=>setDraft(d=>({...d,carry:e.target.checked}))}/>Carry missed questions to next study day (capped at one daily goal)</label><label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.weeklyMock} onChange={e=>setDraft(d=>({...d,weeklyMock:e.target.checked}))}/>Schedule a weekly mock on the last study day</label><p className="text-xs text-muted">These preferences are saved with your existing account settings.</p><button className={btnPrimary} type="submit" disabled={!draft.days.length}>Save calendar preferences</button></form>}
    <div className="space-y-2 border-t border-line pt-3"><h3 className="font-semibold">{atDate(selected).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</h3>{!planned.target?<div className="flex items-center gap-2 rounded-xl bg-sunken p-3 text-sm"><Coffee size={18} className="text-accent"/> Rest day · no mandatory tasks. {past||current?`${answered} questions recorded.`:''}</div>:<>{row(past?'Question activity':'Practice questions',`${answered} / ${planned.target} questions${planned.carry?` · ${planned.carry} carried over`:''}${current&&pace?` · exam pace ${pace} new concepts/day`:''}`,current&&answered<planned.target?()=>launch('daily',planned.target-answered):undefined,'Start')}
    {current?<>{row('Revise due concepts',`${dueConcepts.length} due now · ${weak.length} weak · ${actualConcepts} concepts practiced today`,dueConcepts.length?()=>launch('review',dueConcepts.length):weak.length?()=>launch('weak',weak.length):undefined,'Revise')}{row('Review flashcards',`${cardIds.size} distinct cards reviewed today · ${dueCards.length} due now`,onFlashcards,'Review')}{row('Read personal notes',`${notesRead} / ${noteTarget} notes marked read today`,noteTarget?onNotes:undefined,'Read')}</>:past?<>{row('Recorded concept activity',`${actualConcepts} distinct concepts practiced (retained attempt history)`)}{row('Recorded revision activity',`${cardIds.size} cards reviewed · ${notesRead} notes marked read`)}</>:<>{row('Projected reviews',`${futureConcepts} concepts · ${futureCards} flashcards currently scheduled for this day`)}<p className="text-xs text-muted">Future tasks update as you study. Past due counts cannot be reconstructed.</p></>}
    {p.weeklyMock&&mockDay&&localKey(mockDay)===selected&&row('Weekly mock examination',mockDone?'Completed this week':'Scheduled on the last study day',current&&!mockDone?onExam:undefined,'Open exam')}
    </>}{current&&remainingDays!==null&&<p className="text-xs text-muted">{remainingDays} remaining preferred study days through exam date. Coverage pace is an estimate, not an exam-readiness prediction.</p>}<p className="text-[11px] text-muted">Question activity counts recorded answers; flashcards count actual graded reviews; notes count explicit Mark read today actions. Historical activity is limited by retained records.</p></div></>}
  </section>
}
