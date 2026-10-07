import {computeFunnel} from './funnel.js'
const DAY=86400000
export const FUNNELS={analysis:{label:'分析漏斗',steps:['login','token','chip']},ai:{label:'AI漏斗',steps:['token','ai','chip']},token_visit:{label:'同次Token访问',steps:['token_click','token','chip'],association:'token_visit'},strategy_run:{label:'同次策略结果',steps:['ai','strategy_result','signal_view'],association:'strategy_run'}}
export function groupFunnels(groups,{startAt,endAt,asOf,preset='analysis',hours=24,association}) {
 const steps=FUNNELS[preset].steps
 return groups.map(group=>{
  const people=group.people.map(u=>({...u,events:u.events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).slice().sort((a,b)=>a.t-b.t)})),result=computeFunnel(people,{steps,startAt,endAt,asOf,conversionWindowMs:hours*3600000,association:association??FUNNELS[preset].association??'user'}),lookup=new Map(group.people.map(u=>[u.id,u]))
  return {...group,quality:result.quality,association:result.association,incomplete:result.rows.filter(r=>r.dataIncomplete).map(r=>lookup.get(r.userId)),missingStart:result.quality.missingStartUserIds.map(id=>lookup.get(id)),entered:result.total_entered,stages:steps.map((key,i)=>{const reached=result.rows.filter(r=>r.times.length>i).map(r=>lookup.get(r.userId)),lost=i===steps.length-1?[]:result.rows.filter(r=>r.times.length===i+1&&!r.pending&&!r.dataIncomplete).map(r=>lookup.get(r.userId)),pending=i===steps.length-1?[]:result.rows.filter(r=>r.times.length===i+1&&r.pending).map(r=>lookup.get(r.userId));return {key,reached,lost,pending}}),pending:result.rows.filter(r=>r.pending).map(r=>lookup.get(r.userId))}
 })
}
export function groupTrends(groups,{startAt,endAt,asOf}) {
 return groups.map(group=>({...group,days:Array.from({length:Math.ceil((endAt-startAt)/DAY)},(_,i)=>{
  const start=startAt+i*DAY,end=Math.min(start+DAY,endAt,asOf),eligible=group.people.filter(u=>{const created=typeof u.created_at==='number'?u.created_at:Date.parse(u.created_at),first=u.events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).reduce((n,e)=>Math.min(n,e.t),Infinity);return Number.isFinite(created)?created<end:first===Infinity||first<end}),active=eligible.filter(u=>u.events.some(e=>e.type==='chip'&&e.t>=start&&e.t<end&&e.t<=asOf));return {start,eligible,active,rate:eligible.length?active.length/eligible.length:null}
 })}))
}
