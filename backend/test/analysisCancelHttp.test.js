'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const routerFile=require.resolve('../src/routes/aiAnalysis');
const recordsFile=require.resolve('../src/db/aiRecords');
const queueFile=require.resolve('../src/queues/queues');
let active={id:'a',status:'processing',cancel_requested:false},writes=0;
require.cache[recordsFile]={id:recordsFile,filename:recordsFile,loaded:true,exports:{
 async requestAnalysisCancellation(id,owner){
  if(id!=='a'||owner!=='alice'||!['pending','processing'].includes(active.status))return null;
  writes++;active={...active,status:'failed',cancel_requested:true};return {id:'a',status:'failed',cancel_requested:true};
 }
}};
require.cache[queueFile]={id:queueFile,filename:queueFile,loaded:true,exports:{addAIAnalysisJob:async()=>{throw Error('must not enqueue')},getJobStatus:async()=>({exists:false})}};
const router=require(routerFile);
test('cancel HTTP is owner-scoped, idempotently rejects completed and does not enqueue',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/a/cancel';
  async function req(owner='alice'){const r=await fetch(url,{method:'POST',headers:{'x-owner':owner}});return {status:r.status,body:await r.json()}}
  let r=await req('bob');assert.equal(r.status,409);assert.equal(writes,0);
  r=await req();assert.equal(r.status,200);assert.equal(r.body.status,'failed');
  assert.equal(r.body.cancelRequested,true);assert.match(r.body.notice,/仍会产生费用/);
  r=await req();assert.equal(r.status,409);assert.equal(writes,1);
 }finally{await new Promise(r=>server.close(r))}
});
