#!/usr/bin/env node
'use strict';
// Reuses the existing PostgreSQL alert store and cross-day scanner.
// No LLM, publishing, or automated business action in this process.
require('dotenv').config();
const cron=require('node-cron');
const {createAlertStore}=require('../../ai/growth/alertStore');
const {createInvestigationStore}=require('../../ai/growth/investigationStore');
const {scanDailyAlerts}=require('../../ai/growth/monitor');
const {dailyRequest}=require('../../ai/growth/daily');
const pool=require('../../db/aiPool');
const {createMonitorControl}=require('../../ai/growth/monitorControl');
const CORE_GOALS=new Set(['activation','retention']);
let busy=false;

function monitorConfig(env=process.env){
 const owners=(env.AI_DAILY_OWNER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!owners.length||owners.length>100||owners.some(x=>x.length>256)||
    owners.length!==new Set(owners).size)
  throw Error('设置唯一、明确的 AI_DAILY_OWNER_IDS');
 // The old single-goal setting remains compatible. A new dedicated setting
 // allows retention monitoring without changing paid daily AI configuration.
 const raw=env.AI_GROWTH_ALERT_GOALS||env.AI_DAILY_GOAL||'activation,retention';
 const goals=raw.split(',').map(x=>x.trim());
 if(!goals.length||goals.length>2||goals.some(x=>!CORE_GOALS.has(x))||
    new Set(goals).size!==goals.length)
  throw Error('AI_GROWTH_ALERT_GOALS 只支持不重复的 activation,retention');
 const source=env.AI_GROWTH_ALERT_SOURCE||env.AI_DAILY_SOURCE||'all';
 for(const ownerId of owners)for(const goal of goals)
  dailyRequest({ownerId,goal,source});
 return {owners,goals,source};
}
function config(){return monitorConfig()}
async function tick({dryRun=false,now=Date.now(),store=null,
 proposalStore=null,scanner=scanDailyAlerts,control=createMonitorControl(),env=process.env}={}){
 if(!Number.isSafeInteger(now))throw Error('监控日期无效');
 if(busy)return [];
 const settings=monitorConfig(env);
 busy=true;
 try{
  const results=[];
  for(const ownerId of settings.owners){
   const ownerResults=[];
   for(const goal of settings.goals){
    try{
     if(dryRun){
      results.push({ownerId,status:'dry-run',goal,source:settings.source});
      continue;
     }
     // Operator intent is persisted; read it every goal so a newly
     // disabled owner does not start another scan. Missing rows mean OFF.
     const state=await control.get(ownerId,{now});
     if(!state.enabled){
      const skipped={ownerId,goal,source:settings.source,status:'disabled'};
      results.push(skipped);ownerResults.push(skipped);continue;
     }
     const result=await scanner({
      ownerId,goal,source:settings.source,
      store:store||createAlertStore(),
      proposalStore:proposalStore||createInvestigationStore(),now
     });
     const entry={ownerId,goal,source:settings.source,status:result.status,
      observed:result.observed||0,newObservations:result.newObservations||0,
      proposedInvestigations:result.proposedInvestigations||0,reason:result.reason||null};
     results.push(entry);ownerResults.push(entry);
    }catch(error){
     console.error('[growth-monitor] failure',ownerId,goal,error.message);
     const entry={ownerId,goal,status:'error',reason:error.message};
     results.push(entry);ownerResults.push(entry);
    }
   }
   if(!dryRun&&ownerResults.some(r=>r.status!=='disabled')){
    // A failed summary write must not disguise partial scan failures.
    try{await control.recordScan(ownerId,{now,
     status:ownerResults.some(r=>r.status==='error')?'error':
      ownerResults.some(r=>r.status==='scanned')?'scanned':'skipped',
     summary:{goals:ownerResults.map(r=>({goal:r.goal,status:r.status,
       observed:r.observed||0,newObservations:r.newObservations||0,
       reason:r.reason||null}))}
    });}catch(error){console.error('[growth-monitor] record scan failed',error.message)}
   }
  }
  console.info('[growth-monitor]',JSON.stringify(results));
  return results;
 }finally{busy=false}
}
async function main(){
 config();
 if(process.argv.includes('--dry-run')){await tick({dryRun:true});await pool.end();return}
 if(process.env.AI_GROWTH_ALERT_MONITOR_ENABLED!=='1')
  throw Error('需显式设置 AI_GROWTH_ALERT_MONITOR_ENABLED=1');
 if(process.argv.includes('--once')){await tick();await pool.end();return}
 // Heartbeats prove the worker is alive between once-daily scans.
 // They do not imply the owner is enabled or that a scan succeeded.
 const control=createMonitorControl(),settings=config();
 const pulse=()=>Promise.all(settings.owners.map(ownerId=>
  control.heartbeat(ownerId).catch(e=>console.error('[growth-monitor] heartbeat',e.message))));
 await pulse();
 const heartbeatTimer=setInterval(()=>{pulse().catch(e=>console.error('[growth-monitor] heartbeat',e.message))},60000);
 heartbeatTimer.unref?.();
 const task=cron.schedule(process.env.AI_GROWTH_ALERT_CRON||'30 10 * * *',
  ()=>tick().catch(e=>console.error('[growth-monitor]',e.message)),
  {timezone:'Asia/Bangkok',scheduled:true});
 console.info('[growth-monitor] active; read-only source scan, no paid model calls');
 const stop=async()=>{task.stop();clearInterval(heartbeatTimer);await pool.end();process.exit(0)};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(require.main===module)main().catch(error=>{
 console.error('[growth-monitor]',error.message);process.exitCode=1;pool.end().catch(()=>{});
});
module.exports={config,monitorConfig,tick};
