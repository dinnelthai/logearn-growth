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

test('source-day alerts carry replay-bounded provenance, not fabricated AI analysis IDs',()=>{
 const end=Date.parse('2026-10-27T17:00:00Z');
 const p={metric:'new_users',source:'all',goal:'activation',period_end:end,
  evidence:{baseline:100,observed:50,periodStart:end-86400000,periodEnd:end,
   evidence:{origin:'hologres-source-observation',sourceSnapshotId:'snapshot-id',
    sourceCutoff:new Date(end+3600000).toISOString(),
    eventsCompleteThrough:new Date(end).toISOString(),historyComplete:true,
    baselinePeriodStart:end-2*86400000,baselinePeriodEnd:end-86400000,
    currentPeriodStart:end-86400000,currentPeriodEnd:end,
    channelBreakdown:[{metric:'new_users',source:'seo',baseline:80,current:35,delta:-45}]
   }}};
 const result=diagnoseProposal(p);
 assert.equal(result.dataQuality.status,'traceable-observation');
 assert.equal(result.dataQuality.provenance.type,'source-day-query');
 assert.equal(result.dataQuality.provenance.baselineAnalysisId,undefined);
 assert.equal(result.channelObservation[0].delta,-45);
 assert.equal(result.causalConclusion,null);
 const spoof=diagnoseProposal({...p,evidence:{...p.evidence,evidence:{
  ...p.evidence.evidence,historyComplete:false}}});
 assert.equal(spoof.dataQuality.status,'needs-evidence-review');
 assert.equal(spoof.channelObservation.length,0);
});
