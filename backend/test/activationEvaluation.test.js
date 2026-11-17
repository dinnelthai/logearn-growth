'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareActivationReviews}=require('../src/ai/evaluation/activationReviews');
const good={facts:true,evidence:true,investigation:true,action:true,uncertainty:true};
const bad={...good,investigation:false};
const reviewed=(ratings)=>({reviewer:'operator',ratings});
test('compares human-reviewed baseline and candidate on the same activation cases',()=>{
 const report=compareActivationReviews([{id:'case-1',baseline:reviewed(bad),candidate:reviewed(good)}]);
 assert.equal(report.comparable,1);
 assert.equal(report.dimensions.investigation.baselinePassed,0);
 assert.equal(report.dimensions.investigation.candidatePassed,1);
 assert.equal(report.dimensions.investigation.improved,1);
});
test('incomplete reviews remain unscored instead of becoming failures or gains',()=>{
 const report=compareActivationReviews([{id:'case-1',baseline:reviewed(good),candidate:{reviewer:'',ratings:good}}]);
 assert.equal(report.comparable,0);
 assert.deepEqual(report.incomplete,['case-1']);
 assert.equal(report.dimensions.facts.candidateRate,null);
});
test('duplicate case IDs are rejected so a case cannot inflate the results',()=>{
 const entry={id:'same',baseline:reviewed(good),candidate:reviewed(good)};
 assert.throws(()=>compareActivationReviews([entry,entry]),/重复/);
});
