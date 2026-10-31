'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {estimateChatTokens}=require('../src/ai/business/tokenBudget');
const {runTask}=require('../src/ai/business/runner');
const completion={summary:'ok',keyFindings:[],suggestions:[]};
const request=(prompt,options={})=>({
 context:{focusGoal:'activation'},prompt,ownerId:'alice',
 operationId:'budget-test',operationType:'analysis',...options
});
async function withEnv(settings,fn){
 const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));
 try{
  for(const [key,value] of Object.entries(settings))process.env[key]=String(value);
  await fn();
 }finally{
  for(const [key,value] of Object.entries(previous))
   if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
}
test('multilingual preflight estimates tokens rather than UTF-8 bytes',()=>{
 const chinese='业务增长分析'.repeat(3000);
 const messages=[{role:'system',content:chinese},{role:'user',content:'{"users":34}'}];
 const bytes=Buffer.byteLength(JSON.stringify(messages),'utf8');
 const estimated=estimateChatTokens(messages);
 assert.ok(bytes>50000);
 assert.ok(estimated+4096<50000);
});
test('50k task accepts bounded Chinese input without a paid retry',async()=>{
 await withEnv({AI_TASK_MAX_TOKENS:50000,AI_TASK_MAX_OUTPUT_TOKENS:4096},async()=>{
  let count=0,gate=0;
  const result=await runTask(request('业务增长分析'.repeat(3000),{
   paidCalls:{begin:async()=>{gate++}},
   clientFactory:()=>({modelInfo:{provider:'mock'},chat:async(_messages,options)=>{
    count++;assert.equal(options.maxTokens,4096);
    return {content:JSON.stringify(completion),
     usage:{totalTokens:24000,outputTokens:500},provider:'mock',cost:0};
   }})
  }));
  assert.equal(count,1);assert.equal(gate,1);
  assert.equal(result.analysis.summary,'ok');
  assert.ok(result.calls[0].estimatedInputTokens<45904);
  assert.equal(result.calls[0].tokenEstimateMethod,'unicode-safe-v1');
  assert.ok(result.calls[0].modelInputBytes>50000);
 });
});
test('over-budget preflight blocks the provider and paid-call journal',async()=>{
 await withEnv({AI_TASK_MAX_TOKENS:50000,AI_TASK_MAX_OUTPUT_TOKENS:4096},async()=>{
  let calls=0,paid=0;
  await assert.rejects(()=>runTask(request('增长'.repeat(18000),{
   paidCalls:{begin:async()=>{paid++}},
   clientFactory:()=>({chat:async()=>{calls++;return {content:JSON.stringify(completion)}}})
  })),/模型Token预算不足/);
  assert.equal(calls,0);assert.equal(paid,0);
 });
});
test('actual provider overage is preserved but blocks a second paid round',async()=>{
 await withEnv({AI_TASK_MAX_TOKENS:10000,AI_TASK_MAX_OUTPUT_TOKENS:4096},async()=>{
  let calls=0; const warnings=[];const original=console.warn;console.warn=x=>warnings.push(x);
  try{
   await assert.rejects(()=>runTask(request('增长分析'.repeat(450),{
    clientFactory:()=>({chat:async()=>({content:JSON.stringify(++calls===1?{investigations:[{kind:'north'}]}:completion),usage:{totalTokens:11000}})}),
    investigate:async()=>({status:'ok',evidence:[]})
   })),/模型Token预算不足/);
   assert.equal(calls,1);
   assert.ok(warnings.some(x=>/实际Token超过任务上限/.test(x)));
  }finally{console.warn=original}
 });
});
test('invalid message data fails closed',()=>{
 assert.throws(()=>estimateChatTokens([]),/模型消息为空/);
 assert.throws(()=>estimateChatTokens([{role:'user',content:null}]),/消息不完整/);
});
