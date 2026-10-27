'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildGrowthInbox}=require('../src/ai/growth/inbox');
const NOW=Date.parse('2026-10-27T12:00:00Z');
test('inbox only lists actionable existing records with deterministic priority',()=>{
 const analyses=[{id:'failed-1',status:'failed',created_at:NOW-10000},{id:'good',status:'completed',created_at:NOW-10000},
  {id:'slow',status:'processing',created_at:NOW-7200000}];
 const suggestions=[
  {id:'approve',analysis_id:'good',priority:'P0',user_status:'pending',business_problem:'激活漏斗'},
  {id:'run',analysis_id:'good',priority:'P1',user_status:'executing',business_problem:'执行活动'},
  {id:'closed',priority:'P0',user_status:'rejected'}];
 const reviewEntries=[{suggestionId:'s',analysisId:'good',priority:'P1',title:'复盘',status:'ready'},
  {suggestionId:'wait',status:'waiting'}];
 const snapshot=JSON.stringify({analyses,suggestions,reviewEntries});
 const result=buildGrowthInbox({analyses,suggestions,reviewEntries,now:NOW});
 assert.equal(result.counts.total,5);
 assert.equal(result.counts.approval,1);
 assert.equal(result.counts.review,1);
 assert.equal(result.counts.failed,1);
 assert.equal(result.tasks[0].priority,'P0');
 assert.equal(result.readOnly,true);
 assert.equal(result.paidCalls,0);
 assert.equal(result.externalActions,0);
 assert.equal(JSON.stringify({analyses,suggestions,reviewEntries}),snapshot);
});
test('failed analyses cannot accidentally restart or mutate records',()=>{
 const tasks=buildGrowthInbox({analyses:[{id:'a',status:'failed'}],now:NOW}).tasks;
 assert.equal(tasks[0].status,'review-required');
 assert.match(tasks[0].guidance,/禁止/);
});
test('invalid inputs are rejected',()=>{
 assert.throws(()=>buildGrowthInbox({analyses:{},now:NOW}),/输入无效/);
 assert.throws(()=>buildGrowthInbox({now:NaN}),/输入无效/);
});
