'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const storePath=require.resolve('../src/ai/growth/agentStore');
const autonomyPath=require.resolve('../src/ai/growth/agentAutonomy');
const queuePath=require.resolve('../src/queues/queues');
let paid=0,refreshed=0;
require.cache[storePath]={id:storePath,filename:storePath,loaded:true,exports:{
 createAgentStore:()=>({
  targets:async owner=>owner==='alice'?[{goal:'activation',metric:'active_users',
   target:100,weight:1,version:1,active:true}]:[],
  listBriefs:async owner=>owner==='alice'?[{id:'brief-alice',day:'2026-10-26',
   source:'all',status:'partial',score:{value:null}}]:[],
  getBrief:async(owner,day)=>owner==='alice'&&day==='2026-10-26'?
   {id:'brief-alice',score:{value:null},status:'partial'}:null,
  setTarget:async(owner,input)=>({...input,owner,version:2}),
  feedback:async()=>[],getStrategy:async()=>null
 })
}};
require.cache[autonomyPath]={id:autonomyPath,filename:autonomyPath,loaded:true,exports:{
 tickAutonomousOwner:async args=>{
  assert.equal(args.allowPaidDispatch,false);refreshed++;
  return {status:'partial',briefId:'brief-alice',score:null,paidModelCallsStarted:0};
 }
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 addAIAnalysisJob(){paid++;throw Error('never charge for autonomy refresh')},
 getJobStatus:async()=>({exists:false})
}};
const router=require('../src/routes/aiAnalysis');
test('autonomy web APIs isolate owner target/brief and keep refresh strictly zero-paid',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 async function call(path,{owner='alice',method='GET',body}={}){
  const res=await fetch(base+path,{method,
   headers:{'Content-Type':'application/json','x-owner':owner},
   body:body?JSON.stringify(body):undefined});
  return {status:res.status,value:await res.json()};
 }
 try{
  let r=await call('/growth-agent/status');
  assert.equal(r.status,200);assert.equal(r.value.targetCount,1);
  assert.equal(r.value.schedulerRunning,'not-verified-from-http');
  r=await call('/growth-agent/targets',{owner:'bob'});
  assert.equal(r.status,200);assert.equal(r.value.targets.length,0);
  r=await call('/growth-agent/briefs',{owner:'bob'});
  assert.equal(r.value.briefs.length,0);
  r=await call('/growth-agent/briefs/2026-10-26');
  assert.equal(r.status,200);assert.equal(r.value.brief.score.value,null);
  r=await call('/growth-agent/briefs/2026-10-26',{owner:'bob'});
  assert.equal(r.status,404);
  r=await call('/growth-agent/learning');
  assert.equal(r.status,200);assert.equal(r.value.assessment.actualPredictionAccuracy,null);
  r=await call('/growth-agent/targets',{method:'PUT',
   body:{goal:'activation',metric:'active_users',target:100}});
  assert.equal(r.status,200);assert.equal(r.value.target.version,2);
  r=await call('/growth-agent/refresh',{method:'POST',body:{goals:['activation']}});
  assert.equal(r.status,200);assert.equal(r.value.paidModelCallsStarted,0);
  assert.equal(refreshed,1);assert.equal(paid,0);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
