'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CRITICAL}=require('../src/ai/evaluation/promptGate');
const {suite,buildConfig,evaluate}=require('../scripts/evaluatePromptCandidate');
test('offline evaluation contains all six real-provider safety holdouts',()=>{
 assert.deepEqual(suite().map(x=>x.metadata.caseId),CRITICAL);
 const cfg=buildConfig('Baseline prompt','gateway-model','https://api.example.com/v1');
 assert.equal(cfg.providers.length,1);
 assert.equal(cfg.providers[0].id,'openai:chat:gateway-model');
 assert.equal(cfg.providers[0].config.apiKeyEnvar,'PROMPTFOO_API_KEY');
 assert.equal(cfg.evaluateOptions.cache,false);
 assert.ok(cfg.tests.every(t=>t.assert.some(a=>a.type==='javascript')));
 assert.throws(()=>buildConfig('Prompt','model','http://remote.example.com/v1'),/HTTPS/);
});
test('real paid evaluation cannot execute when explicit guard is absent',()=>{
 assert.throws(()=>evaluate('owner','candidate',{registry:{},env:{}}),/explicitly approved/);
});
