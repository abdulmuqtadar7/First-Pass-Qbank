import type { LearningSettings } from './learning'
export interface PlannerPreferences { days: number[]; carry: boolean; weeklyMock: boolean; start: string }
export interface PlannerActivity { cards: string[]; notes: string[] }
export const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
export const atDate = (key: string) => new Date(Number(key.slice(0,4)), Number(key.slice(5,7))-1, Number(key.slice(8,10)), 12)
export function shift(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x }
export const monday = (d: Date) => shift(d,-((d.getDay()+6)%7))
export function preferences(settings: LearningSettings): PlannerPreferences {
  const p = settings.planner
  const days = Array.isArray(p?.days) ? [...new Set(p.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6))] : [1,2,3,4,5,6]
  return {days:days.length?days:[1,2,3,4,5,6],carry:p?.carry??true,weeklyMock:p?.weeklyMock??false,start:p?.start??''}
}
export function studyDaysUntil(start: Date, end: string, days: number[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end<localKey(start)) return null
  const last=atDate(end); if(localKey(last)!==end) return null
  // Count full weeks arithmetically, including daylight-saving changes.
  const serial=(d:Date)=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000
  const span=serial(last)-serial(start)+1
  let count=Math.floor(span/7)*days.length
  for(let i=0;i<span%7;i++) if(days.includes(shift(start,i).getDay())) count++
  return count
}
export function dailyTarget(date: Date, goal: number, p: PlannerPreferences, daily: Record<string,number>, pace=0) {
  if(!p.days.includes(date.getDay())) return {target:0,carry:0}
  const base=Math.max(1,Math.min(500,Math.round(goal)||20))
  let carry=0
  if(p.carry&&p.start) {
    for(let i=1;i<=7;i++) {const prev=shift(date,-i); if(!p.days.includes(prev.getDay()))continue; const key=localKey(prev); if(key>=p.start)carry=Math.min(base,Math.max(0,base-(daily[key]??0))); break}
  }
  return {target:Math.min(500,Math.max(base,pace)+carry),carry}
}
export function recordPlannerActivity(settings: LearningSettings, type:'cards'|'notes', id:string, now:number): LearningSettings {
  const key=localKey(new Date(now)); const all=settings.plannerActivity??{}; const entry=all[key]??{cards:[],notes:[]}
  if(entry[type].includes(id)||entry[type].length>=500)return settings
  const next={...all,[key]:{...entry,[type]:[...entry[type],id]}}
  const keys=Object.keys(next).sort().slice(-180)
  return {...settings,plannerActivity:Object.fromEntries(keys.map(k=>[k,next[k]]))}
}
