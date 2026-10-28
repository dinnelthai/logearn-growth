'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../scripts/auditBusinessAnalysisE2E');
const id='791c561b-a26c-46e8-bb60-2e4173a49f6d';
test('read-only audit correlates persisted analysis with model usage and does not claim frontend success',async()=>{
 const sqls=[];
 const pool={query:async(sql,values)=>{
  assert.deepEqual(values,['alice',id].reverse().reverse()); // overridden below for record identity
  sqls.push(sql);
  if(sql.includes('ai_analysis_records'))return {rows:[{
   status:'completed',model_name:'gpt-6.1-terra',
   result:{summary:'actual insight',evidenceIds:['e1'],
    calls:[{traceId:'trace-1',modelTransportVersion:'aggregated-business-v1'}]}
  }]};
  if(sql.includes('ai_usage_logs'))return {rows:[{
   model_name:'gpt-6.1-terra',trace_id:'trace-1',total_tokens:139,
   input_tokens:100,output_tokens:39,cost_usd:'0.000020',cost_known:true}]};
  if(sql.includes('ai_suggestions'))return {rows:[{n:2}]};
  throw Error('unexpected SQL');
 }};
 // The analysis record uses analysis ID first; ledger and suggestion use owner first.
 pool.query=async(sql,values)=>{
  assert.equal(values.length,2);
  sqls.push(sql);
  if(sql.includes('ai_analysis_records')){
   assert.deepEqual(values,[id,'alice']);
   return {rows:[{id,status:'completed',model_name:'gpt-6.1-terra',
    result:{summary:'actual insight',evidenceIds:['e1'],
     calls:[{traceId:'trace-1',modelTransportVersion:'aggregated-business-v1'}]}}]};
  }
  assert.deepEqual(values,['alice',id]);
  if(sql.includes('ai_usage_logs'))return {rows:[{
   model_name:'gpt-6.1-terra',trace_id:'trace-1',total_tokens:139,
   input_tokens:100,output_tokens:39,cost_usd:'0.000020',cost_known:true}]};
  return {rows:[{n:2}]};
 };
 const r=await audit({ownerId:'alice',analysisId:id,pool});
 assert.equal(r.checks.savedAnalysis,'PASS');
 assert.equal(r.checks.costLedgerLinked,'PASS');
 assert.equal(r.checks.modelTransportV1,'PASS');
 assert.equal(r.checks.frontEndRendered,'BLOCKED');
 assert.equal(r.usage.totalTokens,139);
 assert.equal(r.suggestionCount,2);
 assert.equal(sqls.length,3);
 assert.ok(sqls.every(s=>/^SELECT/.test(s)));
});
test('a known failed business task cannot be reported as a completed end-to-end result',async()=>{
 const pool={query:async sql=>({
  rows:sql.includes('ai_analysis_records')?[{status:'failed',result:null}]:
   sql.includes('ai_usage_logs')?[{trace_id:'t',total_tokens:4069,cost_known:true}]:
   [{n:0}]
 })};
 const r=await audit({ownerId:'alice',analysisId:id,pool});
 assert.equal(r.recordStatus,'failed');
 assert.equal(r.checks.savedAnalysis,'FAIL');
 assert.equal(r.checks.frontEndRendered,'BLOCKED');
 assert.equal(r.checks.costLedgerLinked,'BLOCKED');
});
