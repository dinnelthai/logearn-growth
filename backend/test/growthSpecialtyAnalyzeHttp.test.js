'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const recordsPath=require.resolve('../src/db/aiRecords');
const queuePath=require.resolve('../src/queues/queues');
let record=null,queued=0;
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 async createAnalysisRecord(input){
  if(record)return record;
  record={id:'analysis-seo-1',owner_id:input.ownerId,status:'pending',
   date_range_start:input.dateRangeStart,date_range_end:input.dateRangeEnd,
   business_scope:input.businessScope,user_question:input.userQuestion,
   filter_conditions:input.filterConditions};
  return record;
 }
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 async addAIAnalysisJob(name,data,opts){
  queued++;assert.equal(name,'business-analysis');assert.equal(data.analysisId,'analysis-seo-1');
  assert.equal(opts.jobId,'analysis-seo-1');assert.equal(opts.attempts,1);
  return {id:'analysis-seo-1'};
 },
 async getJobStatus(){return {exists:false}}
}};
const router=require('../src/routes/aiAnalysis');
const start=Date.parse('2026-10-18T00:00:00Z'),
 end=Date.parse('2026-10-20T00:00:00Z');
test('manual specialist AI selections require appropriate goal/source and do not cross-return completed request records',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 const standard={title:'SEO',analysisType:'optimization',
  dateRangeStart:start,dateRangeEnd:end,businessScope:{source:'all'},
  userQuestion:'Check real GSC evidence',focusGoal:'conversion',
  modelMode:'auto',requestKey:'special-1',skillId:'seo-organic'};
 async function post(body){
  const res=await fetch(base+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
 }
 try{
  let r=await post({...standard,businessScope:{source:'twitter'}});
  assert.equal(r.status,400);assert.equal(queued,0);
  r=await post({...standard,focusGoal:'retention'});
  assert.equal(r.status,400);assert.equal(queued,0);
  r=await post({...standard,skillId:'unknown-tool'});
  assert.equal(r.status,400);assert.equal(queued,0);
  r=await post(standard);
  assert.equal(r.status,202);assert.equal(record.filter_conditions.skillId,'seo-organic');
  assert.equal(queued,1);
  record.status='completed';
  r=await post({...standard,skillId:'kol-impact',focusGoal:'revenue'});
  assert.equal(r.status,409);assert.equal(queued,1);
  r=await post(standard);
  assert.equal(r.status,200);assert.equal(r.body.analysisId,'analysis-seo-1');
  assert.equal(queued,1);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
