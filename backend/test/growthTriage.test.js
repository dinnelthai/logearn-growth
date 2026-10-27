'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {detectGrowthSignals}=require('../src/ai/growth/triage');
const {planGrowthInvestigation}=require('../src/ai/growth/planner');
const report={
 business:{scope:{source:'all'}},period:{start:100,end:200},snapshot:{id:'s1'},
 warnings:['历史覆盖未确认'],
 candidates:[
  {id:'users',metric:'active_users',priority:'P0',score:80,current:70,previous:100,absolute:-30,change:-0.3},
  {id:'weekly_core',metric:'weekly_core',priority:'P1',score:50,current:40,gap:10},
  {id:'unchanged',metric:'new_users',priority:'P2',score:2,current:12,previous:12,absolute:0,change:0},
  {id:'untrusted',metric:'arbitrarySQL',priority:'P0',score:999,absolute:-1000,change:-1}
 ]};
test('only established candidate metrics and meaningful movements become investigation signals',()=>{
 const original=JSON.stringify(report),t=detectGrowthSignals(report);
 assert.equal(t.signals.length,2);
 assert.equal(t.signals[0].direction,'decline');
 assert.equal(t.signals[0].priority,'P0');
 assert.equal(t.signals[0].evidence.absolute,-30);
 assert.equal(t.signals[0].causalClaim,false);
 assert.equal(t.signals[0].quality,'needs-data-quality-review');
 assert.equal(t.signals[1].direction,'goal-gap');
 assert.equal(t.signals[1].evidence.previous,null);
 assert.equal(JSON.stringify(report),original);
});
test('same report gives stable IDs; different snapshots do not',()=>{
 const first=detectGrowthSignals(report);
 assert.deepEqual(first,detectGrowthSignals(report));
 assert.notEqual(first.signals[0].id,detectGrowthSignals({...report,snapshot:{id:'s2'}}).signals[0].id);
});
test('planner attaches signals without autonomous actions or tools outside registry',()=>{
 const p=planGrowthInvestigation({goal:'activation',report});
 assert.equal(p.triage.signals.length,2);
 assert.equal(p.requiresApprovalForActions,true);
 assert.ok(p.steps.every(step=>step.mode==='read-only'));
});
test('missing candidates or invalid bounds fail closed',()=>{
 assert.throws(()=>detectGrowthSignals({...report,candidates:null}),/现有业务报告/);
 assert.throws(()=>detectGrowthSignals(report,{maxSignals:200}),/参数无效/);
});
