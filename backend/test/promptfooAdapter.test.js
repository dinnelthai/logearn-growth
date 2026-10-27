'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CRITICAL}=require('../src/ai/evaluation/promptGate');
const {importPromptfoo}=require('../src/ai/evaluation/promptfooAdapter');
function fixture(){
 const tests=CRITICAL.map(caseId=>({metadata:{caseId},vars:{scenario:caseId},
  assert:[{type:'is-json'}]}));
 return {results:{version:3,stats:{errors:0},results:tests.map((x,testIdx)=>({
  testIdx,promptIdx:0,success:true,score:1,response:{cost:0.01,latencyMs:250}
 }))},config:{tests,providers:['openai:chat:claude-sonnet-4-6']}};
}
test('Promptfoo v3 accepts complete measured one-provider results',()=>{
 const out=importPromptfoo(fixture());
 assert.equal(out.results.length,CRITICAL.length);
 assert.match(out.suiteHash,/^[0-9a-f]{64}$/);
});
test('Promptfoo rejects unmeasured or synthetic evaluations',()=>{
 let x=fixture();x.config.providers=['echo'];
 assert.throws(()=>importPromptfoo(x),/real-model/);
 x=fixture();delete x.results.results[0].response.cost;
 assert.throws(()=>importPromptfoo(x),/cost/);
 x=fixture();x.results.results.pop();
 assert.throws(()=>importPromptfoo(x),/every case/);
 x=fixture();x.results.stats.errors=1;
 assert.throws(()=>importPromptfoo(x),/errors/);
});
