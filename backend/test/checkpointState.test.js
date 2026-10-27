const test=require('node:test'),assert=require('node:assert/strict');
const {inspectCheckpoint}=require('../src/ai/business/checkpointState');
const row=(round,response,tools=[])=>({round,status:'received',prompts:{analysis:'hash'},result:{responseContent:JSON.stringify(response),investigations:tools}});
test('empty journal and completed recorded response remain non-resumable',()=>{
 assert.equal(inspectCheckpoint([]).state,'not-started');
 const s=inspectCheckpoint([row(0,{summary:'done'})],'hash');
 assert.equal(s.state,'recorded');assert.equal(s.completedRounds,1);assert.equal(s.canAutoResume,false);
});
test('partial tool checkpoint shows work already saved without executing it',()=>{
 const q=[{tool:'get_funnel'},{tool:'get_paths'}];
 const s=inspectCheckpoint([row(0,{investigations:q},[{query:q[0],result:{rate:0.2}}])],'hash');
 assert.equal(s.state,'partial-tools');assert.equal(s.completedTools,1);assert.equal(s.pendingTools,1);
});
test('unknown paid calls block replay and broken checkpoints fail closed',()=>{
 assert.equal(inspectCheckpoint([row(0,{summary:'x'}),{round:1,status:'unknown'}],'hash').reason,'unresolved-paid-call');
 assert.equal(inspectCheckpoint([row(1,{summary:'x'})]).reason,'noncontiguous-rounds');
 assert.equal(inspectCheckpoint([row(0,{summary:'x'})],'other').reason,'prompt-version-mismatch');
 const q=[{tool:'get_funnel'}];
 assert.equal(inspectCheckpoint([row(0,{investigations:q},[{query:{tool:'other'},result:2}])]).reason,'tool-checkpoint-mismatch');
 assert.equal(inspectCheckpoint([row(0,{investigations:q},[{query:q[0],result:1},{query:q[0],result:1}])]).reason,'invalid-tool-checkpoints');
});
test('fenced JSON and malformed provider content are safe to inspect',()=>{
 assert.equal(inspectCheckpoint([{round:0,status:'received',result:{responseContent:'```json\n{"summary":"ok"}\n```'}}]).state,'recorded');
 assert.equal(inspectCheckpoint([{round:0,status:'received',result:{responseContent:'not-json'}}]).state,'recorded');
});
