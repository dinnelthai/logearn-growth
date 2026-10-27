'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {decideRecovery}=require('../src/ai/business/recoveryDecision');
const systemPrompt='immutable prompt',context={snapshot:{id:'fixed-01'}};
const promptHash=createHash('sha256').update(systemPrompt).digest('hex');
const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
const row=(status='received')=>({
 round:0,status,prompts:{analysis:promptHash},
 result: status==='received'?{
   contextHash,responseContent:JSON.stringify({summary:'finished',keyFindings:[],suggestions:[]}),tokens:10,cost:0.1
 }:null
});
const decide=(status,rows)=>decideRecovery({record:{status},rows,systemPrompt,context});
test('completed reports use durable result, never a paid restart',()=>{
 const r=decide('completed',[row('unknown')]);
 assert.equal(r.decision,'use-stored-result');
 assert.equal(r.canAutoResume,false);
 assert.equal(r.requiresHumanReview,false);
});
test('no model calls: failed task can use existing retry, but active tasks cannot',()=>{
 assert.equal(decide('failed',[]).decision,'eligible-for-existing-retry');
 assert.equal(decide('processing',[]).decision,'blocked');
 assert.equal(decide('pending',[]).decision,'blocked');
});
test('started/unknown paid request blocks automatic replay',()=>{
 for(const status of ['started','unknown']){
  const r=decide('failed',[row(status)]);
  assert.equal(r.decision,'blocked');
  assert.equal(r.reason,'unresolved-paid-call');
  assert.equal(r.canAutoResume,false);
 }
});
test('valid recorded response requires manual review and reports completed rounds',()=>{
 const r=decide('failed',[row()]);
 assert.equal(r.decision,'manual-recovery-review');
 assert.equal(r.completedRounds,1);
 assert.equal(r.requiresHumanReview,true);
 assert.equal(r.canAutoResume,false);
});
test('invalid source snapshot, malformed records and inaccessible journal fail closed',()=>{
 const bad=row();bad.result.contextHash='outdated';
 assert.equal(decide('failed',[bad]).reason,'source-context-mismatch');
 assert.equal(decide('failed',null).reason,'journal-unavailable');
 assert.equal(decideRecovery({record:null,rows:[],systemPrompt,context}).reason,'record-unavailable');
});
