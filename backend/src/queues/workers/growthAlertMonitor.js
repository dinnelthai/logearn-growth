#!/usr/bin/env node
'use strict';
// Separate read-only monitoring process: no LLM, no business SQL rebuild,
// no external alerts; writes only owner-scoped audit records.
require('dotenv').config();
const cron=require('node-cron');
const {createAlertStore}=require('../../ai/growth/alertStore');
const {scanDailyAlerts}=require('../../ai/growth/monitor');
const {dailyRequest}=require('../../ai/growth/daily');
const pool=require('../../db/aiPool');
const ids=(process.env.AI_DAILY_OWNER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
const goal=process.env.AI_DAILY_GOAL||'activation',source=process.env.AI_DAILY_SOURCE||'all';
let busy=false;
function config(){
 if(!ids.length||ids.length!==new Set(ids).size)throw Error('设置唯一、明确的 AI_DAILY_OWNER_IDS');
 for(const ownerId of ids)dailyRequest({ownerId,goal,source});
}
async function tick({dryRun=false,now=Date.now(),store=createAlertStore()}={}){
 if(busy)return [];
 busy=true;
 try{
  const results=[];
  for(const ownerId of ids){
   try{
    if(dryRun){results.push({ownerId,status:'dry-run',goal,source});continue}
    const result=await scanDailyAlerts({ownerId,goal,source,store,now});
    results.push({ownerId,status:result.status,observed:result.observed||0,
      newObservations:result.newObservations||0,reason:result.reason||null});
   }catch(error){
    console.error('[growth-monitor] failure',ownerId,error.message);
    results.push({ownerId,status:'error',reason:error.message});
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
 const task=cron.schedule(process.env.AI_GROWTH_ALERT_CRON||'30 10 * * *',
  ()=>tick(),{timezone:'Asia/Bangkok',scheduled:true});
 console.info('[growth-monitor] active, Asia/Bangkok 10:30 default; LLM calls disabled');
 const stop=async()=>{task.stop();await pool.end();process.exit(0)};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(require.main===module)main().catch(error=>{
 console.error('[growth-monitor]',error.message);process.exitCode=1;pool.end().catch(()=>{});
});
module.exports={config,tick};
