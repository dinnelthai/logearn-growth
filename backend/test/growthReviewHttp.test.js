'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const recordsPath=require.resolve('../src/db/aiRecords');
const queuePath=require.resolve('../src/queues/queues');
const remotePath=require.resolve('../src/data/hologres');
const suggestion={id:'s1',owner_id:'alice',user_status:'executed',
 executed_at:Date.parse('2026-10-17T08:00:00Z'),validation_metrics:{primary:'active_users'}};
let jobs=0,complete=false;
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 getSuggestion:async(id,owner)=>id==='s1'&&owner==='alice'?suggestion:null,
 getRetrospective:async()=>complete?{id:'saved-review'}:null,
 listPendingReviewSuggestions:async(owner)=>owner==='alice'?[{
  id:'s1',analysis_id:'a1',owner_id:'alice',business_problem:'funnel',
  user_status:'executed',executed_at:suggestion.executed_at,priority:'P1'
 }]:[]
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 addAIAnalysisJob:async(name,data,opts)=>{jobs++;assert.equal(name,'retrospective');assert.equal(opts.jobId,data.retrospectiveId);return {id:opts.jobId}}
}};
require.cache[remotePath]={id:remotePath,filename:remotePath,loaded:true,exports:{
 status:async()=>({as_of:'2026-10-27T12:00:00Z'})
}};
const router=require('../src/routes/aiAnalysis');
test('owner-scoped review queue and a deterministic nonduplicating retrospective ID',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 try{
  let r=await fetch(base+'/growth-review-queue');assert.equal(r.status,200);
  let data=await r.json();assert.equal(data.readyCount,1);assert.equal(data.entries[0].status,'ready');
  r=await fetch(base+'/growth-review-queue',{headers:{'x-owner':'bob'}});data=await r.json();assert.equal(data.readyCount,0);
  async function create(key,owner='alice'){
   const response=await fetch(base+'/suggestions/s1/retrospective',{method:'POST',
    headers:{'Content-Type':'application/json','x-owner':owner},
    body:JSON.stringify({requestKey:key})});
   return {status:response.status,data:await response.json()};
  }
  assert.equal((await create('x','bob')).status,404);
  const first=await create('first');
  const second=await create('another-request');
  assert.equal(first.status,202);
  assert.equal(second.status,202);
  assert.equal(first.data.retrospectiveId,second.data.retrospectiveId);
  complete=true;
  const third=await create('yet-another');
  assert.equal(third.status,200);assert.equal(third.data.status,'completed');
  assert.equal(jobs,2,'both calls use the same Bull jobId; Bull deduplicates concurrent enqueues');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
