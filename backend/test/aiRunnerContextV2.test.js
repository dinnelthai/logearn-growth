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
test('v2 blocks a second paid round when previous usage exhausts the remaining budget',async()=>{
 const env=setup([investigations,final]);
 await assert.rejects(runner({AI_TASK_MAX_TOKENS:'6000'}).runTask({
  context:context(),prompt:'weekly model test',contextVersion:'v2',
  ownerId:'o',operationId:'o-budget',operationType:'analysis',
  ...env,validate:()=>{}
 }),/Token硬预算不足/);
 assert.equal(env.observed.length,1);
 assert.equal(env.tools.length,6);
 assert.deepEqual(env.paid,['begin:0','end:0:received']);
 assert.equal(env.archive.get(0).results.length,6);
});
test('v3 completes a report beyond estimated task tokens without blind auto-retries',async()=>{
 const env=setup([investigations,investigations,final]);
 const result=await runner({AI_TASK_MAX_TOKENS:'6000'}).runTask({
  context:context(),prompt:'weekly model test',contextVersion:'v3',
  ownerId:'o',operationId:'v3-budget-advisory',operationType:'analysis',
  ...env,validate:()=>{}
 });
 assert.equal(result.analysis.summary,'周报完成');
 assert.equal(env.observed.length,3);
 assert.equal(env.tools.length,12);
 assert.equal(env.archive.get(0).results.length,6);
 assert.equal(env.archive.get(1).results.length,6);
 assert.deepEqual(env.paid,['begin:0','end:0:received','begin:1',
  'end:1:received','begin:2','end:2:received']);
 assert.match(env.observed[0].messages[0].content,/token-efficiency-v3/);
 assert.match(env.observed[0].messages[1].content,/aggregated-business-v3/);
 assert.ok(env.observed[2].messages.some(message=>
  message.content.includes('"priorToolEvidence"')));
});
test('v3 history reduces the third-round input while preserving full tool journal',async()=>{
 const compact=setup([investigations,investigations,final]);
 const baseline=setup([investigations,investigations,final]);
 await runner().runTask({context:context(),prompt:'weekly model test',contextVersion:'v3',
  ownerId:'o',operationId:'v3-size',operationType:'analysis',...compact,validate:()=>{}});
 await runner().runTask({context:context(),prompt:'weekly model test',contextVersion:'v2',
  ownerId:'o',operationId:'v2-size',operationType:'analysis',...baseline,validate:()=>{}});
 const bytes=messages=>Buffer.byteLength(JSON.stringify(messages),'utf8');
 assert.ok(bytes(compact.observed[2].messages)<bytes(baseline.observed[2].messages));
 assert.equal(compact.archive.get(0).results.length,baseline.archive.get(0).results.length);
 assert.equal(compact.archive.get(1).results.length,baseline.archive.get(1).results.length);
});
test('manual verified v2 budget recovery reuses two paid calls and only bills the next round',async()=>{
 const original=runner();
 const prompt='original weekly budget report';
 const pinnedPrompt=original.buildSystemPrompt(prompt,'v2');
 const hash=crypto.createHash('sha256').update(pinnedPrompt).digest('hex');
 const report=context();
 const contextHash=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
 const questions=Array.from({length:6},(_,i)=>query(i));
 const rows=[0,1].map(round=>({
  round,status:'received',trace_id:'paid-round-'+round,prompts:{analysis:hash},
  result:{model:'mock',provider:'mock',contextHash,
   responseContent:JSON.stringify({investigations:questions}),
   tokens:20000,cost:0.02,costKnown:true,fromCache:false,
   investigations:questions.map((q,i)=>({query:q,
    result:{status:'ok',evidence:[{id:'existing-'+round+'-'+i,
     metricId:'active_users',value:100+i}]}}))}
 }));
 const env=setup([final]);
 const result=await runner({AI_TASK_MAX_TOKENS:'50000'}).runTask({
  context:report,prompt,ownerId:'o',operationId:'budget-recovery',
  operationType:'analysis',resumeRows:rows,systemPromptOverride:pinnedPrompt,
  relaxV2BudgetOnManualResume:true,...env,validate:()=>{}
 });
 assert.equal(result.analysis.summary,'周报完成');
 assert.equal(env.observed.length,1);
 assert.equal(env.tools.length,0);
 assert.deepEqual(env.paid,['begin:2','end:2:received']);
});
test('v2 budget relaxation is forbidden without an archived prompt and paid rows',async()=>{
 const env=setup([final]);
 await assert.rejects(runner().runTask({context:context(),prompt:'normal',
  contextVersion:'v2',relaxV2BudgetOnManualResume:true,
  ownerId:'o',operationId:'not-allowed',operationType:'analysis',
  ...env,validate:()=>{}
 }),/已确认的原始付费断点/);
 assert.equal(env.observed.length,0);
 assert.equal(env.paid.length,0);
});
test('v4 weekly analysis sends core statistics first and preserves paid checkpoint semantics',async()=>{
 const ctx=context();
 ctx.current.totals.new_users=18;
 ctx.previous.totals.new_users=40;
 ctx.weeklyCoverage={version:'weekly-coverage-v1',modules:[
  {id:'growth-overview',status:'collected',evidenceIds:['new-now'],facts:[{metric:'users',value:18}]},
  {id:'seo-organic',status:'not-connected',evidenceIds:[],reason:'GSC 未同步'}]};
 ctx.evidence=[{id:'new-now',metricId:'new_users',value:18,
  period:{start:100,end:200},coverage:{status:'partial'}}];
 const env=setup([investigations,final]);
 const result=await runner().runTask({context:ctx,prompt:'weekly model test',
  contextVersion:'v4',ownerId:'o',operationId:'v4-new',operationType:'analysis',
  ...env,validate:()=>{}});
 assert.equal(result.analysis.summary,'周报完成');
 assert.equal(env.observed.length,2);
 assert.match(env.observed[0].messages[0].content,/token-efficiency-v4/);
 const first=JSON.parse(env.observed[0].messages[1].content);
 assert.equal(first.transportVersion,'aggregated-business-v4');
 assert.equal(first.coreMetrics.find(m=>m.id==='new_users').current,18);
 assert.equal(first.weeklyCoverage.find(m=>m.id==='seo-organic').status,'not-connected');
 const followup=env.observed[1].messages.find(m=>
  m.role==='user'&&m.content.includes('"additionalEvidence"'));
 assert.ok(followup);
 const payload=JSON.parse(followup.content);
 assert.ok(payload.additionalEvidence[0].result.evidence[0].value>0);
 assert.deepEqual(env.paid,['begin:0','end:0:received','begin:1','end:1:received']);
 assert.equal(env.archive.get(0).results.length,6);
});
test('legacy protocol remains v1 unless a new task opts in',async()=>{
 const env=setup([final]);
 await runner().runTask({context:context(),prompt:'legacy test',
  ownerId:'o',operationId:'o-3',operationType:'analysis',
  ...env,validate:()=>{}});
 assert.match(env.observed[0].messages[0].content,/token-efficiency-v1/);
 assert.match(env.observed[0].messages[1].content,/aggregated-business-v1/);
});
