'use strict';
// Optional, disabled-by-default read-only module sweep. Reuses the existing
// scheduler lease and the registry; never calls an LLM or a paid connector.
const {makePlan,runPlan}=require('./modulePlanner');
const {createOpportunityStore}=require('./opportunityStore');
const DAY=86400000,OFFSET=7*3600000;
const GAP=new Set(['partial','not-synced','incomplete','stale','incomplete-or-zero-traffic-days']);
function completedPeriod(at){
 if(!Number.isSafeInteger(at)||at<0)throw Error('扫描时间无效');
 const end=Math.floor((at+OFFSET)/DAY)*DAY-OFFSET;
 return {start:end-7*DAY,end,timezone:'Asia/Bangkok'};
}
async function scanModuleOpportunities({db,ownerId,registry,
 now=Date.now(),goal='activation',maxCalls=4,verifyEvidence=null}={}){
 if(!db?.prepare||typeof ownerId!=='string'||!ownerId||!registry)
  throw Error('扫描缺少 owner、存储或受控目录');
 const period=completedPeriod(now),scope={source:'all'};
 const context={ownerId,runId:'module-scan:'+ownerId+':'+period.end,
  period,scope};
 const store=createOpportunityStore(db,{clock:()=>now,verifyEvidence:verifyEvidence||((owner,id,allowed)=>{
  try{
   const evidence=require('../business/evidence').createEvidenceStore(db);
   return !!evidence.get(id,{ownerId:owner,scope:allowed})
  }catch{return false}
 })});
 const plan=makePlan(registry,context,{mode:'full',goal,maxCalls});
 const result=await runPlan(registry,context,plan);
 const created=[],updated=[],skipped=[];
 for(const step of result.steps){
  const status=step.coverage?.status||'unknown';
  if(!['ok','unavailable'].includes(step.status)||!step.evidenceIds?.length||!GAP.has(status)){
   skipped.push({moduleId:step.moduleId,status:step.status,coverage:status});continue;
  }
  const subject='source-quality:'+step.moduleId;
  // Same exact window has already been checked, even when a subsequent tool
  // call generates fresh random evidence IDs. Avoid duplicate daily advice.
  const prior=store.list(ownerId,{limit:200}).find(o=>o.moduleId===step.moduleId&&
   o.subject===subject&&o.period?.end===period.end&&o.status!=='resolved');
  if(prior){skipped.push({moduleId:step.moduleId,status:'already-observed-window'});continue}
  const opportunity=store.upsert(ownerId,{
   moduleId:step.moduleId,subject,scope,period,goalVersion:null,metricId:null,
   definitionVersion:step.definitionVersions?.[0]||null,
   issue:'数据覆盖状态为 '+status+'，必须核对来源及观测窗口后才可作业务判断',
   hypothesis:'来源缺口可能影响模块结论；尚无法确定业务影响',
   evidenceIds:step.evidenceIds.slice(0,25),confidence:'unknown',
   impact:{affectedUsers:null},effort:{hours:null},
   action:'人工核对采集水位、成熟队列、关联关系和数据定义版本'
  });
  (opportunity.created?created:updated).push(opportunity.id);
 }
 return {period,goal,modulesInspected:result.steps.length,
  missing:result.missing,created,updated,skipped,
  status:result.status,paidCalls:0,externalActions:0,modelCalls:0,
  warning:'只有明确部分覆盖且有证据的模块才生成数据质量调查机会；不是业务下降结论'};
}
module.exports={completedPeriod,scanModuleOpportunities};
