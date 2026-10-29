'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),Module=require('node:module');
function setup(registry={listBusinessModules:()=>[{moduleId:'growth.activation',version:'1'}]}){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 require('../src/ai/growth/workspace/store').workspaceStore(db,{initialize:true});
 require('../src/ai/growth/opportunityStore').createOpportunityStore(db,{initialize:true});
 const handlers={},original=Module._load;
 Module._load=function(id,parent,isMain){if(id==='express')return {Router:()=>{const r={};for(const m of ['get','post','put','patch','delete'])r[m]=(p,f)=>{handlers[m.toUpperCase()+' '+p]=f};return r}};return original.call(this,id,parent,isMain)};
 try{delete require.cache[require.resolve('../src/routes/growthAgent')];require('../src/routes/growthAgent').createRouter({db,registry})}finally{Module._load=original}
 const run=async(key,{owner='alice',body={},params={}}={})=>{const res={code:200,status(n){this.code=n;return this},json(v){this.value=v;return this}};await handlers[key]({user:{user_id:owner},body,params,query:{}},res);return res};return {db,run};
}
test('accepted opportunity creates one owned proposed action and preserves evidence',async()=>{
 const {db,run}=setup();try{
  const period={start:Date.now()-86400000*7,end:Date.now()-86400000,timezone:'Asia/Bangkok'},scope={source:'all'};
  const {makeEvidence,createEvidenceStore}=require('../src/ai/business/evidence');const context={ownerId:'alice',scope,period};
  const evidence=makeEvidence({metricId:'active_users',value:12,coverage:{status:'verified'},watermarks:{events:new Date().toISOString()}},context);createEvidenceStore(db).save(evidence,context);
  const created=await run('POST /opportunities',{body:{moduleId:'growth.activation',subject:'激活',issue:'需要核查',action:'检查路径',hypothesis:'待验证',scope,period,evidenceIds:[evidence.id],confidence:'unknown',impact:{affectedUsers:null},effort:{hours:null}}});
  assert.equal(created.code,201);const id=created.value.id;
  assert.equal((await run('POST /opportunities/:id/promote',{params:{id},body:{assignee:'负责人'}})).code,409);
  const decision=await run('POST /opportunities/:id/status',{params:{id},body:{status:'accepted',expectedVersion:created.value.version,reason:'采纳调查'}});assert.equal(decision.code,200);
  assert.equal((await run('POST /opportunities/:id/promote',{owner:'bob',params:{id},body:{assignee:'负责人'}})).code,404);
  const first=await run('POST /opportunities/:id/promote',{params:{id},body:{assignee:'负责人'}});assert.equal(first.code,200,JSON.stringify(first.value));
  const second=await run('POST /opportunities/:id/promote',{params:{id},body:{assignee:'负责人'}});assert.equal(second.code,200);assert.equal(second.value.actionId,first.value.actionId);assert.equal(second.value.reused,true);
  const ws=require('../src/ai/growth/workspace/store').workspaceStore(db);assert.equal(ws.actions('alice',{limit:20}).length,1);assert.equal(ws.actions('bob',{limit:20}).length,0);assert.equal(first.value.externalActions,0);
 }finally{db.close()}
});
test('import accepts completed owned evidence and skips missing or foreign evidence without model calls',async()=>{
 const {db,run}=setup();try{
  const period={start:Date.now()-86400000*7,end:Date.now()-86400000,timezone:'Asia/Bangkok'},scope={source:'all'};
  const {makeEvidence,createEvidenceStore}=require('../src/ai/business/evidence');const context={ownerId:'alice',scope,period},store=createEvidenceStore(db);
  const evidence=makeEvidence({metricId:'funnel',value:{users:12},query:{tool:'get_funnel'}},context);store.save(evidence,context);
  const foreign=makeEvidence({metricId:'funnel',value:{users:3}},{...context,ownerId:'bob'});store.save(foreign,{...context,ownerId:'bob'});
  const record={status:'completed',business_scope:{source:'all'},date_range_start:period.start,date_range_end:period.end};
  const suggestion=(id,ids)=>({id,business_problem:'问题'+id,action:'核查路径',data_evidence:{evidenceIds:ids}});
  const mock={getAnalysisRecord:async(id,owner)=>owner==='alice'?{...record,status:id==='pending'?'processing':'completed'}:null,listSuggestionsByAnalysis:async()=>[suggestion('good',[evidence.id]),suggestion('missing',[]),suggestion('foreign',[foreign.id])]};
  const original=Module._load;Module._load=function(id,parent,isMain){if(id==='../db/aiRecords'&&parent?.filename.endsWith('/routes/growthAgent.js'))return mock;return original.call(this,id,parent,isMain)};
  try{
   assert.equal((await run('POST /opportunities/import-analysis/:id',{params:{id:'pending'}})).code,409);
   assert.equal((await run('POST /opportunities/import-analysis/:id',{owner:'bob',params:{id:'done'}})).code,404);
   const result=await run('POST /opportunities/import-analysis/:id',{params:{id:'done'}});assert.equal(result.code,200,JSON.stringify(result.value));
   assert.equal(result.value.inserted.length,1);assert.equal(result.value.skipped.length,2);assert.equal(result.value.modelCalls,0);
   const again=await run('POST /opportunities/import-analysis/:id',{params:{id:'done'}});assert.equal(again.value.inserted.length,0);
   const item=(await run('GET /opportunities/:id',{params:{id:result.value.inserted[0].id}})).value;
   assert.equal(item.moduleId,'growth.activation');assert.equal(item.moduleVersion,'1');assert.equal(item.origin.analysisId,'done');
  }finally{Module._load=original}
 }finally{db.close()}
});

test('separate investigations use separate query budgets',async()=>{
 const ids=[];const registry={listBusinessModules:()=>[{moduleId:'growth.activation',version:'1',status:'available',capabilities:[{id:'get_funnel',cost:'none'}]}],executeBusinessModule:async(_request,context)=>{ids.push(context.runId);return {status:'ok',evidenceIds:[]}}};
 const {db,run}=setup(registry);try{const end=Date.now()-86400000;const body={period:{start:end-86400000,end,timezone:'Asia/Bangkok'},moduleIds:['growth.activation']};await run('POST /business-modules/investigate',{body});await run('POST /business-modules/investigate',{body});assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);}finally{db.close()}
});
