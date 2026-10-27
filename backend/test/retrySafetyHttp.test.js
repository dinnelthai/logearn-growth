'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');

// Inject stubs before the router is loaded. No SQLite, Redis, Postgres or model calls.
const queuePath=require.resolve('../src/queues/queues');
const recordsPath=require.resolve('../src/db/aiRecords');
const tracePath=require.resolve('../src/ai/business/trace');
const connectionPath=require.resolve('../src/db/connection');
const state={record:null,calls:[],claims:0,queued:0};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 async addAIAnalysisJob(){state.queued++;return {id:'retry-job'}},
 async getJobStatus(){return {exists:false}}
}};
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 async getAnalysisRecord(_id,owner){return owner==='alice'?state.record:null},
 async claimAnalysisRetry(){state.claims++;return state.record}
}};
require.cache[connectionPath]={id:connectionPath,filename:connectionPath,loaded:true,exports:{}};
require.cache[tracePath]={id:tracePath,filename:tracePath,loaded:true,exports:{
 createTraceStore(){return {list(_owner,_id){return state.calls}}}
}};
const router=require('../src/routes/aiAnalysis');
const fixture={id:'analysis-1',status:'failed',date_range_start:100,date_range_end:200,
 business_scope:{source:'all'},user_question:'',filter_conditions:{focusGoal:'activation',modelMode:'auto'}};
test('retry HTTP gate rejects any prior model call before claiming status',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.headers['x-user']||'alice'};next()});app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url=`http://127.0.0.1:${server.address().port}/api/ai-analysis/analysis-1/retry`;
 async function retry(user='alice'){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-user':user},body:'{}'});return {status:response.status,body:await response.json()}}
 try{
  state.record={...fixture};state.calls=[{status:'received'}];state.claims=0;state.queued=0;
  let r=await retry();assert.equal(r.status,409);assert.equal(r.body.reason,'prior-model-call');assert.equal(state.claims,0);assert.equal(state.queued,0);
  state.calls=null;r=await retry();assert.equal(r.status,409);assert.equal(state.claims,0);
  state.calls=[];r=await retry('bob');assert.equal(r.status,409);assert.equal(state.claims,0);
  r=await retry();assert.equal(r.status,202);assert.equal(state.claims,1);assert.equal(state.queued,1);
 } finally {await new Promise(r=>server.close(r))}
});
