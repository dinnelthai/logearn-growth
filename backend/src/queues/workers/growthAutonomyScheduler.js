#!/usr/bin/env node
'use strict';
require('dotenv').config();
const cron=require('node-cron');
const pool=require('../../db/aiPool');
const {autonomyConfig,tickAutonomousOwner}=require('../../ai/growth/agentAutonomy');
const {closeQueues}=require('../queues');
let running=false;
function config(){return autonomyConfig(process.env)}
async function tick({now=Date.now(),dryRun=false,runOwner=tickAutonomousOwner}={}){
 const settings=config();
 if(dryRun)return {dryRun:true,owners:settings.owners.length,
  goals:settings.goals,paidDispatchEnabled:false,
  note:'dry run does not query the database or call model providers'};
 if(running)return {status:'already-running'};
 running=true;
 const results=[];
 const webhookConfig=require('../../ai/growth/agentWebhook').webhookConfig();
 const enabledOwners=Object.keys(webhookConfig);
 const outbox=enabledOwners.length?
  require('../../ai/growth/agentOutbox').createAgentOutbox():null;
 try{
  for(const ownerId of settings.owners){
   // Catch the most recent day, plus two past completed days in case the
   // model or upstream watermark was temporarily unavailable.
   for(let lag=2;lag>=0;lag--){
    try{
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
  }
  if(outbox){
   const {sendAgentWebhook}=require('../../ai/growth/agentWebhook');
   const due=await outbox.claim(enabledOwners,{limit:10});
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
 }finally{running=false}
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
