'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {modelContext,modelQuery}=require('../src/ai/business/modelTransport');
const {forModel}=require('../src/ai/business/modelEvidence');
const {estimateChatTokens}=require('../src/ai/business/tokenBudget');

function runner(env={}){
 const mod={exports:{}};
 const imports={
  'node:crypto':crypto,'../llm':{getConfig:()=>({defaultModel:'mock'}),
   createClient:()=>{throw Error('A real provider must never be called in tests')}},
  './policy':{routeTask:()=>({tier:'simple',reason:'test'})},
  './modelEvidence':{forModel},
  './modelTransport':{modelContext,modelQuery},
  './tokenBudget':{estimateChatTokens}
 };
 const file=fs.readFileSync(path.join(__dirname,'../src/ai/business/runner.js'),'utf8');
 vm.runInNewContext(file,{module:mod,exports:mod.exports,
  require:id=>{if(!Object.hasOwn(imports,id))throw Error(id);return imports[id]},
  process:{env:{AI_TASK_MAX_CALLS:'4',AI_TASK_MAX_TOKENS:'50000',
   AI_TASK_MAX_OUTPUT_TOKENS:'4096',...env}},
  Buffer,console,Date,JSON,Promise
 });
 return mod.exports;
}
function context(){
 return {business:{scope:{source:'all'}},
  period:{start:100,end:200,previousStart:0,previousEnd:100,timezone:'Asia/Bangkok'},
  current:{totals:{active_users:120}},previous:{totals:{active_users:110}},
  snapshot:{id:'snap'},evidence:[],capabilities:[{
   id:'query_metrics',description:'Read numeric metrics',
   supportedScopes:['source'],inputSchema:{type:'object',properties:{
    metrics:{type:'array'},start:{type:'integer'},end:{type:'integer'}}}
  }]}
}
const query=i=>({tool:'query_metrics',input:{metrics:['active_users'],start:100+i,end:101+i}});
const investigations=JSON.stringify({investigations:Array.from({length:6},(_,i)=>query(i))});
const final=JSON.stringify({summary:'周报完成',keyFindings:[],suggestions:[],claims:[]});
function setup(outputs){
 const observed=[],paid=[],archive=new Map(),tools=[];
 let calls=0;
 const traceStore={
  savePrompt(){},begin(_ctx,round){archive.set(round,{results:[]})},
  finish(_ctx,round,detail){archive.get(round).completion=detail},
  appendInvestigation(_ctx,round,index,q,result){
   assert.equal(index,archive.get(round).results.length);
   archive.get(round).results.push({query:q,result});
  },
  saveValidatedAnalysis(){}
 };
 const clientFactory=()=>({chat:async(messages,options)=>{
  observed.push({messages:JSON.parse(JSON.stringify(messages)),options});
  return {content:outputs[calls++],usage:{totalTokens:2500,outputTokens:500},
   cost:0.01,costKnown:true};
 }});
 const paidCalls={begin:async round=>paid.push('begin:'+round),
  finish:async(round,status)=>paid.push('end:'+round+':'+status)};
 return {clientFactory,observed,paid,archive,tools,paidCalls,traceStore,
  investigate:async q=>{tools.push(q);return {status:'ok',evidence:[{
   id:'ev'+tools.length,metricId:'active_users',value:100+tools.length,
   numerator:100+tools.length,denominator:200,unit:'users',
   coverage:{status:'partial'},warnings:['水位待确认']
  }]}}};
}
test('v2 reduces earlier model-only evidence and journals per-stage input bytes',async()=>{
 const env=setup([investigations,investigations,final]);
 const result=await runner().runTask({context:context(),prompt:'weekly model test',
  contextVersion:'v2',ownerId:'o',operationId:'o-1',operationType:'analysis',
  ...env,validate:()=>{}});
 assert.equal(result.analysis.summary,'周报完成');
 assert.equal(env.observed.length,3);
 assert.equal(env.tools.length,12);
 const first=env.observed[0].messages;
 assert.match(first[0].content,/token-efficiency-v2/);
 assert.match(first[1].content,/aggregated-business-v2/);
 const last=env.observed[2].messages;
 assert.ok(last.some(x=>x.content.includes('"earlierEvidence"')));
 assert.equal(env.archive.get(0).results.length,6);
 assert.equal(env.archive.get(1).results.length,6);
 assert.equal(result.calls[2].inputAttribution.version,'message-bytes-v1');
 assert.ok(result.calls[2].inputAttribution.segmentsBytes.toolEvidence>0);
 assert.deepEqual(env.paid,['begin:0','end:0:received','begin:1',
  'end:1:received','begin:2','end:2:received']);
});
test('v2 strict token preflight blocks calls before both provider and paid ledger',async()=>{
 const env=setup([final]);
 await assert.rejects(runner({AI_TASK_MAX_TOKENS:'100'}).runTask({
  context:context(),prompt:'weekly model test',contextVersion:'v2',
  ownerId:'o',operationId:'o-2',operationType:'analysis',
  ...env,validate:()=>{}
 }),/Token硬预算不足/);
 assert.equal(env.observed.length,0);
 assert.equal(env.paid.length,0);
});
test('v2 resume reuses archived paid response and protocol without replaying its charge',async()=>{
 const original=runner();
 const prompt='weekly original prompt';
 const pinnedPrompt=original.buildSystemPrompt(prompt,'v2');
 const hash=crypto.createHash('sha256').update(pinnedPrompt).digest('hex');
 const report=context();
 const contextHash=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
 const archivedQueries=Array.from({length:6},(_,i)=>query(i));
 const resumeRows=[{round:0,status:'received',trace_id:'original-trace',
  prompts:{analysis:hash},result:{model:'mock',provider:'mock',
   contextHash,responseContent:JSON.stringify({investigations:archivedQueries}),
   tokens:2600,cost:0.02,costKnown:true,fromCache:false,
   investigations:archivedQueries.map((q,i)=>({query:q,
    result:{status:'ok',evidence:[{id:'saved-'+i,metricId:'active_users',value:100+i}]}}))}}];
 const env=setup([final]);
 const result=await runner().runTask({context:report,prompt,
  ownerId:'o',operationId:'archived-weekly',operationType:'analysis',
  resumeRows,systemPromptOverride:pinnedPrompt,
  ...env,validate:()=>{}});
 assert.equal(result.analysis.summary,'周报完成');
 assert.equal(env.observed.length,1);
 assert.match(env.observed[0].messages[0].content,/token-efficiency-v2/);
 assert.match(env.observed[0].messages[1].content,/aggregated-business-v2/);
 assert.equal(env.tools.length,0);
 assert.deepEqual(env.paid,['begin:1','end:1:received']);
});
test('legacy protocol remains v1 unless a new task opts in',async()=>{
 const env=setup([final]);
 await runner().runTask({context:context(),prompt:'legacy test',
  ownerId:'o',operationId:'o-3',operationType:'analysis',
  ...env,validate:()=>{}});
 assert.match(env.observed[0].messages[0].content,/token-efficiency-v1/);
 assert.match(env.observed[0].messages[1].content,/aggregated-business-v1/);
});
