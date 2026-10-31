'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
function endpoint(){
 const registered=new Map(),jobs=[],saved=new Map();
 const original={id:'old',status:'failed',cancel_requested:false,
  date_range_start:period.start,date_range_end:period.end,
  error_message:'OpenAI error: Request timed out.',
  user_question:'Create weekly operations report',
  filter_conditions:{weeklyReport:'v1',focusGoal:'activation',modelMode:'auto'}};
 let paidStatus='unknown';
 const records={
  getAnalysisRecord:async(id,owner)=>id==='old'&&owner==='alice'?original:null,
  listAnalysisPaidCalls:async()=>[{round:0,status:'received'},{round:1,status:paidStatus}],
  createWeeklyReportRecord:async({requestKey,conditions})=>{
   if(saved.has(requestKey))return {record:saved.get(requestKey),created:false};
   const record={id:'new-report',status:'pending',filter_conditions:conditions};
   saved.set(requestKey,record);return {record,created:true};
  },
  updateAnalysisStatus:async()=>{}
 };
 const express={Router:()=>new Proxy({}, {get(_target,key){
  if(['get','post','put','patch','delete'].includes(key))
   return (name,handler)=>registered.set(key.toUpperCase()+' '+name,handler);
 }})};
 const deps={
  express,'../ai/growth/workspace/store':{workspaceStore:()=>({})},
  '../ai/growth/workspace/period':{currentMonth:()=>period},
  '../ai/growth/workspace/contracts':{requiredString:()=>''},
  '../db/aiRecords':records,
  '../ai/growth/weeklyReport':{weeklyPeriod:()=>period,reportKey:p=>'weekly:'+p.start,weeklyKey:p=>'weekly:'+p.start},
  '../queues/queues':{addAIAnalysisJob:async(_type,_payload,opts)=>{
   jobs.push(opts.jobId);return {id:opts.jobId};
  }}
 };
 const code=fs.readFileSync(path.join(__dirname,'../src/routes/growthWorkspace.js'),'utf8');
 const mod={exports:{}};
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:id=>{
  if(!Object.hasOwn(deps,id))throw Error('Unexpected dependency '+id);
  return deps[id];
 },Date,Number,String,JSON,Object,Error,RegExp,console});
 mod.exports.createRouter({db:{}});
 const handler=registered.get('POST /ai-weekly-reports/:id/new-attempt');
 assert.equal(typeof handler,'function');
 async function invoke({owner='alice',ack=true}={}){
  let status=200,body;
  const req={user:{user_id:owner},params:{id:'old'},
   body:{acceptPotentialDuplicateCharge:ack}};
  const res={status(v){status=v;return this},json(v){body=v;return this}};
  await handler(req,res);
  return {status,body};
 }
 return {invoke,jobs,original,setPaidStatus:v=>{paidStatus=v}};
}
test('new paid attempt requires explicit acknowledgement and correct owner',async()=>{
 const env=endpoint();
 assert.equal((await env.invoke({ack:false})).status,400);
 assert.equal((await env.invoke({owner:'other'})).status,404);
 assert.equal(env.jobs.length,0);
});
test('unknown prior timeout is allowed once, leaving original record unchanged',async()=>{
 const env=endpoint();
 const first=await env.invoke();
 const second=await env.invoke();
 assert.equal(first.status,202);
 assert.equal(second.body.reused,true);
 assert.deepEqual(env.jobs,['new-report']);
 assert.equal(env.original.status,'failed');
 assert.equal(env.original.error_message,'OpenAI error: Request timed out.');
});
test('confirmed paid call without uncertain status is not a reason to reissue',async()=>{
 const env=endpoint();env.setPaidStatus('received');
 assert.equal((await env.invoke()).status,409);
 assert.equal(env.jobs.length,0);
});
test('a second unknown timeout cannot recursively produce unlimited reruns',async()=>{
 const env=endpoint();env.original.filter_conditions.weeklyReissueOf='first-attempt';
 assert.equal((await env.invoke()).status,409);
 assert.equal(env.jobs.length,0);
});
