'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CRITICAL,evaluateCandidate,authorizePromotion}=require('../src/ai/evaluation/promptGate');
const baseline={role:'analysis',content:'Version one'};
const candidate={role:'analysis',content:'Version two'};
const results=()=>CRITICAL.map(id=>({id,passed:true,quality:0.9,cost:0.01,latencyMs:200}));
const limits={baselineQuality:0.8,maxCost:1,maxLatencyMs:1000};
test('passing offline fixtures still requires explicit permission to promote',()=>{
 const evaluation=evaluateCandidate({candidate,baseline,results:results(),limits});
 assert.equal(evaluation.eligible,true);
 assert.throws(()=>authorizePromotion({evaluation,candidate,baseline,approval:{candidateHash:evaluation.candidateHash,approvedBy:'owner'}}),/disabled/);
 assert.deepEqual(authorizePromotion({evaluation,candidate,baseline,approval:{candidateHash:evaluation.candidateHash,approvedBy:'owner'},env:{AI_PROMPT_AUTO_PUBLISH:'1'}}).role,'analysis');
});
test('missing critical cases and quality degradation fail closed',()=>{
 assert.equal(evaluateCandidate({candidate,baseline,results:results().slice(1),limits}).eligible,false);
 assert.equal(evaluateCandidate({candidate,baseline,results:results().map(x=>({...x,quality:0.2})),limits}).eligible,false);
 assert.equal(evaluateCandidate({candidate,baseline,results:results()}).eligible,false);
});
test('failed adversarial checks and forged approval block promotion',()=>{
 const rows=results(); rows[0].passed=false;
 const evaluation=evaluateCandidate({candidate,baseline,results:rows,limits});
 assert.equal(evaluation.eligible,false);
 assert.throws(()=>authorizePromotion({evaluation,candidate,baseline,approval:{approvedBy:'owner'},env:{AI_PROMPT_AUTO_PUBLISH:'1'}}));
 const passing=evaluateCandidate({candidate,baseline,results:results(),limits});
 assert.throws(()=>authorizePromotion({evaluation:passing,candidate,baseline,approval:{candidateHash:passing.candidateHash,approvedBy:'model'},env:{AI_PROMPT_AUTO_PUBLISH:'1'}}),/human/);
});
