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

test('experience feedback uses fixed-cohort evidence for v2 reviews without falling back to whole-business metrics',()=>{
 const history=[{review_context_version:'2',user_status:'executed',effectiveness:'unknown',
  reviewed_at:now-1000,confidence:'medium',has_improvement:true,
  validation_metrics:{primary:'active_users'},action_scope:{source:'all'},
  metric_changes:{active_users:{available:true,baseline:900,effect:100}},
  baseline_data:{reviewContextVersion:2,operationTaskCohort:{status:'available',
   metrics:{analysis_users:20,requested_users:30,unmatched_users:0}}},
  effect_data:{operationTaskCohort:{analysis_users:25,requested_users:30,unmatched_users:0}},
  result_summary:'Fixed cohort analysis activity increased'}];
 const result=summarizeExperience(history,{source:'all',now});
 assert.equal(result.length,1);
 assert.equal(result[0].effectiveReviews,1);
 assert.equal(result[0].observedSupportedReviews,1);
 assert.equal(result[0].outcomeBasis,'fixed-cohort-observation');
 assert.match(result[0].interpretation,/不代表/);
});
test('experience feedback excludes v2 cohort records without complete coverage or direct metric equivalence',()=>{
 const history=[{review_context_version:'2',user_status:'executed',effectiveness:'unknown',
  reviewed_at:now-1000,confidence:'medium',has_improvement:true,
  validation_metrics:{primary:'new_users'},action_scope:{source:'all'},
  baseline_data:{reviewContextVersion:2,operationTaskCohort:{status:'available',
   metrics:{analysis_users:20,requested_users:30,unmatched_users:0}}},
  effect_data:{operationTaskCohort:{analysis_users:25,requested_users:30,unmatched_users:0}}}];
 const result=summarizeExperience(history,{source:'all',now});
 assert.equal(result.length,1);
 assert.equal(result[0].insufficientReviews,1);
 assert.equal(result[0].recentLessons[0].reason,'primary-metric-has-no-direct-cohort-equivalent');
});

test('planner carries exact previously contradicted action into a no-blind-repeat instruction',()=>{
 const history=[{review_context_version:'2',user_status:'executed',effectiveness:'unknown',
  suggestion_id:'suggestion-repeat',reviewed_at:now-1000,confidence:'medium',has_improvement:false,
  validation_metrics:{primary:'active_users'},action_scope:{source:'all'},
  business_problem:'新用户没有完成首次分析',actual_action:'给新用户发送首次分析引导弹窗',
  baseline_data:{reviewContextVersion:2,operationTaskCohort:{status:'available',
   metrics:{analysis_users:30,requested_users:40,unmatched_users:0}}},
  effect_data:{operationTaskCohort:{analysis_users:27,requested_users:40,unmatched_users:0}},
  result_summary:'固定人群分析用户减少'}];
 const plan=planGrowthInvestigation({goal:'activation',report,history});
 const overview=plan.steps.find(step=>step.skillId==='growth-overview');
 assert.equal(overview.experienceChecks[0].observedIneffective,1);
 assert.equal(overview.experienceChecks[0].priorActions[0].actualAction,'给新用户发送首次分析引导弹窗');
 const prompt=formatPlanForPrompt(plan);
 assert.match(prompt,/禁止原样重复同一行动/);
 assert.match(prompt,/给新用户发送首次分析引导弹窗/);
});
test('insufficient v2 review prioritizes evidence completion instead of treating the old action as disproved',()=>{
 const history=[{review_context_version:'2',user_status:'executed',effectiveness:'unknown',
  suggestion_id:'suggestion-unknown',reviewed_at:now-1000,confidence:'medium',has_improvement:true,
  validation_metrics:{primary:'new_users'},action_scope:{source:'all'},
  business_problem:'需要验证注册用户增长',actual_action:'增加注册引导内容',
  baseline_data:{reviewContextVersion:2,operationTaskCohort:{status:'available',
   metrics:{analysis_users:30,requested_users:40,unmatched_users:0}}},
  effect_data:{operationTaskCohort:{analysis_users:35,requested_users:40,unmatched_users:0}}}];
 const plan=planGrowthInvestigation({goal:'activation',report,history});
 const overview=plan.steps.find(step=>step.skillId==='growth-overview');
 assert.equal(overview.experienceChecks[0].insufficientReviews,1);
 assert.match(overview.experienceChecks[0].instruction,/先补齐缺失证据/);
 assert.doesNotMatch(overview.experienceChecks[0].instruction,/禁止原样重复/);
 assert.match(formatPlanForPrompt(plan),/增加注册引导内容/);
});
