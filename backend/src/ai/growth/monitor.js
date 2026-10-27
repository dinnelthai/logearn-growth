'use strict';
const {compareDailySnapshots}=require('./crossDay');
async function scanDailyAlerts({ownerId,source='all',goal='activation',store,proposalStore=null,now=Date.now()}){
 if(!store?.completedDays||!store?.observe||!Number.isSafeInteger(now))
  throw Error('异常监控依赖不完整');
 const days=await store.completedDays(ownerId,source,goal,2);
 if(days.length<2)return {status:'insufficient-history',observed:0,alerts:[],reason:'需要至少两个已完成业务日'};
 const result=compareDailySnapshots(days[1],days[0]);
 if(!result.comparable)return {status:'skipped',observed:0,alerts:[],reason:result.reason};
 // Do not mint alerts for reports whose dates are in the future.
 if(result.periodEnd>now)return {status:'skipped',observed:0,alerts:[],reason:'future-report'};
 const alerts=[],proposals=[];
 for(const signal of result.signals){
  const changed=await store.observe(ownerId,signal,now);
  if(changed){
   alerts.push(changed);
   if(proposalStore&&signal.priority==='P0'&&signal.direction==='decline'){
    const proposal=await proposalStore.propose(ownerId,changed,{now});
    if(proposal)proposals.push(proposal);
   }
  }
 }
 return {status:'scanned',comparedPeriodEnd:result.periodEnd,
   observed:result.signals.length,newObservations:alerts.length,alerts,
   proposedInvestigations:proposals.length,proposals};
}
module.exports={scanDailyAlerts};
