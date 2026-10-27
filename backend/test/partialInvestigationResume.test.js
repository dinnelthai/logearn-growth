'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {runTask,buildSystemPrompt}=require('../src/ai/business/runner');
const prompt='growth investigation',context={snapshot:{id:'immutable'},evidence:[],business:{scope:{source:'all'}}};
const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
const promptHash=createHash('sha256').update(buildSystemPrompt(prompt)).digest('hex');
const queries=[{tool:'get_paths',input:{}},{tool:'get_funnel',input:{}}];
const row=(result)=>({round:0,trace_id:'old-trace',status:'received',
 prompts:{analysis:promptHash},result:{contextHash,model:'mock',provider:'mock',
 tokens:17,cost:0.02,responseContent:JSON.stringify({investigations:queries}),...result}});
const final={summary:'verified',keyFindings:[],suggestions:[]};
const inputs={context,prompt,ownerId:'alice',operationId:'a',operationType:'analysis',
 validate:async x=>{assert.equal(x.summary,'verified')}};
test('partial saved tool round resumes exactly one missing tool and one new model call',async()=>{
 const operations=[],journalWrites=[],modelCalls=[];
 const responseRows=[row({investigations:[{query:queries[0],result:{paths:1}}]})];
 const task=await runTask({...inputs,resumeRows:responseRows,
  beforeStep:async(...args)=>operations.push(['pre',...args]),
  investigate:async q=>{operations.push(['tool',q.tool]);return {count:9}},
  clientFactory:()=>({modelInfo:{provider:'mock'},chat:async messages=>{
   modelCalls.push(messages);
   return {content:JSON.stringify(final),provider:'mock',usage:{totalTokens:5},cost:0.01}
  }}),
  traceStore:{
   savePrompt(){},begin(_c,r){journalWrites.push(['begin',r])},
   finish(_c,r){journalWrites.push(['finish',r])},
   saveValidatedAnalysis(_c,r){journalWrites.push(['validated',r])},
   appendInvestigation(ctx,r,index,q,value){journalWrites.push(['tool',ctx.traceId,r,index,q.tool,value])}
  },
  paidCalls:{begin:async r=>journalWrites.push(['paid-begin',r]),
    finish:async(r,status)=>journalWrites.push(['paid-finish',r,status])}
 });
 assert.equal(modelCalls.length,1,'previous model response must not be billed again');
 assert.equal(operations.filter(x=>x[0]==='tool').length,1);
 assert.equal(operations.find(x=>x[0]==='tool')[1],'get_funnel');
 assert.deepEqual(journalWrites.find(x=>x[0]==='tool').slice(0,4),['tool','old-trace',0,1]);
 assert.deepEqual(journalWrites.filter(x=>x[0]==='paid-begin'),[['paid-begin',1]]);
 assert.equal(task.evidence.length,2);
 assert.equal(task.calls.length,2);
 assert.equal(task.calls[0].responseContent,undefined,'raw response must not leak to call summary');
});
test('validated saved final response never calls provider or tool again',async()=>{
 const saved={...row({responseContent:JSON.stringify(final),validatedAnalysis:final,investigations:[]})};
 let billed=0,tools=0;
 const result=await runTask({...inputs,resumeRows:[saved],
  investigate:async()=>{tools++;throw Error('tool replay')},
  clientFactory:()=>({chat:async()=>{billed++;throw Error('paid replay')}}),
  traceStore:{savePrompt(){},begin(){throw Error('duplicate journal')}},
  paidCalls:{begin:async()=>{throw Error('duplicate paid fence')}}
 });
 assert.equal(result.analysis.summary,'verified');
 assert.equal(billed,0);assert.equal(tools,0);
});
test('unknown, mismatched context and wrong prompt are blocked before paid calls',async()=>{
 let billed=0;
 const invoke=rows=>runTask({...inputs,resumeRows:rows,
   clientFactory:()=>({chat:async()=>{billed++;throw Error('unsafe paid replay')}}),
   traceStore:{savePrompt(){}}
 });
 await assert.rejects(invoke([{...row({}),status:'unknown'}]),/断点未确认/);
 await assert.rejects(invoke([{...row({}),result:{...row({}).result,contextHash:'different'}}]),/断点未确认/);
 await assert.rejects(invoke([{...row({}),prompts:{analysis:'other'}}]),/断点未确认/);
 assert.equal(billed,0);
});
