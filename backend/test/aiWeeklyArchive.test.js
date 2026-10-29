'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
function setup(){
 const handlers=new Map(),queued=[];
 let hidden=false;
 const existing={id:'weekly-failed',owner_id:'owner',status:'failed',
  date_range_start:period.start,date_range_end:period.end,
  filter_conditions:{weeklyReport:'v1'}};
 const records={
  listWeeklyReportRecords:async owner=>owner==='owner'&&!hidden?[existing]:[],
  hasHiddenWeeklyReport:async(owner,p)=>owner==='owner'&&hidden&&
    p.start===period.start&&p.end===period.end,
  createWeeklyReportRecord:async()=>({
   record:{...existing,filter_conditions:{
    weeklyReport:'v1',...(hidden?{hiddenFromHistory:true}:{})}},created:false
  }),
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
   weeklyPeriod:()=>period,weeklyKey:()=> 'weekly:completed',
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
 module.exports.createRouter({db:{}});
 async function request(method,url,owner='owner'){
  let status=200,json;
  const res={status(code){status=code;return this},json(value){json=value;return this}};
  await handlers.get(method+' '+url)({user:{user_id:owner},body:{}},res);
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
test('archiving a failed report does not unlock a duplicate paid job',async()=>{
 const fixture=setup();
 fixture.archive();
 const result=await fixture.request('POST','/ai-weekly-reports');
 assert.equal(result.status,409);
 assert.match(result.json.error,/不会自动重发/);
 assert.equal(fixture.queued.length,0);
});
test('the archived indicator remains scoped to the owner',async()=>{
 const fixture=setup();
 fixture.archive();
 const result=await fixture.request('GET','/ai-weekly-reports','other');
 assert.equal(result.json.archivedCurrentWeek,false);
 assert.equal(result.json.reports.length,0);
});
