'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateAnalysis}=require('../src/ai/business/analysisContract');
const inputSchema={type:'object',additionalProperties:false,properties:{
 scope:{type:'object'},start:{type:'integer'},end:{type:'integer'},
 limit:{type:'integer'},cursor:{type:'string'},hours:{type:'integer'}
}};
const allowedCapabilities=[{id:'get_channels',inputSchema},{id:'get_login_conversion',inputSchema}];
const base=()=>({
 summary:'Observed activation change requires investigation',
 keyFindings:[],
 suggestions:[{
  problem:'Activation changed',hypothesis:'Several causes remain possible',
  action:'Run the smallest authorized investigation',priority:'P1',
  priorityReason:'Goal relevance and evidence quality',
  evidence:{evidenceIds:['ev-1'],metrics:[],dataPoints:[]},
  uncertainties:['Cause is not established'],
  validationMetrics:{primary:'new_users',secondary:[]},
  reviewConditions:['Review after a mature comparable period'],
  competingHypotheses:[
   {cause:'Acquisition mix changed',supportingEvidenceIds:['ev-1'],
    contradictingEvidenceIds:[],missingEvidence:['Channel split'],
    discriminatingQuery:{tool:'get_channels',input:{},why:'Separates source mix from downstream activation'}},
   {cause:'Login conversion changed',supportingEvidenceIds:[],
    contradictingEvidenceIds:[],missingEvidence:['Login funnel'],
    discriminatingQuery:{tool:'get_login_conversion',input:{},why:'Tests the login step directly'}}
  ]
 }]
});
test('competing hypotheses accept only tools in the current task capability set',()=>{
 const value=base();
 assert.equal(validateAnalysis(value,{capabilities:allowedCapabilities}),value);
});
test('competing hypotheses reject unauthorized tools',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses[0].discriminatingQuery.tool='get_seo_performance';
 assert.throws(()=>validateAnalysis(value,{capabilities:[{id:'get_channels',inputSchema}]}),/未授权调查工具/);
});
test('competing hypotheses require two or three distinct explanations',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses.pop();
 assert.throws(()=>validateAnalysis(value,{capabilities:[{id:'get_channels'}]}),/2至3项/);
});
test('hypotheses remain optional when evidence already resolves the decision',()=>{
 const value=base();
 delete value.suggestions[0].competingHypotheses;
 assert.equal(validateAnalysis(value,{capabilities:allowedCapabilities}),value);
});

test('analysis rejects an exact repeated action for the same metric and scope',()=>{
 const value=base();
 const memory=[{user_status:'executed',validation_metrics:{primary:'new_users'},
  applicable_scope:{source:'all'},action:'Run the smallest authorized investigation'}];
 assert.throws(()=>validateAnalysis(value,{memory,capabilities:allowedCapabilities}),/完全重复/);
});
test('analysis permits a materially different action for the same metric',()=>{
 const value=base();
 value.suggestions[0].action='Compare channel acquisition against login completion';
 const memory=[{user_status:'rejected',validation_metrics:{primary:'new_users'},
  applicable_scope:{source:'all'},action:'Run the smallest authorized investigation'}];
 assert.equal(validateAnalysis(value,{memory,capabilities:allowedCapabilities}),value);
});
test('analysis permits the same action in a different business scope',()=>{
 const value=base();
 const memory=[{user_status:'executed',validation_metrics:{primary:'new_users'},
  applicable_scope:{source:'telegram'},action:'Run the smallest authorized investigation'}];
 assert.equal(validateAnalysis(value,{memory,capabilities:allowedCapabilities}),value);
});

