'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const path=require.resolve('../src/ai/growth/alertStore');
const queue=require.resolve('../src/queues/queues');
const monitor=require.resolve('../src/ai/growth/monitor');
let mutations=0,scans=0;
const alert={id:'a1',owner_id:'alice',version:1,status:'open',metric:'active_users'};
const fakeStore={
 list:async owner=>owner==='alice'?[alert]:[],
 get:async(owner,id)=>owner==='alice'&&id==='a1'?alert:null,
 history:async(owner,id)=>owner==='alice'&&id==='a1'?[{event_type:'observed'}]:[],
 transition:async(owner,id,options)=>{
  if(owner!=='alice'||id!=='a1'||options.expectedVersion!==1)return null;
  mutations++;return {...alert,status:options.action==='acknowledge'?'acknowledged':'open'};
 }
};
require.cache[path]={id:path,filename:path,loaded:true,exports:{createAlertStore:()=>fakeStore}};
require.cache[queue]={id:queue,filename:queue,loaded:true,exports:{
 addAIAnalysisJob(){throw Error('alert endpoint must not call paid queue')},
 getJobStatus:async()=>({exists:false})
}};
require.cache[monitor]={id:monitor,filename:monitor,loaded:true,exports:{
 scanDailyAlerts:async data=>{scans++;return {status:'scanned',ownerId:data.ownerId,newObservations:0}}
}};
const router=require('../src/routes/aiAnalysis');
test('alert HTTP actions are owner-scoped and no-cost; audit detail cannot leak cross-owner',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 const query=async(path,{owner='alice',method='GET',body}={})=>{
  const r=await fetch(base+path,{method,headers:{'x-owner':owner,'Content-Type':'application/json'},
   body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
 };
 try{
  assert.equal((await query('/growth-alerts')).body.alerts.length,1);
  assert.equal((await query('/growth-alerts',{owner:'bob'})).body.alerts.length,0);
  assert.equal((await query('/growth-alerts/a1/history',{owner:'bob'})).status,404);
  assert.equal((await query('/growth-alerts/a1/history')).body.events.length,1);
  let r=await query('/growth-alerts/a1/action',{owner:'bob',method:'POST',body:{
    action:'acknowledge',expectedVersion:1
  }});
  assert.equal(r.status,409);assert.equal(mutations,0);
  r=await query('/growth-alerts/a1/action',{method:'POST',body:{
    action:'acknowledge',expectedVersion:1
  }});
  assert.equal(r.status,200);assert.equal(mutations,1);
  assert.equal(r.body.paidCalls,0);assert.equal(r.body.externalActions,0);
  r=await query('/growth-alerts/scan',{method:'POST',body:{source:'all',goal:'activation'}});
  assert.equal(r.status,200);assert.equal(r.body.ownerId,'alice');
  assert.equal(r.body.paidCalls,0);assert.equal(scans,1);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
