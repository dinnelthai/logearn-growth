import {periodCoverage} from './coverage.js'
import { normalizeLanguage } from './language.js'
import { classifyUser } from './segmentation.js'
import { midnight, firstEvent } from './cohorts.js'
const DAY=86400000
export const DIMENSIONS={language:'用户语言',source:'首次来源',telegram:'Telegram绑定',email:'邮箱绑定',entry:'首次分析入口',segment:'主要分群'}
export const ENTRY_LABELS={callouts:'喊单',signals:'信号榜单',popular:'热门',fomo:'FOMO热门',unknown:'入口未知/其他'}
export const SEGMENTS=['未激活','新激活','分析型','策略型','高频核心','流失风险','已流失','回流']
const flag=v=>v===true?'bound':v===false?'unbound':'unknown'
const ts=value=>typeof value==='number'?value:Date.parse(value)
export function firstAnalysis(user,asOf) {return firstEvent(user,'chip',asOf)}
export function entryFor(user,asOf) {
 const first=firstAnalysis(user,asOf)
 if(!first)return 'unknown'
 if(ENTRY_LABELS[user.first_analysis_entry_module]&&user.first_analysis_entry_module!=='unknown')return user.first_analysis_entry_module
 if(ENTRY_LABELS[first.entry_module]&&first.entry_module!=='unknown')return first.entry_module
 const detail=first.token_visit_id?user.events.filter(e=>e.token_visit_id===first.token_visit_id&&e.t<=first.t&&ENTRY_LABELS[e.entry_module]&&e.entry_module!=='unknown').sort((a,b)=>b.t-a.t)[0]:null
 return detail?.entry_module??'unknown'
}
export function dimensionValue(user,dimension,asOf) {
 if(dimension==='language')return normalizeLanguage(user.preferred_language)??'unknown'
 if(dimension==='source')return user.source||'未知'
 if(dimension==='telegram')return flag(user.telegram_bound)
 if(dimension==='email')return flag(user.email_bound)
 if(dimension==='entry')return entryFor(user,asOf)
 return classifyUser(user,asOf)
}
export function groupLabel(dimension,key) {
 if(dimension==='language')return {zh:'中文用户',en:'英文用户',unknown:'语言未知/其他'}[key]??key
 if(['telegram','email'].includes(dimension))return {bound:'已绑定',unbound:'未绑定',unknown:'状态未知'}[key]??key
 if(dimension==='entry')return ENTRY_LABELS[key]??key
 return key
}
export function comparisonPool(users,{asOf,endAt,filters={}}) {
 return users.filter(u=>{
  const created=ts(u.created_at),first=u.events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).reduce((n,e)=>Math.min(n,e.t),Infinity)
  if(Number.isFinite(created)?created>=endAt:first!==Infinity&&first>=endAt)return false
  return Object.entries(filters).every(([dimension,value])=>!value||value==='all'||dimensionValue(u,dimension,asOf)===value)
 })
}
export function computeComparison(users,{startAt,endAt,asOf,dimension='language',filters={},trades=null,referrals=null,cohortDay=null,coverage}) {
 const pool=comparisonPool(users,{asOf,endAt,filters}),groups=new Map(),has=(u,type)=>u.events.some(e=>e.type===type&&e.t>=startAt&&e.t<endAt&&e.t<=asOf)
 for(const u of pool){const key=dimensionValue(u,dimension,asOf);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u)}
 const transactionIds=new Set((trades??[]).filter(t=>t.status==='confirmed'&&Number.isFinite(t.confirmed_at)&&t.confirmed_at>=startAt&&t.confirmed_at<endAt&&t.confirmed_at<=asOf&&t.volume_usd>0).map(t=>t.user_id))
 const inviterIds=new Set((referrals??[]).filter(r=>{const t=ts(r.bound_at);return t>=startAt&&t<endAt&&t<=asOf&&r.inviter_user_id!==r.invitee_user_id}).map(r=>'user:'+r.inviter_user_id))
 const cohortDays=[...new Set(pool.map(u=>firstAnalysis(u,asOf)).filter(e=>e&&e.t>=startAt&&e.t<endAt).map(e=>midnight(e.t)))].sort((a,b)=>b-a)
 const retentionAllowed=['language','source','entry'].includes(dimension)&&!Object.keys(filters).some(k=>['segment','telegram','email'].includes(k)&&filters[k]&&filters[k]!=='all')
 const rows=[...groups].map(([key,people])=>{
  const analyzed=people.filter(u=>has(u,'chip')),fresh=analyzed.filter(u=>firstAnalysis(u,asOf)?.t>=startAt),ai=people.filter(u=>has(u,'ai')),core=people.filter(u=>classifyUser(u,asOf)==='高频核心'),traders=trades===null?null:people.filter(u=>transactionIds.has(u.id)),inviters=referrals===null?null:people.filter(u=>inviterIds.has(u.id))
  const cohort=people.filter(u=>{const first=firstAnalysis(u,asOf);return first&&first.t>=startAt&&first.t<endAt&&(cohortDay===null||midnight(first.t)===cohortDay)})
  const retention=Array.from({length:7},(_,i)=>{const d=i+1,eligible=cohort.filter(u=>midnight(firstAnalysis(u,asOf).t)+(d+1)*DAY<=asOf&&(coverage===undefined||(periodCoverage(coverage.events,midnight(firstAnalysis(u,asOf).t),midnight(firstAnalysis(u,asOf).t)+DAY)==='complete'&&periodCoverage(coverage.events,midnight(firstAnalysis(u,asOf).t)+d*DAY,midnight(firstAnalysis(u,asOf).t)+(d+1)*DAY)==='complete'))),retained=eligible.filter(u=>{const begin=midnight(firstAnalysis(u,asOf).t)+d*DAY;return u.events.some(e=>e.type==='chip'&&e.t>=begin&&e.t<begin+DAY&&e.t<=asOf)});return {day:d,eligible,retained,pending:cohort.length-eligible.length,rate:eligible.length?retained.length/eligible.length:null}})
  return {key,label:groupLabel(dimension,key),people,analyzed,fresh,ai,core,traders,inviters,cohort,retention}
 }).sort((a,b)=>b.people.length-a.people.length||a.key.localeCompare(b.key))
 return {pool,rows,cohortDays,retentionAllowed}
}
