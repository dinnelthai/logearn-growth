import {buildCohorts,retainedUsers,periodComplete,midnight} from '../analytics/cohorts.js'
import {cohortCoverage,behaviorCoverage,periodCoverage} from '../analytics/coverage.js'
import {groupDailyRetention} from '../analytics/retentionCurveModel.js'
import {createRetentionAggPage} from './retentionAgg.js'
const DAY=86400000
export function createRetentionPage(ctx){
 let cohorts=[],latest=null,ranges=null
 return createRetentionAggPage({...ctx,
  fetchRetention:async body=>{
   const asOf=ctx.dataStore?.meta.asOf??ctx.asof,users=ctx.getUsers(),coverage=ctx.getCoverage?.()||{},initialRange=behaviorCoverage(body.initial,coverage),returnRange=behaviorCoverage(body.returning,coverage);ranges={initialRange,returnRange}
   cohorts=buildCohorts(users,{startAt:body.start,endAt:body.end,asOf,initialEvent:body.initial,returningEvent:body.returning,sourceFilter:body.source}).filter(co=>co.users.length)
   const daily=cohorts.map(co=>({cohort_date:new Date(co.start+25200000).toISOString().slice(0,10),cohort_start:co.start,cohort_size:co.users.length,data_available:periodCoverage(initialRange,co.start,co.start+DAY)==='complete',periods:Array.from({length:body.maxDailyPeriods},(_,i)=>{const p=i+1,complete=periodComplete(co,p),available=cohortCoverage(co,p,returnRange,false,initialRange),continuousAvailable=cohortCoverage(co,p,returnRange,true,initialRange);return {period:p,complete,data_available:available,continuous_data_available:continuousAvailable,retained_users:complete&&available?retainedUsers(co,p).length:null,continuous_retained_users:complete&&continuousAvailable?retainedUsers(co,p,true).length:null}})}))
   latest={...body,asOf};return {daily,as_of:asOf,curve_groups:groupDailyRetention(daily,{start:body.start,end:body.end,asOf,maxPeriods:body.maxDailyPeriods}),coverage_note:'首次为已观测首次；已知覆盖不足的观察日不出点。数据只覆盖当前已加载历史。'}
  },
  openRetentionList:({group,period,subset,title,description,continuous})=>{
   const selected=cohorts.filter(co=>co.start>=midnight(group.enrollment_start)&&co.start<group.enrollment_end),rows=[]
   for(const co of selected){const covered=period===0?periodCoverage(ranges.initialRange,co.start,co.start+DAY)==='complete':cohortCoverage(co,period,ranges.returnRange,continuous,ranges.initialRange),complete=periodComplete(co,period)&&covered,retained=new Set((period===0?co.users:retainedUsers(co,period,continuous)).map(u=>u.id)),ids=subset==='cohort'?co.users:subset==='pending'?!complete?co.users:[]:complete?co.users.filter(u=>subset==='returned'?retained.has(u.id):!retained.has(u.id)):[];rows.push(...ids)}
   ctx.drill(title,rows.map(u=>({u,displaySource:u.source})),description+' · 数据截至 '+new Date(latest.asOf).toISOString())
  },
 })
}
