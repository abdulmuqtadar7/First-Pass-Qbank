import type { Progress, Question } from '../types/qbank'
import { analyzeConcepts, masteryCounts } from './adaptive'
import { dateKey } from './stats'

type Event = { id: string; at: number; correct: boolean; seconds: number; mode: string }
type History = { id: string; completedAt: number; mode: string; ids: string[]; correct: number; answered: number }
type Schedule = Parameters<typeof analyzeConcepts>[2]
export type WindowDays = 7 | 30 | 90
export const percent = (n: number, d: number): number | null => d > 0 ? Math.round(100 * n / d) : null
function valid(e: Event, now: number) {
  return (e.mode === 'tutor' || e.mode === 'exam') && Number.isFinite(e.at) && e.at > 0 && e.at <= now && typeof e.correct === 'boolean'
}
function startDay(now: number, offset: number) {
  const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()+offset); return d.getTime()
}
function aggregate(events: readonly Event[]) {
  const timed = events.filter(e => Number.isFinite(e.seconds) && e.seconds >= 0)
  const correct = events.filter(e => e.correct).length
  return { total: events.length, correct, accuracy: percent(correct, events.length), unique: new Set(events.map(e=>e.id)).size,
    timedCount: timed.length, average: timed.length ? Math.round(timed.reduce((s,e)=>s+e.seconds,0)/timed.length) : null }
}
export function performanceInsights(questions: readonly Question[], progress: Record<string, Progress>, schedule: Schedule, attempts: readonly Event[], history: readonly History[], days: WindowDays, now = Date.now()) {
  const all = attempts.filter(e => valid(e,now))
  const start = startDay(now,1-days), prevStart = startDay(now,1-days*2)
  const recent = all.filter(e=>e.at>=start), previous = all.filter(e=>e.at>=prevStart && e.at<start)
  const current = aggregate(recent), prior = aggregate(previous)
  const daily = new Map<string,{ total:number;correct:number }>()
  for (const e of all) {
    const key=dateKey(new Date(e.at)), old=daily.get(key) ?? {total:0,correct:0}
    old.total++; old.correct+=Number(e.correct); daily.set(key,old)
  }
  const day = (offset:number) => {
    const key=dateKey(new Date(startDay(now,offset))); const v=daily.get(key) ?? {total:0,correct:0}
    return {key,...v,accuracy:percent(v.correct,v.total)}
  }
  const trend = Array.from({length:days},(_,i)=>day(i+1-days))
  // Calendar-aligned heatmap: 12 columns of Monday–Sunday, future days excluded.
  const weekday = (new Date(now).getDay()+6)%7
  const heatmap = Array.from({length:84},(_,i)=> {
    const offset=i-77-weekday; return offset>0 ? null : day(offset)
  })
  const concepts=analyzeConcepts(questions,progress,schedule,all,now), counts=masteryCounts(concepts)
  const coverage=percent(concepts.length-counts.untouched,concepts.length), mastery=percent(counts.mastered,concepts.length)
  const bySystem=new Map<string,{name:string;total:number;covered:number;mastered:number;weak:number;due:number;attempts:number;correct:number}>()
  for(const c of concepts){
    const k=c.system.trim().toLowerCase(), row=bySystem.get(k)??{name:c.system,total:0,covered:0,mastered:0,weak:0,due:0,attempts:0,correct:0}
    row.total++;row.covered+=Number(c.status!=='untouched');row.mastered+=Number(c.status==='mastered');row.weak+=Number(c.status==='weak');row.due+=Number(c.due)
    for(const q of c.questions){const p=progress[q.id];if(p?.attempts>0){row.attempts+=p.attempts;row.correct+=p.correct}}
    bySystem.set(k,row)
  }
  const systems=[...bySystem.values()].map(r=>({...r,accuracy:percent(r.correct,r.attempts),coverage:percent(r.covered,r.total),mastery:percent(r.mastered,r.total)})).sort((a,b)=>a.name.localeCompare(b.name))
  const readinessEvents=all.filter(e=>e.at>=startDay(now,-29))
  const readinessAccuracy=aggregate(readinessEvents)
  const touchedKeys=new Set(concepts.filter(c=>c.status!=='untouched').flatMap(c=>c.questions.map(q=>q.id)))
  const recentKnown=readinessEvents.filter(e=>touchedKeys.has(e.id))
  const recentIds=new Set(recentKnown.map(e=>e.id))
  const recentConceptCount=concepts.filter(c=>c.questions.some(q=>recentIds.has(q.id))).length
  const readiness=coverage!==null && mastery!==null && readinessAccuracy.accuracy!==null && recentKnown.length>=30 && recentConceptCount>=10
    ? Math.round(.4*coverage+.4*mastery+.2*(aggregate(recentKnown).accuracy??0)) : null
  const exam=history.filter(h=>h.mode==='exam' && Number.isFinite(h.completedAt) && h.completedAt>=start && h.completedAt<=now && Array.isArray(h.ids) && h.ids.length>0 && Number.isFinite(h.correct) && Number.isFinite(h.answered))
  const examTotal=exam.reduce((s,h)=>s+h.ids.length,0), examCorrect=exam.reduce((s,h)=>s+Math.max(0,Math.min(h.ids.length,h.correct)),0)
  const examAnswered=exam.reduce((s,h)=>s+Math.max(0,Math.min(h.ids.length,h.answered)),0)
  const tutor=aggregate(recent.filter(e=>e.mode==='tutor')), timed=aggregate(recent.filter(e=>e.mode==='exam'))
  const weakSystem=systems.filter(s=>s.attempts>=10).sort((a,b)=>(a.accuracy??100)-(b.accuracy??100))[0]
  const recommendations:string[]=[]
  if(counts.due) recommendations.push(`Review ${counts.due} due concepts using Smart Study Plan.`)
  if(counts.weak) recommendations.push(`Revisit ${counts.weak} weak concepts before repeating mastered material.`)
  if(weakSystem && (weakSystem.accuracy??100)<70) recommendations.push(`Focus on ${weakSystem.name}: ${weakSystem.accuracy}% lifetime accuracy over ${weakSystem.attempts} attempts.`)
  if(counts.untouched) recommendations.push(`Introduce new topics: ${counts.untouched} concepts remain untouched.`)
  if(examTotal>examAnswered) recommendations.push(`Practice finishing timed blocks: ${examTotal-examAnswered} questions were unanswered in the selected period.`)
  if(!recommendations.length) recommendations.push(concepts.length?'Maintain spaced recall and vary your practice questions.':'Add questions to begin building learning insights.')
  return {current,prior,trend,heatmap,systems,counts,coverage,mastery,readiness,recentConceptCount,readinessAttempts:recentKnown.length,readinessAccuracy:aggregate(recentKnown).accuracy,
    exam:{blocks:exam.length,total:examTotal,answered:examAnswered,score:percent(examCorrect,examTotal)},tutor,timed,recommendations, activeDays:trend.filter(d=>d.total>0).length}
}
