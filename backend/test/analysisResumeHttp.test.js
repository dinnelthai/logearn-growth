'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const routerPath=require.resolve('../src/routes/aiAnalysis');
const recordsPath=require.resolve('../src/db/aiRecords');
const queuePath=require.resolve('../src/queues/queues');
const state={record:null,guards:[],enqueued:0};
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 async getAnalysisRecord(id,owner){return id==='a'&&owner==='alice'?state.record:null},
 async listAnalysisPaidCalls(){return state.guards}
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 async addAIAnalysisJob(name,data,opts){
  assert.equal(name,'resume-investigation');assert.equal(data.ownerId,'alice');
  assert.equal(opts.attempts,1);state.enqueued++;
  return {id:opts.jobId}
 },async getJobStatus(){return {exists:false}}
}};
const router=require(routerPath);
test('authenticated resume accepts only expired owned tasks with confirmed paid journal',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/a/resume';
 const send=async(owner='alice')=>{
  const res=await fetch(url,{method:'POST',headers:{'x-owner':owner}});
  return {status:res.status,data:await res.json()};
 };
 try{
  state.enqueued=0;state.record={id:'a',status:'processing',lease_expires_at:Date.now()-5000,cancel_requested:false};
  state.guards=[{round:0,status:'unknown'}];
  let r=await send();assert.equal(r.status,409);assert.equal(state.enqueued,0);
  state.guards=[{round:0,status:'received'}];
  r=await send('bob');assert.equal(r.status,404);assert.equal(state.enqueued,0);
  state.record.cancel_requested=true;
  r=await send();assert.equal(r.status,409);
  state.record.cancel_requested=false;state.record.lease_expires_at=Date.now()+120000;
  r=await send();assert.equal(r.status,409);
  state.record.lease_expires_at=Date.now()-5000;
  r=await send();assert.equal(r.status,202);assert.equal(state.enqueued,1);
  assert.match(r.data.notice,/费用/);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
