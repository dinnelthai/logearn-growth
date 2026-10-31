'use strict';
const {workspaceStore}=require('./store');
const {discover}=require('./discovery');
const {refreshWeeklyCore}=require('./weeklyCoreProgress');
const {currentMonth}=require('./period');
function localSourceHealth(db,ownerId){
 const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 const sources=[];
 if(names.has('content_growth_items')&&db.prepare('PRAGMA table_info(content_growth_items)').all().some(c=>c.name==='owner_id')){
  const row=db.prepare('SELECT COUNT(*) n FROM content_growth_items WHERE owner_id=?').get(ownerId);
  if(row.n>0)sources.push({id:'content-manual',state:'partial',coverage:'only-operator-entered-platform-metrics'});
 }
 if(names.has('x_follower_progress')){
  const rows=db.prepare('SELECT complete,state FROM x_follower_progress WHERE owner_id=?').all(ownerId);
  if(rows.length)sources.push({id:'x-follower',state:'partial',coverage:'third-party-sample-with-keyword-classification'});
 }
 return sources;
}
// Called only from the existing leased Bull/cron scheduler. Never sends a
// webhook, publishes content, contacts users, or charges for LLM calls.
function dailyWorkspaceTick({db,ownerId,now=Date.now(),sources=null,signals=[]}={}){
 if(!db?.prepare||typeof ownerId!=='string'||!ownerId)throw Error('缺少用户隔离或持久化数据库');
 const store=workspaceStore(db,{clock:()=>now});
 const localSources=sources==null?localSourceHealth(db,ownerId):sources;
 const result=discover(ownerId,store,{sources:localSources,signals,at:now,maxNew:8});
 const brief=store.buildReport(ownerId,'daily',{now,publish:false});
 return {newProblems:result.created.length,existingProblems:result.updated.length,
  skippedForDailyLimit:result.skipped.length,reportId:brief.id,reportRevision:brief.revision,
  evidenceCoverage:brief.snapshot.quality.sourceCompleteness,paidCalls:0,externalActions:0,
  warning:'Only explicitly supplied authorized source health and vetted signals were inspected; unconfigured sources may remain unknown'};
}
async function dailyWorkspaceTickWithMetrics({db,ownerId,now=Date.now(),metricProviders=null,executiveObservation=null}={}){
 const store=workspaceStore(db,{clock:()=>now}),month=currentMonth(now),sources=localSourceHealth(db,ownerId);
 const providers=metricProviders||{status:()=>require('../../../data/hologres').status(),weekly:(...args)=>require('../../../data/weeklyCore').weeklyCoreFacts(...args)};
 const goals=store.listGoals(ownerId,{asOf:now,start:month.start,end:month.end}).filter(g=>g.metric_id==='weekly_core');
 for(const goal of goals){
  const progress=await refreshWeeklyCore({store,owner:ownerId,goal,now,...providers});
  if(progress.status==='partial'&&progress.evidenceId){sources.push({id:'weekly-core-events',state:'partial',coverage:'history-and-watermark-unverified',evidenceId:progress.evidenceId});break}
 }
 const cycle=process.env.GROWTH_EXECUTIVE_CYCLE_ENABLED!=='0'?
  await require('./executiveCycle').runExecutiveCycle({ownerId,store,now,
   ...(executiveObservation?{load:executiveObservation}:{})}):{status:'disabled',modelCalls:0,externalActions:0};
 let investigation={status:'disabled',paidCalls:0,externalActions:0};
 if(cycle.status==='verified'&&process.env.GROWTH_EXECUTIVE_RESEARCH_ENABLED==='1'){
  // Research connectors are optional; a missing plugin must not suppress
  // the free daily Executive report or durable owner reminders.
  try{
   const dbEvidence=require('../../business/evidence').createEvidenceStore(db);
   const registry=require('../../business/tools/registry').defaultRegistry();
   investigation=await require('./executiveInvestigation').investigateOwner({store,ownerId,now,registry,
    verifyExternalEvidence:(owner,id,ctx)=>{
     try{return !!dbEvidence.get(id,ctx)}catch{return false}
    }});
  }catch{
   investigation={status:'registry-unavailable',paidCalls:0,modelCalls:0,externalActions:0};
  }
 }
 // All reminders are internal and idempotently persisted; external delivery
 // remains separately authorized by the existing notifier.
 for(const row of store.actions(ownerId,{limit:200}).filter(x=>x.status==='accepted'))
  store.ensureExecutiveWorkItems(ownerId,row.id);
 const reminders=store.executiveReminders(ownerId,{at:now,record:true});
 const result=dailyWorkspaceTick({db,ownerId,now,sources});
 return {...result,executive:cycle,investigation,reminders:{due:reminders.due,pending:reminders.pending.length}};
}
module.exports={dailyWorkspaceTick,dailyWorkspaceTickWithMetrics,localSourceHealth};
