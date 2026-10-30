'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarizeExperience}=require('../src/ai/growth/experienceFeedback');
const {planGrowthInvestigation,formatPlanForPrompt}=require('../src/ai/growth/planner');
const now=Date.now();
const rows=[
 {user_status:'executed',effectiveness:'ineffective',reviewed_at:now-86400000,
  validation_metrics:{primary:'activation_rate'},applicable_scope:{source:'all'},
  result_summary:'Observed lower activation, no controlled experiment'},
 {user_status:'executed',effectiveness:'effective',reviewed_at:now-2*86400000,
  validation_metrics:{primary:'activation_rate'},applicable_scope:{source:'all'},
  result_summary:'Observed improvement only'},
 {user_status:'rejected',effectiveness:'ineffective',reviewed_at:now-86400000,
  validation_metrics:{primary:'active_users'},applicable_scope:{source:'all'}},
 {user_status:'executed',effectiveness:'ineffective',reviewed_at:now-86400000,
  validation_metrics:{primary:'unverified_metric'},applicable_scope:{source:'all'}},
 {user_status:'executed',effectiveness:'effective',reviewed_at:now-86400000,
  validation_metrics:{primary:'d7'},applicable_scope:{source:'twitter'}},
 {user_status:'executed',effectiveness:'ineffective',reviewed_at:now-200*86400000,
  validation_metrics:{primary:'active_users'},applicable_scope:{source:'all'}}
].map(row=>({...row,review_context_version:'1'}));
const report={business:{scope:{source:'all'}},period:{start:10,end:20},
 snapshot:{id:'s'},candidates:[{id:'x',metric:'activation_rate',priority:'P1',score:10}]};
test('only executed, measured, recent and scope compatible outcomes contribute to feedback',()=>{
 const value=summarizeExperience(rows,{source:'all',now});
 assert.equal(value.length,1);
 assert.equal(value[0].metric,'activation_rate');
 assert.equal(value[0].effectiveReviews,1);
 assert.equal(value[0].ineffectiveReviews,1);
 assert.match(value[0].interpretation,/不代表/);
 assert.equal(summarizeExperience(rows,{source:'twitter',now}).length,1);
});
test('planner adds relevant experience caveat without rewriting business evidence or asserting causality',()=>{
 const before=JSON.stringify(report);
 const plan=planGrowthInvestigation({goal:'activation',report,history:rows});
 assert.equal(plan.experienceFeedback.length,1);
 const skill=plan.steps.find(s=>s.skillId==='activation-funnel');
 assert.equal(skill.experienceChecks.length,1);
 assert.equal(skill.experienceChecks[0].observedIneffective,1);
 assert.match(formatPlanForPrompt(plan),/历史验证注意/);
 assert.equal(plan.requiresApprovalForActions,true);
 assert.equal(JSON.stringify(report),before);
});
test('unsafe input, expired evidence and unspecified metric IDs fail closed',()=>{
 assert.throws(()=>summarizeExperience({}),/输入无效/);
 assert.throws(()=>summarizeExperience(rows,{source:'all',lookbackDays:0}),/输入无效/);
 assert.deepEqual(summarizeExperience(rows,{source:'all',now:now+300*86400000}),[]);
});

test('mature observational reviews inform future investigation without claiming causal effectiveness',()=>{
 const history=[{review_context_version:'1',user_status:'executed',effectiveness:'unknown',reviewed_at:now-1000,
  validation_metrics:{primary:'activation_rate'},applicable_scope:{source:'all'},
  review_confidence:'medium',has_improvement:false,
  metric_changes:{activation_rate:{available:true,baseline:0.4,effect:0.3}}}];
 const result=summarizeExperience(history,{source:'all',now});
 assert.equal(result[0].ineffectiveReviews,1);
 assert.match(result[0].interpretation,/因果/);
});

test('a platform-wide review is not presented as a channel-specific outcome',()=>{
 const history=[{review_context_version:'1',user_status:'executed',effectiveness:'unknown',reviewed_at:now-1000,
  validation_metrics:{primary:'activation_rate'},applicable_scope:{source:'all'},
  review_confidence:'medium',has_improvement:false,
  metric_changes:{activation_rate:{available:true,baseline:0.4,effect:0.3}}}];
 assert.deepEqual(summarizeExperience(history,{source:'twitter',now}),[]);
});

test('unversioned historical reviews are excluded from learning',()=>{
 const row={user_status:'executed',effectiveness:'unknown',reviewed_at:now-1000,
  validation_metrics:{primary:'activation_rate'},applicable_scope:{source:'all'},
  review_confidence:'medium',has_improvement:false,
  metric_changes:{activation_rate:{available:true,baseline:0.4,effect:0.3}}};
 assert.deepEqual(summarizeExperience([row],{source:'all',now}),[]);
});

test('experience follows the executed action scope instead of the original suggestion scope',()=>{
 const row={review_context_version:'1',user_status:'executed',effectiveness:'unknown',reviewed_at:now-1000,
  validation_metrics:{primary:'activation_rate'},applicable_scope:{source:'all'},action_scope:{source:'twitter'},
  review_confidence:'medium',has_improvement:false,
  metric_changes:{activation_rate:{available:true,baseline:0.4,effect:0.3}}};
 assert.equal(summarizeExperience([row],{source:'twitter',now}).length,1);
 assert.equal(summarizeExperience([row],{source:'all',now}).length,0);
});
