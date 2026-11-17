'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareCases}=require('../src/ai/growth/efficiencyAudit');
function sample(){
 return {id:'case',goal:'activation',expectedSignals:[{metric:'active_users',priority:'P1'}],
  before:{calls:4,inputTokens:5000,outputTokens:1000,totalTokens:6000,
   costKnown:true,costUsd:0.1,signals:[]},
  after:{calls:2,inputTokens:3000,outputTokens:600,totalTokens:3600,
   costKnown:true,costUsd:0.06,signals:[{metric:'active_users',priority:'P1'}],
   quality:{complete:true,sourceContextVerified:true,causalProof:false}}};
}
test('reports exact token and dollar deltas only for labeled high-quality pairs',()=>{
 const report=compareCases([sample()]);
 assert.equal(report.measurement.fullyVerified,true);
 assert.equal(report.verifiedComparableSubset.tokenReductionPct,40);
 assert.equal(report.verifiedComparableSubset.costReductionPct,40);
 assert.equal(report.quality.missedSignals,0);
});
test('missing ground-truth alert blocks savings claims even if tokens are lower',()=>{
 const item=sample();item.after.signals=[];
 const report=compareCases([item]);
 assert.equal(report.measurement.fullyVerified,false);
 assert.equal(report.verifiedComparableSubset.tokenReductionPct,null);
 assert.equal(report.quality.missedSignals,1);
});
test('unknown prices and absent usage cannot be treated as free',()=>{
 const item=sample();item.after.costKnown=false;
 const report=compareCases([item]);
 assert.equal(report.measurement.comparableCases,0);
 assert.equal(report.conclusion,'partial-evidence-do-not-claim-overall-savings');
 const bad=sample();delete bad.after.totalTokens;
 assert.equal(compareCases([bad]).measurement.comparableCases,0);
});
test('unverified quality prevents comparing an untrusted report',()=>{
 const item=sample();item.after.quality.complete=false;
 assert.equal(compareCases([item]).measurement.comparableCases,0);
});
