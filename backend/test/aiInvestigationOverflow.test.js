'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

// Run the actual orchestration code with a deterministic, no-network provider.
// No API key, PostgreSQL or Redis connection is needed for this test.
function runner(){
 const out={exports:{}};
 const dependencies={
  'node:crypto':crypto,
  '../llm':{createClient:()=>{throw Error('clientFactory injection was skipped')},
   getConfig:()=>({defaultModel:'mock'})},
  './policy':{routeTask:()=>({tier:'simple',reason:'test'})},
  './analysisContract':require('../src/ai/business/analysisContract'),
  './modelEvidence':{forModel:x=>x},
  './modelTransport':{modelContext:x=>x,modelQuery:x=>x},
  './tokenBudget':{estimateChatTokens:()=>100}
 };
 const file=fs.readFileSync(path.join(__dirname,'../src/ai/business/runner.js'),'utf8');
 const context={module:out,require:id=>{
  if(!Object.hasOwn(dependencies,id))throw Error('Unexpected dependency '+id);
  return dependencies[id];
 },process:{env:{AI_TASK_MAX_CALLS:'3',AI_TASK_MAX_TOKENS:'50000',
  AI_TASK_MAX_INPUT_BYTES:'1000000'}},Buffer,console,
 setTimeout,clearTimeout,Date,JSON,Promise};
 vm.runInNewContext(file,context,{filename:'runner.js'});
 return out.exports;
}
const first=JSON.stringify({investigations:Array.from({length:10},(_,i)=>({
 tool:'query_metrics',input:{metrics:['active_users'],start:100+i,end:200+i}
}))});
const second=JSON.stringify({summary:'已完成且未杜撰数据',keyFindings:[],
 suggestions:[],claims:[]});
function setup(){
 const rows=new Map(),tools=[],paid=[];
 const traceStore={
  savePrompt(){},
  begin(_context,round){rows.set(round,{round,result:{investigations:[]}})},
  finish(_context,round,result){rows.get(round).result={...result,investigations:[]}},
  appendInvestigation(_ctx,round,index,query,result){
   const all=rows.get(round).result.investigations;
   assert.equal(index,all.length);
   all.push({query,result});
  },
  saveValidatedAnalysis(){}
 };
 const paidCalls={begin:async round=>paid.push('begin:'+round),
  finish:async(round,status)=>paid.push('end:'+round+':'+status)};
 let calls=0;
 const clientFactory=()=>({chat:async()=>{
  calls++;return {content:calls===1?first:second,
   usage:{totalTokens:300,outputTokens:200},cost:0,costKnown:true};
 }});
 return {rows,tools,paid,traceStore,paidCalls,clientFactory,getCalls:()=>calls};
}
test('oversized 10-query response executes only 6 tools and saves the remaining 4 as unknown',async()=>{
 const st=setup();
 const report=await runner().runTask({
  context:{business:{scope:{source:'all'}},period:{start:0,end:300}},
  prompt:'test',ownerId:'owner',operationId:'weekly-test',operationType:'analysis',
  clientFactory:st.clientFactory,traceStore:st.traceStore,
  paidCalls:st.paidCalls,validate:()=>{},
  investigate:async query=>{st.tools.push(query);return {status:'ok',evidence:[]};}
 });
 assert.equal(report.analysis.summary,'已完成且未杜撰数据');
 assert.equal(st.tools.length,6);
 assert.equal(st.rows.get(0).result.investigations.length,10);
 assert.equal(st.rows.get(0).result.investigations.filter(x=>x.result.status==='not-executed').length,4);
 assert.deepEqual(st.paid,['begin:0','end:0:received','begin:1','end:1:received']);
});
