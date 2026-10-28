'use strict';
const {workspaceStore}=require('./store');
const {discover}=require('./discovery');
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
module.exports={dailyWorkspaceTick,localSourceHealth};
