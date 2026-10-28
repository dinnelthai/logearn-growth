'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {diagnoseProposal}=require('../src/ai/growth/diagnosis');
const end=Date.parse('2026-10-27T17:00:00Z');
const sample={metric:'new_users',source:'seo',goal:'activation',period_end:end,
 evidence:{baseline:100,observed:60,periodStart:end-86400000,periodEnd:end,
  evidence:{baselineAnalysisId:'r1',currentAnalysisId:'r2',
   baselineSnapshotId:'s1',currentSnapshotId:'s2'}}};
test('traceable anomaly describes observed change and asks investigation questions, not a plan',()=>{
 const before=JSON.stringify(sample),result=diagnoseProposal(sample);
 assert.equal(result.dataQuality.status,'traceable-observation');
 assert.equal(result.metric,'new_users');
 assert.equal(result.observation.absolute,-40);
 assert.equal(result.observation.relativeChange,-0.4);
 assert.ok(result.investigationQuestions.some(q=>q.includes('渠道')));
 assert.equal(result.causalConclusion,null);
 assert.equal(result.planGenerated,false);
 assert.equal(result.paidModelCalls,0);
 assert.equal(JSON.stringify(sample),before);
});
test('missing provenance or incompatible period does not produce confirmed diagnostic questions',()=>{
 for(const bad of [
  {...sample,evidence:{...sample.evidence,evidence:{}}},
  {...sample,evidence:{...sample.evidence,periodEnd:end+1000}},
  {...sample,evidence:{baseline:100,observed:60}}
 ]){
  const result=diagnoseProposal(bad);
  assert.equal(result.dataQuality.status,'needs-evidence-review');
  assert.deepEqual(result.investigationQuestions,[]);
  if(!Number.isSafeInteger(bad.evidence.periodEnd)||bad.evidence.periodEnd!==end)
    assert.equal(result.observation,null);
 }
});
test('retention questions explicitly require mature cohorts and no automatic operational actions',()=>{
 const result=diagnoseProposal({...sample,metric:'returning_users',goal:'retention'});
 assert.ok(result.investigationQuestions.some(q=>q.includes('成熟 Cohort')));
 assert.equal(result.externalActions,0);
 assert.equal(result.humanDecision.includes('运营负责人'),true);
});
