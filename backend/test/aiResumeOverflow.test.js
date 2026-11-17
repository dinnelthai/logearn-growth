'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {planInvestigationResume}=require('../src/ai/business/resumePlan');

const context={business:{scope:{source:'all'}},period:{start:1,end:2},evidence:[]};
const prompt='Original persisted weekly prompt';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const requested=Array.from({length:10},(_,i)=>({
 tool:'query_metrics',input:{metrics:['active_users'],start:i,end:i+1}
}));
function fixture(){
 return {
  rows:[{round:0,status:'received',prompts:{analysis:hash(prompt)},
   result:{responseContent:JSON.stringify({investigations:requested}),
    contextHash:hash(JSON.stringify(context)),investigations:[]}}],
  guards:[{round:0,status:'received'}],context,systemPrompt:prompt
 };
}
test('allows human continuation from saved paid model response with ten queries but only six executable',()=>{
 const plan=planInvestigationResume(fixture());
 assert.equal(plan.allowed,true);
 assert.equal(plan.replayedModelCalls,1);
 assert.equal(plan.remainingTools,6);
});
test('unconfirmed paid call refuses continuation',()=>{
 const state=fixture();
 state.guards[0].status='unknown';
 assert.equal(planInvestigationResume(state).allowed,false);
});
test('prompt or snapshot mismatch refuses continuation',()=>{
 const state=fixture();
 state.context={...context,period:{start:3,end:4}};
 assert.equal(planInvestigationResume(state).reason,'source-or-prompt-mismatch');
});
test('cannot use a prior executed seventh tool to bypass six-tool budget',()=>{
 const state=fixture();
 state.rows[0].result.investigations=requested.slice(0,7)
  .map(query=>({query,result:{status:'ok',evidence:[]}}));
 assert.equal(planInvestigationResume(state).reason,'over-budget-tool-was-executed');
});
