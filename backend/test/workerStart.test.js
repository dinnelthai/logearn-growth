'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {claimSafeAnalysis}=require('../src/ai/business/workerStart');
const base={id:'analysis-1',owner_id:'alice',status:'pending'};
function fixture({status='pending',calls=[],win=true}={}){
 let claims=0,reads=0;
 const records={
  async getAnalysisRecord(_id,owner){return owner==='alice'?{...base,status,result:{summary:'saved'}}:null},
  async hasAnalysisPaidCalls(){return false},
  async claimAnalysisExecution(){claims++;return win?{...base,status:'processing'}:null}
 };
 const traceStore={list(owner,id){reads++;assert.equal(owner,'alice');assert.equal(id,'analysis-1');return calls}};
 return {records,traceStore,get claims(){return claims},get reads(){return reads}};
}
const run=f=>claimSafeAnalysis({analysisId:'analysis-1',ownerId:'alice',records:f.records,traceStore:f.traceStore});
test('atomic pending claim is required before executing expensive work',async()=>{
 const f=fixture();const r=await run(f);
 assert.equal(r.action,'claimed');assert.equal(f.claims,1);assert.equal(f.reads,1);
});
test('second worker losing PostgreSQL claim cannot start paid work',async()=>{
 const f=fixture({win:false});
 await assert.rejects(run(f),/其他 Worker/);
 assert.equal(f.claims,1);
});
test('received and ambiguous paid-call journals prevent a new claim',async()=>{
 for(const status of ['started','unknown','received']){
  const f=fixture({calls:[{round:0,status}]});
  await assert.rejects(run(f),/已有模型调用/);
  assert.equal(f.claims,0);
 }
});
test('running/failed records are never claimed by a new Bull delivery',async()=>{
 for(const status of ['processing','failed']){
  const f=fixture({status});
  await assert.rejects(run(f),/禁止重复执行/);
  assert.equal(f.claims,0);
 }
});
test('completed tasks return saved result without reading journal',async()=>{
 const f=fixture({status:'completed'});
 const r=await run(f);
 assert.equal(r.action,'completed');assert.deepEqual(r.result,{summary:'saved'});
 assert.equal(f.reads,0);assert.equal(f.claims,0);
});
test('owner mismatch and journal read errors fail without claiming',async()=>{
 const f=fixture();const unauthorized=await claimSafeAnalysis({analysisId:'analysis-1',ownerId:'bob',records:f.records,traceStore:f.traceStore}).then(()=>null,e=>e);
 assert.equal(unauthorized.status,404);assert.equal(f.reads,0);
 f.traceStore.list=()=>{throw Error('SQLite inaccessible')};
 await assert.rejects(run(f),/SQLite inaccessible/);
 assert.equal(f.claims,0);
});

test('centralized paid-call history blocks work even if local SQLite is empty',async()=>{
 const f=fixture();f.records.hasAnalysisPaidCalls=async()=>true;
 await assert.rejects(run(f),/共享模型调用/);assert.equal(f.claims,0);assert.equal(f.reads,0);
});
