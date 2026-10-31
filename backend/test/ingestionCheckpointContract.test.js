'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectCheckpoint}=require('../src/data/ingestionCheckpointContract');
const now=Date.parse('2026-10-31T00:00:00Z');
const example=()=>({version:'growth-ingestion-checkpoint-v1',source:'growth_events',observedAt:now-1000,historyStart:now-30*86400000,backfillComplete:true,partitions:[{id:'p0',completeThrough:now-60000,unresolvedFailures:0,pendingRetries:0},{id:'p1',completeThrough:now-120000,unresolvedFailures:0,pendingRetries:0}]});
test('contract inspection derives the conservative partition minimum without claiming trusted source',()=>{
 const result=inspectCheckpoint(example(),{now,expectedPartitions:['p0','p1'],maxAgeMs:300000});
 assert.equal(result.status,'contract-ready-unverified');assert.equal(result.candidateCompleteThrough,now-120000);
 assert.equal(result.sourceVerified,false);assert.equal(result.historyComplete,false);
});
test('missing, duplicate or unexpected partitions and pending failures block the candidate',()=>{
 for(const mutate of [x=>x.partitions.pop(),x=>x.partitions.push({...x.partitions[0]}),x=>x.partitions[0].id='other',x=>x.partitions[0].pendingRetries=1,x=>x.partitions[0].unresolvedFailures=1,x=>x.backfillComplete=false]){
  const data=example();mutate(data);const result=inspectCheckpoint(data,{now,expectedPartitions:['p0','p1'],maxAgeMs:300000});assert.equal(result.status,'incomplete');assert.equal(result.candidateCompleteThrough,null);
 }
});
test('stale, future, malformed, or missing timestamps never become a watermark',()=>{
 for(const mutate of [x=>x.observedAt=now+1,x=>x.observedAt=now-300001,x=>x.partitions[0].completeThrough=now+1,x=>x.partitions[0].completeThrough=null,x=>x.historyStart=null]){
  const data=example();mutate(data);assert.equal(inspectCheckpoint(data,{now,expectedPartitions:['p0','p1'],maxAgeMs:300000}).candidateCompleteThrough,null);
 }
 assert.equal(inspectCheckpoint(null,{now,expectedPartitions:['p0'],maxAgeMs:300000}).status,'incomplete');
});
