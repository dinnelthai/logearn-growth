'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DEFINITIONS}=require('../src/ai/growth/weeklyCoverage');
const {auditSavedWeeklyContext}=require('../src/ai/business/savedContextAudit');
const period={start:1000000,end:1604800000,previousStart:-603800000,previousEnd:1000000,timezone:'Asia/Bangkok'};
function snapshot(){
 return {weeklyReportContractVersion:'weekly-report-v2',
  business:{scope:{source:'all'},focusGoal:'activation',question:'private@example.test'},
  period,snapshot:{id:'raw-snapshot'},current:{totals:{active_users:71}},
  previous:{totals:{active_users:82}},
  evidence:[{id:'ev-1',metricId:'active_users',value:71,period:{
   start:period.start,end:period.end},coverage:{status:'partial'}}],
  weeklyCoverage:{version:'weekly-coverage-v1',modules:DEFINITIONS.map(x=>({
   id:x.id,status:'not-investigated',evidenceIds:[],facts:[]}))},
  capabilities:[],candidates:[],growth:{},definitions:{},weekly:{},warnings:[]};
}
function harness(records){
 const routes=new Map(),reads=[];
 const deps={
  express:{Router:()=>new Proxy({}, {get(_,method){
   if(['get','post','put','patch','delete'].includes(method))
    return(url,fn)=>routes.set(method.toUpperCase()+' '+url,fn)
  }})},
  '../ai/growth/workspace/store':{workspaceStore:()=>({})},
  '../ai/growth/workspace/period':{currentMonth:()=>period},
  '../ai/growth/workspace/contracts':{requiredString:()=>''},
  '../db/aiRecords':{
   getAnalysisRecord:async(id,owner)=>{reads.push([id,owner]);return records[id]?.owner_id===owner?records[id]:null},
   listWeeklyReportRecords:async()=>[],hasHiddenWeeklyReport:async()=>false,
   getArchivedFailedWeeklyReport:async()=>null
  },
  '../ai/business/savedContextAudit':{auditSavedWeeklyContext},
  '../ai/growth/weeklyReport':{reportPeriod:()=>period}
 };
 const src=fs.readFileSync(path.join(__dirname,'../src/routes/growthWorkspace.js'),'utf8');
 const mod={exports:{}};
 vm.runInNewContext(src,{module:mod,exports:mod.exports,
  require:name=>{if(!Object.hasOwn(deps,name))throw Error('Unapproved side effect: '+name);
   return deps[name]},Date,Number,String,Object,JSON,Error,RegExp,console});
 mod.exports.createRouter({db:{}});
 async function get(id,owner='alice'){
  let code=200,body;
  const res={status(n){code=n;return this},json(x){body=x;return this}};
  await routes.get('GET /ai-weekly-reports/:id/snapshot-audit')({
   user:owner?{user_id:owner}:null,params:{id},query:{},body:{}},res);
  return {code,body};
 }
 return {get,reads};
}
test('owner-scoped v5 snapshot audit uses only stored data and never exposes raw identifiers or metrics',async()=>{
 const snap=snapshot(),raw=JSON.stringify(snap);
 const env=harness({v5:{owner_id:'alice',status:'completed',
  filter_conditions:{weeklyReport:'v1'},context_payload:raw}});
 const v=await env.get('v5');
 assert.equal(v.code,200);
 assert.equal(v.body.audit.status,'snapshot-contract-ready',JSON.stringify(v.body.audit.checks));
 assert.equal(v.body.audit.checks.exactThirteenModules,true);
 assert.equal(v.body.liveSourceAcceptance,'not-verified');
 assert.equal(v.body.modelCalls,0);assert.equal(v.body.externalSourceCalls,0);
 assert.equal(v.body.readOnly,true);
 assert.deepEqual(env.reads,[['v5','alice']]);
 assert.doesNotMatch(JSON.stringify(v.body),/private@example.test|raw-snapshot|ev-1|active_users.*71/);
 assert.equal(JSON.stringify(snap),raw);
});
test('historical 12-module v4 never passes as v5, even if completed',async()=>{
 const old=snapshot();delete old.weeklyReportContractVersion;old.weeklyCoverage.modules.pop();
 const env=harness({old:{owner_id:'alice',status:'completed',
  filter_conditions:{weeklyReport:'v1'},data_snapshot:old}});
 const v=await env.get('old');
 assert.equal(v.code,200);assert.equal(v.body.audit.status,'snapshot-contract-incomplete');
 assert.equal(v.body.audit.checks.pinnedV5Report,false);
 assert.equal(v.body.audit.checks.exactThirteenModules,false);
 assert.equal(v.body.modelCalls,0);
});
test('missing owner, non-weekly records and unauthenticated requests fail closed',async()=>{
 const env=harness({a:{owner_id:'alice',status:'completed',
  filter_conditions:{weeklyReport:'v1'},context_payload:snapshot()},
 b:{owner_id:'alice',status:'completed',filter_conditions:{},context_payload:snapshot()}});
 assert.equal((await env.get('a','bob')).code,404);
 assert.equal((await env.get('a',null)).code,401);
 assert.equal((await env.get('b')).code,404);
 assert.equal((await env.get('missing')).code,404);
});
test('corrupt private JSON fails without leaking stored text',async()=>{
 const env=harness({bad:{owner_id:'alice',status:'failed',
  filter_conditions:{weeklyReport:'v1'},context_payload:'{private@example.test'}});
 const v=await env.get('bad');
 assert.equal(v.code,200);
 assert.equal(v.body.audit.status,'snapshot-contract-incomplete');
 assert.doesNotMatch(JSON.stringify(v.body),/private@example.test/);
});
