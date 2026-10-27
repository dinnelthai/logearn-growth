'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const storePath=require.resolve('../src/ai/growth/investigationStore');
const budgetPath=require.resolve('../src/ai/growth/budget');
const recordsPath=require.resolve('../src/db/aiRecords');
const queuePath=require.resolve('../src/queues/queues');
let enabled=false,enqueueCount=0,failEnqueue=false,created=null;
let draft;
function reset(){
 enabled=false;enqueueCount=0;failEnqueue=false;created=null;
 draft={id:'p1',owner_id:'alice',status:'proposed',version:1,
  alert_status:'open',metric:'active_users',goal:'activation',source:'all',
  period_end:Date.parse('2026-10-26T17:00:00Z'),evidence:{}};
}
reset();
const proposalStore={
 async get(owner,id){return owner==='alice'&&id==='p1'?draft:null},
 async decide(owner,id,version,action){
  if(owner!=='alice'||id!=='p1'||draft.version!==version||draft.status!=='proposed')return null;
  draft={...draft,status:action==='approve'?'approved':'dismissed',version:version+1};
  return draft;
 },
 async attachAnalysis(owner,id,analysisId){
  if(owner!=='alice'||id!=='p1'||draft.status!=='approved')return null;
  draft={...draft,analysis_id:analysisId};return draft;
 },
 analysisRequest(p,owner){
  assert.equal(p.status,'approved');assert.equal(owner,'alice');
  return {ownerId:owner,requestKey:'growth-investigate:'+p.id,title:'investigate',
   analysisType:'anomaly',dateRangeStart:p.period_end-86400000,dateRangeEnd:p.period_end,
   businessScope:{source:'all'},userQuestion:'Review anomaly',dataSnapshot:{},
   filterConditions:{proposalId:p.id,focusGoal:'activation',humanApproved:true,modelMode:'auto'}};
 }
};
require.cache[storePath]={id:storePath,filename:storePath,loaded:true,exports:{
 createInvestigationStore:()=>proposalStore
}};
require.cache[budgetPath]={id:budgetPath,filename:budgetPath,loaded:true,exports:{
 budgetLimit:()=>enabled?2:0,
 dailyBudgetStatus:async()=>({day:'2026-10-27',limit:enabled?2:0,
  reservedCalls:0,remainingCalls:enabled?2:0})
}};
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 async createAnalysisRecord(request){
  if(!created)created={id:'record-1',status:'pending',owner_id:request.ownerId,
   date_range_start:request.dateRangeStart,date_range_end:request.dateRangeEnd,
   business_scope:request.businessScope,user_question:request.userQuestion,
   filter_conditions:request.filterConditions};
  return created;
 }
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 async addAIAnalysisJob(name,data,options){
  enqueueCount++;
  assert.equal(name,'business-analysis');
  assert.equal(data.analysisId,'record-1');
  assert.equal(options.jobId,'record-1');assert.equal(options.attempts,1);
  if(failEnqueue)throw Error('simulated queue outage');
  return {id:options.jobId};
 },
 async getJobStatus(){return {exists:false}}
}};
const router=require('../src/routes/aiAnalysis');
test('proposal HTTP refuses outsiders, fails closed on budget, and retries approved queue failures safely',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{
  req.user={user_id:req.headers['x-owner']||'alice'};next()
 });app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 async function post(owner,action,version=1){
  const r=await fetch(base+'/growth-investigations/p1/action',{
   method:'POST',headers:{'x-owner':owner,'Content-Type':'application/json'},
   body:JSON.stringify({action,expectedVersion:version})});
  return {status:r.status,body:await r.json()};
 }
 try{
  reset();
  let r=await post('bob','approve');assert.equal(r.status,404);
  r=await post('alice','approve');assert.equal(r.status,409);
  assert.equal(draft.status,'proposed');assert.equal(enqueueCount,0);
  enabled=true;failEnqueue=true;
  r=await post('alice','approve');assert.notEqual(r.status,202);
  assert.equal(draft.status,'approved');assert.equal(draft.version,2);
  assert.equal(enqueueCount,1);assert.equal(created.id,'record-1');
  failEnqueue=false;
  r=await post('alice','approve',2);
  assert.equal(r.status,202);assert.equal(r.body.analysisId,'record-1');
  assert.equal(r.body.jobId,'record-1');assert.equal(enqueueCount,2);
  r=await post('alice','approve',2);
  assert.equal(r.status,202);assert.equal(r.body.jobId,'record-1');
  assert.equal(enqueueCount,3); // Bull dedupes actual jobId; this stub counts API add attempts.
  reset();enabled=true;
  r=await post('alice','dismiss');
  assert.equal(r.status,200);assert.equal(draft.status,'dismissed');
  assert.equal(enqueueCount,0);
 }finally{await new Promise(r=>server.close(r))}
});
