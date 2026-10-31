'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
function harness({oldStatus='completed',oldOwner='owner',oldPeriod=period}={}){
 const routes=new Map(),queued=[],created=new Map(),updates=[];
 const old={id:'weekly-original',owner_id:oldOwner,status:oldStatus,
  date_range_start:oldPeriod.start,date_range_end:oldPeriod.end,
  user_question:'核对真实增长、SEO、留存',filter_conditions:{weeklyReport:'v1'}};
 const records={
  getAnalysisRecord:async(id,owner)=>id===old.id&&owner===oldOwner?old:null,
  listWeeklyReportRecords:async owner=>owner===oldOwner?
   [...created.values()].reverse().map(r=>({
    ...r,weekly_reissue_of:r.filter_conditions.weeklyReissueOf
   })).concat([old]):[],
  createWeeklyReportRecord:async({ownerId,requestKey,start,end,conditions,question})=>{
   if(created.has(requestKey))return {record:created.get(requestKey),created:false};
   const row={id:'fresh-report',owner_id:ownerId,status:'pending',
    date_range_start:start,date_range_end:end,request_key:requestKey,
    user_question:question,filter_conditions:conditions};
   created.set(requestKey,row);return {record:row,created:true};
  },
  updateAnalysisStatus:async(...args)=>updates.push(args)
 };
 const store={};
 const deps={
  express:{Router:()=>new Proxy({}, {get(_t,method){
   if(['get','post','delete','patch','put'].includes(method))
    return (url,fn)=>routes.set(method.toUpperCase()+' '+url,fn);
  }})},
  '../ai/growth/workspace/store':{workspaceStore:()=>store},
  '../ai/growth/workspace/period':{currentMonth:()=>period},
  '../ai/growth/workspace/contracts':{requiredString:()=>''},
  '../db/aiRecords':records,
  '../ai/growth/weeklyReport':{
   weeklyPeriod:()=>period,reportKey:()=> 'weekly:2026-10-19',weeklyKey:()=> 'weekly:2026-10-19',
   weeklyOperations:()=>({goalsCount:0,executedActionCount:0})},
  '../queues/queues':{addAIAnalysisJob:async(_name,payload,options)=>{
   queued.push({payload,options});return {id:options.jobId}
  }}
 };
 const content=fs.readFileSync(path.join(__dirname,'../src/routes/growthWorkspace.js'),'utf8');
 const mod={exports:{}};
 vm.runInNewContext(content,{
  module:mod,exports:mod.exports,
  require:name=>{if(!Object.hasOwn(deps,name))throw Error('Unmocked '+name);return deps[name]},
  Date,Number,String,JSON,Object,Error,RegExp,console
 });
 mod.exports.createRouter({db:{}});
 async function submit({owner='owner',id='weekly-original',ack=true}={}){
  let code=200,body;
  const res={status(value){code=value;return this},json(data){body=data;return this}};
  await routes.get('POST /ai-weekly-reports/:id/regenerate')({
   user:{user_id:owner},params:{id},body:{acceptPotentialDuplicateCharge:ack}
  },res);
  return {status:code,body};
 }
 return {submit,old,created,queued,updates};
}
test('only explicit confirmation creates one independent report and exactly one queue job',async()=>{
 const env=harness();
 const missing=await env.submit({ack:false});
 assert.equal(missing.status,400);
 assert.equal(env.queued.length,0);
 const first=await env.submit();
 assert.equal(first.status,202);
 assert.equal(first.body.analysisId,'fresh-report');
 assert.equal(env.queued.length,1);
 assert.equal(env.queued[0].payload.analysisId,'fresh-report');
 assert.equal(env.queued[0].payload.userQuestion,env.old.user_question);
 assert.equal(env.queued[0].options.attempts,1);
 const newRecord=[...env.created.values()][0];
 assert.equal(newRecord.filter_conditions.weeklyReissueOf,env.old.id);
 assert.equal(newRecord.filter_conditions.weeklyRegeneration,'explicit-v1');
 assert.equal(newRecord.filter_conditions.weeklyOperations.goalsCount,0);
 assert.equal(env.old.status,'completed');
 assert.equal(env.updates.length,0);
 const repeated=await env.submit();
 assert.equal(repeated.body.reused,true);
 assert.equal(repeated.body.analysisId,'fresh-report');
 assert.equal(env.queued.length,1);
});
test('only owner-owned weekly reports can be regenerated',async()=>{
 const env=harness();
 assert.equal((await env.submit({owner:'other'})).status,404);
 assert.equal((await env.submit({id:'not-a-weekly'})).status,404);
 assert.equal(env.queued.length,0);
});
test('running weekly tasks cannot start another paid generation',async()=>{
 for(const status of ['pending','processing']){
  const env=harness({oldStatus:status});
  assert.equal((await env.submit()).status,409);
  assert.equal(env.queued.length,0);
 }
});
test('previous calendar weeks are rejected rather than silently regenerated as current',async()=>{
 const env=harness({oldPeriod:{start:period.start-7*86400000,
  end:period.end-7*86400000}});
 assert.equal((await env.submit()).status,409);
 assert.equal(env.queued.length,0);
});
test('a failed weekly report can start a separate acknowledged run without clearing its ledger',async()=>{
 const env=harness({oldStatus:'failed'});
 const result=await env.submit();
 assert.equal(result.status,202);
 assert.equal(env.old.status,'failed');
 assert.equal(env.queued.length,1);
});
