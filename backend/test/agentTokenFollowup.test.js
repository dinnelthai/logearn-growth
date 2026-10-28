'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runTask}=require('../src/ai/business/runner');
test('tool-round transport omits repeated model prose while checkpoint keeps original',async()=>{
 const messages=[],stored=[],huge={status:'ok',evidence:[{
  id:'evidence-id',metricId:'active_users',value:{rows:Array.from({length:500},(_,i)=>({i,blob:'x'.repeat(200)}))},
  coverage:{status:'partial'},sourceVersions:{events:'s1'}}]};
 const replies=[JSON.stringify({investigations:[{kind:'north'}],reason:'z'.repeat(22000)}),
  JSON.stringify({summary:'verified',keyFindings:[],suggestions:[]})];
 const response=await runTask({context:{focusGoal:'activation'},prompt:'analyze',
  ownerId:'alice',operationId:'token-test',operationType:'analysis',
  investigate:async()=>huge,
  traceStore:{savePrompt(){},begin(){},finish(_c,_n,result){stored.push(result.responseContent)},
   appendInvestigation(_c,_n,_i,_query,result){assert.equal(result,huge)}},
  clientFactory:()=>({modelInfo:{provider:'mock'},chat:async input=>{
   messages.push(JSON.parse(JSON.stringify(input)));
   return {content:replies.shift(),usage:{totalTokens:10},provider:'mock',cost:0}
  }})
 });
 assert.equal(response.analysis.summary,'verified');
 assert.equal(messages.length,2);
 assert.ok(messages[1][2].content.length<1000,'tool request only includes bounded reasoning');
 assert.ok(messages[1][3].content.length<12000,'model receives a compact tool view');
 assert.match(messages[1][3].content,/evidence-id/);
 assert.ok(stored[0].length>20000,'original completion remains archived');
 assert.equal(response.evidence[0].result,huge);
});
