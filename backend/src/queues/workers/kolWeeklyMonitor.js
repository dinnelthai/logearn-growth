#!/usr/bin/env node
'use strict';
require('dotenv').config();
const cron=require('node-cron');
const pool=require('../../db/aiPool');
const {createKolOperations}=require('../../ai/growth/kolOperations');
const DAY=86400000;
const owners=(process.env.AI_KOL_OWNER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
let busy=false;
function config(){
 if(!owners.length||new Set(owners).size!==owners.length||owners.length>100)
  throw Error('AI_KOL_OWNER_IDS must explicitly list unique owner IDs');
}
async function tick({now=Date.now(),dryRun=false,ops=createKolOperations()}={}){
 config();
 const end=Math.floor(now/DAY)*DAY-3*DAY;
 if(dryRun)return {dryRun:true,owners:owners.length,end,paidCalls:0};
 if(busy)return {status:'already-running'};
 busy=true;
 const output=[];
 try{
  for(const ownerId of owners){
   try{
    for(const start of [end-14*DAY,end-7*DAY]){
     const value=await ops.capture(ownerId,{start,end:start+7*DAY,now});
     output.push({ownerId,start,...value});
    }
    output.push({ownerId,...await ops.scan(ownerId,{now})});
   }catch(error){
    output.push({ownerId,status:'error',reason:error.message});
   }
  }
  console.info('[kol-monitor]',JSON.stringify(output));return output;
 }finally{busy=false}
}
async function main(){
 config();
 if(process.argv.includes('--dry-run')){console.info(await tick({dryRun:true}));await pool.end();return}
 if(process.env.AI_KOL_MONITOR_ENABLED!=='1')
  throw Error('KOL weekly monitoring is disabled by default');
 if(process.argv.includes('--once')){await tick();await pool.end();return}
 const task=cron.schedule(process.env.AI_KOL_MONITOR_CRON||'15 12 * * 1',
  ()=>tick().catch(e=>console.error('[kol-monitor]',e.message)),
  {timezone:'Asia/Bangkok',scheduled:true});
 console.info('[kol-monitor] enabled; readonly CRM/Hologres monitoring and PG tasks only');
 const stop=async()=>{task.stop();await pool.end();process.exit(0)};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module)main().catch(e=>{
 console.error('[kol-monitor]',e.message);process.exitCode=1;pool.end().catch(()=>{});
});
module.exports={config,tick};
