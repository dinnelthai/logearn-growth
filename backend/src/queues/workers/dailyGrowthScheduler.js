#!/usr/bin/env node
'use strict';
// Dedicated opt-in process. Do not start in the API or in every Bull worker.
require('dotenv').config();
const cron=require('node-cron');
const {dispatchDaily,dailyRequest}=require('../../ai/growth/daily');
const records=require('../../db/aiRecords');
const {addAIAnalysisJob,closeQueues}=require('../queues');
const enabled=process.env.AI_DAILY_ENABLED==='1';
const ownerIds=(process.env.AI_DAILY_OWNER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const goal=process.env.AI_DAILY_GOAL||'activation';
const source=process.env.AI_DAILY_SOURCE||'all';
let busy=false;
function config(){
 if(!ownerIds.length||new Set(ownerIds).size!==ownerIds.length)
  throw Error('AI_DAILY_OWNER_IDS must be explicit, nonempty and unique');
 // Validate without starting paid work.
 dailyRequest({ownerId:ownerIds[0],goal,source});
}
async function tick({dryRun=false,now=Date.now()}={}){
 if(busy)return [];
 busy=true;
 try{
  const results=[];
  for(const ownerId of ownerIds){
   try{
    const result=dryRun?{status:'dry-run',...dailyRequest({ownerId,now,goal,source})}:
      await dispatchDaily({ownerId,now,goal,source,records,enqueue:addAIAnalysisJob});
    results.push({ownerId,status:result.status,analysisId:result.analysisId||null,period:result.period});
   }catch(error){
    console.error('[daily-growth] enqueue failed',ownerId,error.message);
    results.push({ownerId,status:'error',error:error.message});
   }
  }
  console.info('[daily-growth] dispatch',JSON.stringify(results));
  return results;
 }finally{busy=false}
}
async function main(){
 config();
 if(process.argv.includes('--dry-run')){
  await tick({dryRun:true});await closeQueues();return;
 }
 if(!enabled)throw Error('Daily AI analysis is disabled; set AI_DAILY_ENABLED=1 explicitly');
 if(process.argv.includes('--once')){
  await tick();await closeQueues();return;
 }
 const task=cron.schedule(process.env.AI_DAILY_CRON||'10 9 * * *',()=>tick(),{
   timezone:'Asia/Bangkok',scheduled:true
 });
 console.info('[daily-growth] enabled for',ownerIds.length,'owner(s), Bangkok time');
 const stop=async()=>{task.stop();await closeQueues();process.exit(0)};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(require.main===module)main().catch(error=>{console.error('[daily-growth]',error.message);process.exitCode=1;closeQueues().catch(()=>{})});
module.exports={tick,config};
