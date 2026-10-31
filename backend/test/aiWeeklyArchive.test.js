'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
function setup({observedThrough='2026-10-31T00:00:00Z',withoutExisting=false}={}){
 const handlers=new Map(),queued=[],created=new Map();
 let hidden=false;
 const existing={id:'weekly-failed',owner_id:'owner',status:'failed',
  date_range_start:period.start,date_range_end:period.end,
  filter_conditions:{weeklyReport:'v1'}};
 const records={
  listWeeklyReportRecords:async owner=>owner==='owner'?
    (created.size?[...created.values()]:hidden||withoutExisting?[]:[existing]):[],
  hasHiddenWeeklyReport:async(owner,p)=>owner==='owner'&&hidden&&
    p.start===period.start&&p.end===period.end,
  getArchivedFailedWeeklyReport:async(owner,p)=>owner==='owner'&&hidden&&
    p.start===period.start&&p.end===period.end?
    {id:existing.id,request_key:'weekly:completed'}:null,
  createWeeklyReportRecord:async({requestKey,conditions})=>{
   if(created.has(requestKey))return {record:created.get(requestKey),created:false};
   if(requestKey==='weekly:completed')
    return {record:{...existing,filter_conditions:{
     weeklyReport:'v1',...(hidden?{hiddenFromHistory:true}:{})}},created:false};
   const record={id:'new-weekly',status:'pending',date_range_start:period.start,
    date_range_end:period.end,filter_conditions:conditions};
   created.set(requestKey,record);return {record,created:true};
  },
  updateAnalysisStatus:async()=>{}
 };
 const express={Router:()=>new Proxy({}, {get(_,key){
  if(['get','post','put','patch','delete'].includes(key))
   return (url,fn)=>handlers.set(key.toUpperCase()+' '+url,fn);
 }})};
 const dependencies={
  express,
  '../ai/growth/workspace/store':{workspaceStore:()=>({})},
  '../ai/growth/workspace/period':{currentMonth:()=>period},
  '../ai/growth/workspace/contracts':{requiredString:()=>''},
  '../db/aiRecords':records,
  '../ai/growth/weeklyReport':{
   weeklyPeriod:()=>period,reportPeriod:()=>period,reportKey:()=> 'weekly:completed',weeklyKey:()=> 'weekly:completed',
   weeklyOperations:()=>({goalsCount:0})},
  '../queues/queues':{addAIAnalysisJob:async(_type,_payload,opts)=>{
   queued.push(opts.jobId);return {id:opts.jobId}
  }}
 };
 const source=fs.readFileSync(path.join(__dirname,'../src/routes/growthWorkspace.js'),'utf8');
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,
  require:key=>{if(!Object.hasOwn(dependencies,key))throw Error('Unhandled dependency '+key);
   return dependencies[key]},
  Date,Number,String,JSON,Object,Error,RegExp,console});
 module.exports.createRouter({db:{},readReportSourceStatus:async()=>({as_of:observedThrough})});
 async function request(method,url,owner='owner',body={}){
  let status=200,json;
  const res={status(code){status=code;return this},json(value){json=value;return this}};
  await handlers.get(method+' '+url)({user:{user_id:owner},body,query:{}},res);
  return {status,json};
 }
 return {request,queued,archive:()=>{hidden=true}};
}
test('failed report disappears from weekly list but keeps archived-current-week marker',async()=>{
 const fixture=setup();
 const before=await fixture.request('GET','/ai-weekly-reports');
 assert.equal(before.json.reports.length,1);
 assert.equal(before.json.archivedCurrentWeek,false);
 fixture.archive();
 const after=await fixture.request('GET','/ai-weekly-reports');
 assert.equal(after.json.reports.length,0);
 assert.equal(after.json.archivedCurrentWeek,true);
});
test('archiving a failure restores a new generate action, but requires an explicit paid attempt',async()=>{
 const fixture=setup();
 fixture.archive();
 const view=await fixture.request('GET','/ai-weekly-reports');
 assert.equal(view.json.canRegenerateArchivedFailed,true);
 const unconfirmed=await fixture.request('POST','/ai-weekly-reports');
 assert.equal(unconfirmed.status,409);
 assert.match(unconfirmed.json.error,/重新生成 AI 周报/);
 assert.equal(fixture.queued.length,0);
 const first=await fixture.request('POST','/ai-weekly-reports','owner',
  {regenerateArchivedFailed:true});
 assert.equal(first.status,202);
 assert.equal(first.json.analysisId,'new-weekly');
 assert.deepEqual(fixture.queued,['new-weekly']);
 const second=await fixture.request('POST','/ai-weekly-reports','owner',
  {regenerateArchivedFailed:true});
 assert.equal(second.json.reused,true);
 assert.equal(fixture.queued.length,1);
 const after=await fixture.request('GET','/ai-weekly-reports');
 assert.equal(after.json.canRegenerateArchivedFailed,false);
 assert.equal(after.json.reports.length,1);
});
test('the archived indicator remains scoped to the owner',async()=>{
 const fixture=setup();
 fixture.archive();
 const result=await fixture.request('GET','/ai-weekly-reports','other');
 assert.equal(result.json.archivedCurrentWeek,false);
 assert.equal(result.json.canRegenerateArchivedFailed,false);
 assert.equal(result.json.reports.length,0);
});

test('late observed source blocks archived regeneration before persistence or paid queue',async()=>{
 const f=setup({observedThrough:'2026-10-20T00:00:00Z'});f.archive();
 const metadata=await f.request('GET','/ai-weekly-reports');
 assert.equal(metadata.json.sourceWatermark.coverageVerified,false);
 assert.equal(metadata.json.sourceWatermark.lastObservedAt,'2026-10-20T00:00:00.000Z');
 const refused=await f.request('POST','/ai-weekly-reports','owner',{regenerateArchivedFailed:true});
 assert.equal(refused.status,409);
 assert.match(refused.json.error,/未创建付费任务/);
 assert.equal(f.queued.length,0);
});

test('first creation rejects an end beyond observed source data before saving or billing',async()=>{
 const f=setup({observedThrough:'2026-10-20T00:00:00Z',withoutExisting:true});
 const failed=await f.request('POST','/ai-weekly-reports');
 assert.equal(failed.status,409);
 assert.match(failed.json.error,/未创建付费任务/);
 assert.equal(f.queued.length,0);
 const list=await f.request('GET','/ai-weekly-reports');
 assert.equal(list.json.reports.length,0);
});
test('missing observation time does not permit a paid report',async()=>{
 const f=setup({observedThrough:null,withoutExisting:true});
 const response=await f.request('POST','/ai-weekly-reports');
 assert.equal(response.status,409);
 assert.match(response.json.error,/无法核验/);
 assert.equal(f.queued.length,0);
});