function strictValue(){
 const value=base(),suggestion=value.suggestions[0];
 suggestion.scope={source:'all'};
 suggestion.expectedImpact='可能改善成熟首次分析用户数，幅度未知';
 suggestion.impactBasis='当前证据只支持问题存在，尚无可量化的因果收益';
 suggestion.executionPlan={
  ownerRole:'Growth 负责人',effort:'先评估，预计不超过1人日',
  resourceNeeds:['现有业务漏斗'],dependencies:[],
  steps:['核对成熟样本','验证主要断点','记录实际执行'],
  target:'确认首次分析用户变化的主要可验证原因',
  successCriteria:'同口径成熟用户指标可在复盘窗口复核',
  suggestedObservationDays:7,stopConditions:['覆盖不足时停止','指标恶化时回滚']
 };
 return value;
}
test('new analysis contract only accepts metrics the retrospective service can actually read',()=>{
 const value=strictValue();
 value.suggestions[0].validationMetrics={primary:'new_users',secondary:['active_users','activation_rate']};
 assert.equal(validateAnalysis(value,{analysisContractVersion:'analysis-contract-v2',
  business:{scope:{source:'all'}},capabilities:allowedCapabilities}),value);
});
test('new analysis contract rejects registered-user metrics until retrospective reads them directly',()=>{
 const value=strictValue();
 value.suggestions[0].validationMetrics={primary:'registered_users',secondary:[]};
 assert.throws(()=>validateAnalysis(value,{analysisContractVersion:'analysis-contract-v2',
  business:{scope:{source:'all'}},capabilities:allowedCapabilities}),/当前未被复盘服务支持/);
});
test('new analysis contract rejects unknown, duplicate or excessive review metrics',()=>{
 for(const metrics of [
  {primary:'made_up_metric',secondary:[]},
  {primary:'new_users',secondary:['new_users']},
  {primary:'new_users',secondary:['active_users','returning_users','activation_rate','d7']}
 ]){
  const value=strictValue();value.suggestions[0].validationMetrics=metrics;
  assert.throws(()=>validateAnalysis(value,{analysisContractVersion:'analysis-contract-v2',
   business:{scope:{source:'all'}},capabilities:allowedCapabilities}),/指标|验证指标/);
 }
});
test('new analysis contract requires a complete executable action and exact business scope',()=>{
 const context={analysisContractVersion:'analysis-contract-v2',business:{scope:{source:'all'}},capabilities:allowedCapabilities};
 const missingPlan=strictValue();delete missingPlan.suggestions[0].executionPlan;
 assert.throws(()=>validateAnalysis(missingPlan,context),/完整执行计划/);
 const wrongScope=strictValue();wrongScope.suggestions[0].scope.source='twitter';
 assert.throws(()=>validateAnalysis(wrongScope,context),/完整执行计划/);
 const noReview=strictValue();noReview.suggestions[0].reviewConditions=[];
 assert.throws(()=>validateAnalysis(noReview,context),/完整执行计划/);
});
test('archived analysis contexts without the v2 marker keep legacy validation compatibility',()=>{
 const value=base();
 assert.equal(validateAnalysis(value,{capabilities:allowedCapabilities}),value);
});

test('discriminating query inputs must match the authorized tool schema',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses[0].discriminatingQuery.input={notAField:true};
 assert.throws(()=>validateAnalysis(value,{capabilities:allowedCapabilities}),/不符合当前工具schema/);
});
test('discriminating queries cannot escape the task source or date window',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses[0].discriminatingQuery.input={scope:{source:'twitter'}};
 assert.throws(()=>validateAnalysis(value,{capabilities:allowedCapabilities,
  business:{scope:{source:'all'}},period:{start:100,end:200}}),/超出当前任务来源/);
 const outside=base();
 outside.suggestions[0].competingHypotheses[0].discriminatingQuery.input={start:-1,end:200};
 assert.throws(()=>validateAnalysis(outside,{capabilities:allowedCapabilities,
  business:{scope:{source:'all'}},period:{start:100,end:200}}),/调查期间超出/);
});
test('competing root-cause hypotheses must be genuinely distinct',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses[1].cause=value.suggestions[0].competingHypotheses[0].cause;
 assert.throws(()=>validateAnalysis(value,{capabilities:allowedCapabilities}),/不同的解释/);
});
