'use strict';
const {randomUUID}=require('node:crypto');
const {DAY}=require('./period');
const unknown=reason=>({status:'unknown',reason,observed:null,delta:null,met:null});
async function refreshWeeklyCore({store,owner,goal,now=Date.now(),status,weekly}){
 if(goal.metric_id!=='weekly_core'||goal.definition_version!=='1'||goal.unit!=='users'||goal.aggregation!=='rolling-distinct'||JSON.stringify(goal.scope)!=='{"source":"all"}')return unknown('unsupported-metric-contract');
 try{
  const snapshot=await status();const asOf=Date.parse(snapshot.as_of);
  if(!Number.isSafeInteger(asOf)||asOf>now)return unknown('invalid-snapshot');
  const result=await weekly(snapshot,{source:'all'}),p=result?.payload;
  if(!p?.available||p.source!=='all'||p.timezone!=='Asia/Bangkok'||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.end-p.start!==7*DAY||p.end>asOf+1||p.end>now||p.end-1<goal.period_start||p.end>goal.period_end||!Number.isSafeInteger(p.users)||p.users<0)return unknown('invalid-observation');
  const watermark=Date.parse(snapshot.events_complete_through||'');
  const complete=snapshot.history_complete===true&&Number.isFinite(watermark)&&watermark>=p.end;
  const evidence=store.saveEvidence(owner,{id:randomUUID(),source:'weekly-core-service',metricId:'weekly_core',unit:'users',scope:{source:'all'},definitionVersion:'1',state:complete?'verified':'partial',value:p.users,period:{start:p.start,end:p.end,timezone:'Asia/Bangkok'},watermarks:{events:snapshot.as_of,eventsCompleteThrough:snapshot.events_complete_through||null},coverage:{historyComplete:snapshot.history_complete===true,status:complete?'verified':'partial'},warnings:complete?[]:['历史和连续采集覆盖未确认；观测值不代表完整总体'],observedAt:now,originalLocator:{page:'northStar',snapshotId:snapshot.snapshot_id,source:'all',start:p.start,end:p.end}});
  return store.progress(owner,goal.id,{at:now,evidenceId:evidence.id}).progress;
 }catch{return unknown('source-unavailable')}
}
module.exports={refreshWeeklyCore};
