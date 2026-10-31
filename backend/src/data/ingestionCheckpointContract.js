'use strict';
// Structural inspection only. No caller may treat this as authentication,
// source completeness, or proof that the producer wrote every event.
function inspectCheckpoint(record,{now,expectedPartitions,maxAgeMs}={}){
 const incomplete={status:'incomplete',candidateCompleteThrough:null,sourceVerified:false,historyComplete:false};
 const time=x=>Number.isSafeInteger(x)&&x>=0;
 if(!record||record.version!=='growth-ingestion-checkpoint-v1'||record.source!=='growth_events'||
  !time(now)||!time(maxAgeMs)||maxAgeMs===0||!time(record.observedAt)||
  record.observedAt>now||now-record.observedAt>maxAgeMs||
  !time(record.historyStart)||record.historyStart>record.observedAt||record.backfillComplete!==true||
  !Array.isArray(expectedPartitions)||!expectedPartitions.length||
  expectedPartitions.some(x=>typeof x!=='string'||!x.trim())||
  new Set(expectedPartitions).size!==expectedPartitions.length||!Array.isArray(record.partitions)||
  record.partitions.length!==expectedPartitions.length)return incomplete;
 const expected=new Set(expectedPartitions),seen=new Set(),times=[];
 for(const p of record.partitions){
  if(!p||!expected.has(p.id)||seen.has(p.id)||!time(p.completeThrough)||
   p.completeThrough>record.observedAt||p.completeThrough<record.historyStart||
   p.unresolvedFailures!==0||p.pendingRetries!==0)return incomplete;
  seen.add(p.id);times.push(p.completeThrough);
 }
 return {status:'contract-ready-unverified',candidateCompleteThrough:Math.min(...times),
  sourceVerified:false,historyComplete:false};
}
module.exports={inspectCheckpoint};
