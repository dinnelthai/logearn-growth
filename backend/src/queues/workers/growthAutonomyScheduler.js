#!/usr/bin/env node
'use strict';
require('dotenv').config();
const cron=require('node-cron');
const pool=require('../../db/aiPool');
const {autonomyConfig,tickAutonomousOwner}=require('../../ai/growth/agentAutonomy');
const {closeQueues}=require('../queues');
let running=false;
function config(){return autonomyConfig(process.env)}
async function tick({now=Date.now(),dryRun=false,runOwner=tickAutonomousOwner,clock=()=>Date.now(),
 health=require('../../ai/growth/agentSchedulerHealth').createSchedulerHealth()}={}){
 const settings=config();
 if(dryRun)return {dryRun:true,owners:settings.owners.length,
  goals:settings.goals,paidDispatchEnabled:false,
  note:'dry run does not query the database or call model providers'};
 const maxRunMs=Number(process.env.AI_AUTONOMY_TICK_MAX_MS||240000);
 if(!Number.isSafeInteger(maxRunMs)||maxRunMs<1000||maxRunMs>600000)
  throw Error('AI_AUTONOMY_TICK_MAX_MS 必须在1000到600000毫秒之间');
 if(running)return {status:'already-running-local'};
 const lease=await health.begin({now:Date.now()});
 if(!lease)return {status:'already-running-other-worker'};
 running=true;
 const startedAt=clock();let exceededBudget=false;
 let failure=null,leaseLost=false,renewing=false;
 const pulse=setInterval(async()=>{
  if(renewing)return;
  renewing=true;
  try{
   const renewed=await health.heartbeat(lease);
   if(!renewed)leaseLost=true;
  }catch(error){leaseLost=true;console.error('[growth-autonomy] heartbeat',error.message)}
  finally{renewing=false}
 },20000);
 pulse.unref?.();
 const results=[];
 const webhookConfig=require('../../ai/growth/agentWebhook').webhookConfig();
 const enabledOwners=Object.keys(webhookConfig);
 const outbox=enabledOwners.length?
  require('../../ai/growth/agentOutbox').createAgentOutbox():null;
 try{
  ownerLoop: for(const ownerId of settings.owners){
   // Catch the most recent day, plus two past completed days in case the
   // model or upstream watermark was temporarily unavailable.
   for(let lag=2;lag>=0;lag--){
    // Stop launching new work once this tick's capacity deadline is reached.
    // The next scheduled tick safely retries previously deferred business days.
    if(clock()-startedAt>=maxRunMs){
     exceededBudget=true;
     results.push({ownerId,backfillDaysAgo:lag,status:'deferred-budget',reason:'scheduler-time-budget'});
     break ownerLoop;
    }
    try{
     if(leaseLost)throw Error('Agent 调度租约已失效，停止进一步处理');
     const item=await runOwner({
      ownerId,now:now-lag*86400000,source:settings.source,
      goals:settings.goals,
      // Never automatically launch paid historical backfills.
      allowPaidDispatch:lag===0&&settings.paidEnabled,
      notify:outbox&&webhookConfig[ownerId]?value=>outbox.enqueue(value):null
     });
     results.push({...item,backfillDaysAgo:lag});
    }catch(error){
     results.push({ownerId,backfillDaysAgo:lag,status:'error',reason:error.message});
    }
   }
   if(process.env.AI_PROMPT_AUTO_ROLLBACK_ENABLED==='1'&&!leaseLost){
    try{const outcome=require('../../ai/optimization/canarySafety').checkCanary(require('../../db/connection'),ownerId,{now});results.push({ownerId,status:'canary-safety',canaryAction:outcome.action,canaryStatus:outcome.status});}
    catch(error){results.push({ownerId,status:'error',reason:'canary-safety: '+error.message});}
   }
   if(process.env.GROWTH_WORKSPACE_DISCOVERY_ENABLED==='1'&&!leaseLost){
    try{
     const evidence=await require('../../ai/growth/workspace/dailyTick').dailyWorkspaceTickWithMetrics({
      db:require('../../db/connection'),ownerId,now
     });
     results.push({ownerId,status:'workspace',newProblems:evidence.newProblems,reportId:evidence.reportId,paidCalls:0});
    }catch(error){results.push({ownerId,status:'error',reason:'workspace: '+error.message})}
   }
   if(process.env.AI_RESEARCH_DISCOVERY_ENABLED==='1'&&!leaseLost){
    try{
     const db=require('../../db/connection');
     const changes=require('../../ai/business/context').createContextStore(db).listChanges(ownerId);
     const sourceEvents=require('../../ai/growth/sourceChanges').sourceChanges(db,ownerId,{now});
     const research=require('../../ai/growth/researchQuestions').createResearchQuestions(db)
       .plan(ownerId,[...changes,...sourceEvents].slice(0,100),{source:settings.source,now});
     results.push({ownerId,researchNew:research.inserted.length,paidCalls:0,status:'research-discovery'});
    }catch(error){results.push({ownerId,status:'error',reason:'research-discovery: '+error.message})}
   }
  }
  if(outbox){
   const {sendAgentWebhook}=require('../../ai/growth/agentWebhook');
   const due=leaseLost||exceededBudget?[]:await outbox.claim(enabledOwners,{limit:10});
   for(const item of due){
    try{
     const httpStatus=await sendAgentWebhook(item,{config:webhookConfig});
     await outbox.finish(item,{delivered:true,httpStatus});
     results.push({ownerId:item.owner_id,delivery:'delivered',briefId:item.payload.briefId});
    }catch(error){
     await outbox.finish(item,{delivered:false,error,httpStatus:error.httpStatus||null});
     results.push({ownerId:item.owner_id,delivery:'retry-scheduled',reason:error.message});
    }
   }
  }
  console.info('[growth-autonomy] '+JSON.stringify(results.map(r=>({
   ownerId:r.ownerId,day:r.day,status:r.status,
   score:r.score??null,enqueued:r.enqueued?.length||0,reason:r.reason||null
  }))));
  return results;
 }catch(error){failure=error;throw error}
 finally{
  clearInterval(pulse);
  const errors=results.filter(x=>x.status==='error'||
   x.delivery==='retry-scheduled'||x.status==='lease-lost').length;
  const summary={items:results.length,errors,
   ready:results.filter(x=>x.status==='ready').length,
   partial:results.filter(x=>x.status==='partial').length,
   blocked:results.filter(x=>x.status==='blocked').length,
   queued:results.reduce((n,x)=>n+(x.enqueued?.length||0),0),
   deliveries:results.filter(x=>x.delivery==='delivered').length,
   deferred:exceededBudget?1:0};
  const outcome=failure||leaseLost?'failed':errors||exceededBudget?'partial':'succeeded';
  try{
   await health.finish(lease,{outcome,summary,
    error:failure?.message|| (leaseLost?'lease-lost':null)});
  }catch(error){console.error('[growth-autonomy] cannot persist run health',error.message)}
  running=false;
 }
}
async function main(){
 config();
 if(process.argv.includes('--dry-run')){
  console.info('[growth-autonomy]',JSON.stringify(await tick({dryRun:true})));
  await closeQueues();await pool.end();return;
 }
 if(process.env.AI_AUTONOMY_ENABLED!=='1')
  throw Error('自主管理默认关闭：必须明确 AI_AUTONOMY_ENABLED=1');
 if(process.argv.includes('--once')){
  await tick();await closeQueues();await pool.end();return;
 }
 const task=cron.schedule(process.env.AI_AUTONOMY_CRON||'*/30 * * * *',
  ()=>tick().catch(e=>console.error('[growth-autonomy]',e.message)),
  {timezone:'Asia/Bangkok',scheduled:true});
 console.info('[growth-autonomy] enabled; separate paid dispatch opt-in, no automatic external actions');
 const stop=async()=>{task.stop();await closeQueues();await pool.end();process.exit(0)};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module)main().catch(e=>{
 console.error('[growth-autonomy] '+e.message);process.exitCode=1;
 closeQueues().catch(()=>{});pool.end().catch(()=>{});
});
module.exports={tick,config};
