const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {reconstructTranscript}=require('../src/ai/business/transcriptRecovery');
const systemPrompt='do not invent metrics',context={period:{start:1,end:2}},hash=createHash('sha256').update(systemPrompt).digest('hex');
const make=(round,response,investigations=[])=>({round,trace_id:'trace',status:'received',prompts:{analysis:hash},result:{responseContent:JSON.stringify(response),investigations,model:'test',tokens:10,cost:0.01}});
const recover=rows=>reconstructTranscript({rows,systemPrompt,context});
test('reconstructs ordered investigation evidence with original assistant and user turns',()=>{
 const query={tool:'get_paths',input:{limit:2}},result={count:4};
 const s=recover([make(0,{investigations:[query]},[{query,result}]),make(1,{summary:'done',keyFindings:[],suggestions:[]})]);
 assert.equal(s.state,'reconstructed');
 assert.equal(s.canAutoResume,false);
 assert.equal(s.messages.length,5);
 assert.deepEqual(JSON.parse(s.messages[3].content).additionalEvidence,[{query,result}]);
 assert.equal(s.evidence.length,1);assert.equal(s.calls.length,2);
});
test('rejects partial tools and paid calls in uncertain state',()=>{
 const q={tool:'get_funnel'};
 assert.equal(recover([make(0,{investigations:[q]})]).reason,'tool-execution-incomplete');
 assert.equal(recover([{round:0,status:'unknown',prompts:{analysis:hash}}]).reason,'unresolved-paid-call');
});
test('rejects prompt mismatch, gaps and unrecorded validation turns',()=>{
 const mismatch=make(0,{summary:'x'});mismatch.prompts.analysis='changed';
 assert.equal(recover([mismatch]).reason,'prompt-version-mismatch');
 assert.equal(recover([make(1,{summary:'x'})]).reason,'noncontiguous-rounds');
 assert.equal(recover([make(0,{summary:'unvalidated'}),make(1,{summary:'later'})]).reason,'unrecorded-validation-turn');
});
test('read-only reconstruction makes no external calls and does not mutate stored rows',()=>{
 const rows=[make(0,{summary:'complete',keyFindings:[],suggestions:[]})],serialized=JSON.stringify(rows);
 const s=recover(rows);
 assert.equal(s.state,'reconstructed');
 assert.equal(JSON.stringify(rows),serialized);
 assert.equal(s.reason,'requires-source-snapshot-and-validation');
});
