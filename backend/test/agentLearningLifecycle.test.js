'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {judgeHistory,proposeStrategy}=require('../src/ai/growth/agentLearning');
const now=Date.parse('2026-10-31T00:00:00Z');
function row(id,improved){
 return {suggestion_id:'s-'+id,retrospective_id:'r-'+id,analysis_id:'a-'+id,
  user_status:'executed',review_context_version:'1',executed_at:now-10*86400000,
  reviewed_at:now-2*86400000,validation_metrics:{primary:'new_users'},
  metric_changes:{new_users:{available:true,baseline:100,effect:improved?120:90}},
  confidence:'medium',has_improvement:improved,filter_conditions:{focusGoal:'activation'},
  action_scope:{source:'all'}};
}
test('learning judges only executed mature retrospective records with a supported metric',()=>{
 const values=judgeHistory([row('yes',true),row('no',false),
  {...row('missing',true),retrospective_id:null},
  {...row('future',true),reviewed_at:now+1}],{now});
 assert.deepEqual(values.map(x=>x.assessment),['observed-supported','observed-contradicted']);
});
test('learning strategy is scoped, versioned, expires and preserves counter-evidence',()=>{
 const values=judgeHistory([row('no1',false),row('no2',false),row('yes',true)],{now});
 const strategy=proposeStrategy(values,{goal:'activation',source:'all',now});
 assert.equal(strategy.policy.version,'evidence-first-strategy-v4');
 assert.equal(strategy.policy.validUntil,now+30*86400000);
 assert.deepEqual(strategy.policy.scope,{goal:'activation',source:'all'});
 assert.deepEqual(strategy.policy.focusMetrics,['new_users']);
 assert.equal(strategy.evidence.counterEvidence[0].observedContradicted,2);
 assert.equal(strategy.policy.requireHumanApproval,true);
 assert.equal(strategy.policy.autoExternalActions,false);
 assert.ok(strategy.policy.rollback);
});
test('learning strategy validity period is bounded and cannot be negative',()=>{
 const values=judgeHistory([row('no1',false),row('no2',false)],{now});
 assert.throws(()=>proposeStrategy(values,{goal:'activation',now,ttlDays:0}),/有效期/);
 assert.throws(()=>proposeStrategy(values,{goal:'activation',now,ttlDays:91}),/有效期/);
});
