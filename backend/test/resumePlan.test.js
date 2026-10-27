'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {planInvestigationResume}=require('../src/ai/business/resumePlan');
const prompt='exact prompt',context={period:{start:1,end:2},snapshot:{id:'stable'}};
const promptHash=createHash('sha256').update(prompt).digest('hex');
const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
const queries=[{tool:'get_paths'},{tool:'get_funnel'}];
const make=(round,value,results=[])=>({round,status:'received',trace_id:'t',
 prompts:{analysis:promptHash},
 result:{responseContent:JSON.stringify(value),contextHash,investigations:results}});
const plan=(rows,guards=rows.map(row=>({round:row.round,status:row.status})))=>
 planInvestigationResume({rows,guards,context,systemPrompt:prompt});
test('single partially complete round is recoverable only for missing read-only tools',()=>{
 const rows=[make(0,{investigations:queries},[{query:queries[0],result:{count:1}}])];
 const result=plan(rows);assert.equal(result.allowed,true);
 assert.equal(result.replayedModelCalls,1);assert.equal(result.savedToolResults,1);
 assert.equal(result.remainingTools,1);
});
test('unknown charge, incomplete shared journal and context drift block before recovery',()=>{
 const rows=[make(0,{investigations:queries})];
 assert.equal(plan(rows,[]).reason,'journal-count-mismatch');
 assert.equal(plan(rows,[{round:0,status:'unknown'}]).reason,'unconfirmed-paid-call');
 const drift=make(0,{investigations:queries});drift.result.contextHash='bad';
 assert.equal(plan([drift]).reason,'source-or-prompt-mismatch');
});
test('tool conflict or unfinished earlier round cannot be replayed',()=>{
 const first=make(0,{investigations:queries},[{query:{tool:'other'},result:1}]);
 assert.equal(plan([first]).reason,'tool-checkpoint-mismatch');
 const earlier=make(0,{investigations:queries},[{query:queries[0],result:1}]);
 const later=make(1,{summary:'end'});
 assert.equal(plan([earlier,later]).reason,'nonterminal-partial-tools');
});
