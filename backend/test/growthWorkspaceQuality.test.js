'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
test('problem quality metrics remain unknown until reviewed; a repeated review is idempotent',()=>{
 const db=new DatabaseSync(':memory:');try{
  const store=workspaceStore(db,{clock:()=>Date.parse('2026-10-28T00:00:00Z'),initialize:true});
  assert.equal(store.qualitySummary('alice').falsePositiveRate,null);
  const p=store.observeProblem('alice',{type:'business',subject:'retention',description:'有待查证的留存变化',scope:{source:'all'}});
  assert.equal(store.reviewProblem('alice',p.id,'false-positive','无成熟数据').verdict,'false-positive');
  const v=store.qualitySummary('alice');assert.equal(v.reviewSampleSize,1);assert.equal(v.falsePositiveRate,1);
  assert.equal(store.reviewProblem('alice',p.id,'false-positive','无成熟数据').reused,true);
  assert.throws(()=>store.reviewProblem('bob',p.id,'true-positive',''),/不存在/);
 }finally{db.close()}
});
test('resolved source gap requires concrete verified recovery rather than a mere connection flag',()=>{
 const db=new DatabaseSync(':memory:');try{
  const s=workspaceStore(db,{clock:()=>Date.parse('2026-10-28T00:00:00Z'),initialize:true});
  const p=s.observeProblem('alice',{type:'data-quality',subject:'source:gsc',scope:{source:'gsc'},description:'GSC data unavailable'});
  const asOf=Date.parse('2026-10-28T00:00:00Z');
  assert.equal(s.reconcileSource('alice','gsc',{state:'connected',coverage:'unknown',asOf}).resolved,false);
  assert.equal(s.reconcileSource('alice','gsc',{state:'connected',coverage:'verified',asOf}).resolved,true);
  assert.equal(s.problem('alice',p.id).status,'resolved');
 }finally{db.close()}
});
