'use strict';
// In-process, no-LLM monitor: the existing HTTP backend schedules one
// inexpensive daily scan. A shared PostgreSQL lease fences replicas.
const cron=require('node-cron');
const {createMonitorControl}=require('./monitorControl');
const {createSchedulerHealth}=require('./agentSchedulerHealth');
const {scanDailyAlerts}=require('./monitor');
const {createAlertStore}=require('./alertStore');
const {createInvestigationStore}=require('./investigationStore');
const GOALS=['activation','retention'];
const LEASE='growth-monitor';
let scheduler=null;
let busy=false;

function isStarted(){return scheduler!==null}

async function runOnce({control=createMonitorControl(),
 health=createSchedulerHealth(),scan=scanDailyAlerts,
 alerts=createAlertStore(),proposals=createInvestigationStore(),now=Date.now()}={}){
 if(busy)return {status:'already-running-local',scans:0};
 busy=true;
 let lease=null,result={status:'failed',scans:0,errors:0};
 try{
  lease=await health.begin({name:LEASE,now,leaseMs:600000});
  if(!lease)return {status:'already-running-other-instance',scans:0};
  let scans=0,errors=0,skipped=0;
  // A disabled owner is never selected. Recheck before each goal so toggling
  // OFF prevents further work even while a previous goal is finishing.
  for(const ownerId of await control.enabledOwners()){
   const goalSummary=[];
   for(const goal of GOALS){
    try{
     if(!(await control.get(ownerId,{now:Date.now()})).enabled){
      goalSummary.push({goal,status:'disabled'});skipped++;continue;
     }
     const found=await scan({ownerId,goal,source:'all',store:alerts,
      proposalStore:proposals,now:Date.now()});
     scans++;
     goalSummary.push({goal,status:found.status,
      observed:found.observed||0,newObservations:found.newObservations||0,
      reason:found.reason||null});
    }catch(error){
     errors++;goalSummary.push({goal,status:'error',reason:String(error.message).slice(0,180)});
     console.error('[growth-monitor]',goal,error.message);
    }
   }
   try{await control.recordScan(ownerId,{status:errors&&goalSummary.some(x=>x.status==='error')?'error':
    goalSummary.some(x=>x.status==='scanned')?'scanned':'skipped',
    summary:{goals:goalSummary}})}
   catch(error){errors++;console.error('[growth-monitor] result persistence',error.message)}
  }
  result={status:errors?'partial':'succeeded',scans,errors,skipped};
  console.info('[growth-monitor]',JSON.stringify(result));
  return result;
 }catch(error){
  result={status:'failed',scans:0,errors:1,reason:error.message};
  console.error('[growth-monitor]',error.message);
  return result;
 }finally{
  if(lease)try{await health.finish(lease,{outcome:result.status==='succeeded'?'succeeded':
   result.status==='partial'?'partial':'failed',summary:result,now:Date.now()})}
   catch(error){console.error('[growth-monitor] lease finish',error.message)}
  busy=false;
 }
}
function start(){
 if(scheduler)return scheduler;
 scheduler=cron.schedule('30 10 * * *',()=>runOnce().catch(e=>
  console.error('[growth-monitor] unexpected',e.message)),{timezone:'Asia/Bangkok'});
 console.info('[growth-monitor] in-process daily schedule enabled; accounts opt in via UI');
 return scheduler;
}
module.exports={start,isStarted,runOnce,GOALS};
