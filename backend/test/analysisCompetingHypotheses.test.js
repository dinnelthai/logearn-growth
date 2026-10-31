'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateAnalysis}=require('../src/ai/business/analysisContract');
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
 assert.equal(validateAnalysis(value,{capabilities:[{id:'get_channels'},{id:'get_login_conversion'}]}),value);
});
test('competing hypotheses reject unauthorized tools',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses[0].discriminatingQuery.tool='get_seo_performance';
 assert.throws(()=>validateAnalysis(value,{capabilities:[{id:'get_channels'}]}),/未授权调查工具/);
});
test('competing hypotheses require two or three distinct explanations',()=>{
 const value=base();
 value.suggestions[0].competingHypotheses.pop();
 assert.throws(()=>validateAnalysis(value,{capabilities:[{id:'get_channels'}]}),/2至3项/);
});
test('hypotheses remain optional when evidence already resolves the decision',()=>{
 const value=base();
 delete value.suggestions[0].competingHypotheses;
 assert.equal(validateAnalysis(value),value);
});

test('analysis rejects an exact repeated action for the same metric and scope',()=>{
 const value=base();
 const memory=[{user_status:'executed',validation_metrics:{primary:'new_users'},
  applicable_scope:{source:'all'},action:'Run the smallest authorized investigation'}];
 assert.throws(()=>validateAnalysis(value,{memory}),/完全重复/);
});
test('analysis permits a materially different action for the same metric',()=>{
 const value=base();
 value.suggestions[0].action='Compare channel acquisition against login completion';
 const memory=[{user_status:'rejected',validation_metrics:{primary:'new_users'},
  applicable_scope:{source:'all'},action:'Run the smallest authorized investigation'}];
 assert.equal(validateAnalysis(value,{memory}),value);
});
test('analysis permits the same action in a different business scope',()=>{
 const value=base();
 const memory=[{user_status:'executed',validation_metrics:{primary:'new_users'},
  applicable_scope:{source:'telegram'},action:'Run the smallest authorized investigation'}];
 assert.equal(validateAnalysis(value,{memory}),value);
});
