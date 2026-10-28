'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const path=require.resolve('../src/ai/growth/monitorControl');
const state=new Map();
let writes=0;
const control={
 async get(owner){return state.get(owner)||{enabled:false,version:0,status:'disabled',workerOnline:false}},
 async set(owner,{enabled,expectedVersion}){
  if(typeof enabled!=='boolean'||!Number.isSafeInteger(expectedVersion))
   throw Object.assign(Error('invalid input'),{status:400});
  const prev=state.get(owner)||{version:0};
  if(prev.version!==expectedVersion)
   throw Object.assign(Error('stale version'),{status:409});
  const next={enabled,version:prev.version+1,workerOnline:false,
   status:enabled?'waiting-for-worker':'disabled'};
  state.set(owner,next);writes++;return next;
 }
};
require.cache[path]={id:path,filename:path,loaded:true,exports:{createMonitorControl:()=>control}};
const router=require('../src/routes/aiAnalysis');
test('monitor HTTP is owner allowlisted, versioned and does not imply worker started',async()=>{
 const old=process.env.AI_DAILY_OWNER_IDS;
 process.env.AI_DAILY_OWNER_IDS='alice';
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/growth-alerts/monitor-control';
 const request=async(owner,method='GET',data)=>{const resp=await fetch(url,{
  method,headers:{'x-owner':owner,'Content-Type':'application/json'},
  ...(method==='PUT'?{body:JSON.stringify(data)}:{})
 });return {status:resp.status,body:await resp.json()}};
 try{
  assert.equal((await request('bob')).body.allowed,false);
  assert.equal((await request('bob','PUT',{enabled:true,expectedVersion:0})).status,403);
  assert.equal(writes,0);
  assert.equal((await request('alice')).body.status,'disabled');
  let r=await request('alice','PUT',{enabled:true,expectedVersion:0});
  assert.equal(r.status,200);assert.equal(r.body.enabled,true);
  assert.equal(r.body.workerOnline,false);assert.equal(r.body.status,'waiting-for-worker');
  assert.equal((await request('alice','PUT',{enabled:false,expectedVersion:0})).status,409);
  r=await request('alice','PUT',{enabled:false,expectedVersion:1});
  assert.equal(r.status,200);assert.equal(r.body.enabled,false);assert.equal(writes,2);
 }finally{
  if(old===undefined)delete process.env.AI_DAILY_OWNER_IDS;else process.env.AI_DAILY_OWNER_IDS=old;
  await new Promise(r=>server.close(r));
 }
});
