#!/usr/bin/env node
'use strict';
require('dotenv').config();
const cron=require('node-cron');
const pool=require('../../db/aiPool');
const {tickGsc,targetDate}=require('../../ai/growth/gscSchedule');
const owners=(process.env.AI_GSC_OWNER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
let running=false;
function config(){
 if(!owners.length||new Set(owners).size!==owners.length||owners.length>100)
  throw Error('AI_GSC_OWNER_IDS must explicitly list unique authorized owner IDs');
 const backfill=Number(process.env.AI_GSC_BACKFILL_DAYS||14);
 if(!Number.isSafeInteger(backfill)||backfill<1||backfill>31)
  throw Error('AI_GSC_BACKFILL_DAYS must be between 1 and 31');
 return {backfill};
}
async function tick({now=Date.now(),dryRun=false}={}){
 const {backfill}=config();
 if(dryRun)return {dryRun:true,owners:owners.length,latestFinalizedDate:targetDate(now),
  backfillDays:backfill,paidCalls:0};
 if(running)return {status:'already-running'};
 running=true;
 try{
  const results=await tickGsc({owners,now,backfillDays:backfill});
  console.info('[gsc-scheduler] '+JSON.stringify(results));
  return results;
 }finally{running=false}
}
async function main(){
 config();
 if(process.argv.includes('--dry-run')){console.info(await tick({dryRun:true}));await pool.end();return}
 if(process.env.AI_GSC_SYNC_ENABLED!=='1')
  throw Error('GSC automatic synchronization is disabled by default');
 if(process.argv.includes('--once')){await tick();await pool.end();return}
 const job=cron.schedule(process.env.AI_GSC_SYNC_CRON||'20 11 * * *',
  ()=>tick().catch(e=>console.error('[gsc-scheduler] '+e.message)),
  {timezone:'Asia/Bangkok',scheduled:true});
 console.info('[gsc-scheduler] enabled: no LLM, no site mutation');
 const stop=async()=>{job.stop();await pool.end();process.exit(0)};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module)main().catch(error=>{
 console.error('[gsc-scheduler] '+error.message);process.exitCode=1;pool.end().catch(()=>{});
});
module.exports={tick,config};
