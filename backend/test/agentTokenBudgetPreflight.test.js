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
test('budget exhaustion fails closed before any paid reservation',async()=>{
 await withEnv({AI_TASK_MAX_TOKENS:50000,AI_TASK_MAX_OUTPUT_TOKENS:4096},async()=>{
  let paidGate=0,provider=0;
  await assert.rejects(runTask(request('增长'.repeat(18000),{
   paidCalls:{begin:async()=>{paidGate++}},
   clientFactory:()=>({chat:async()=>{provider++;throw Error('unexpected remote call')}})
  })),error=>{
   assert.match(error.message,/Token预算不足/);
   assert.match(error.message,/输入保守估算/);
   assert.match(error.message,/输出预留 4096/);
   assert.match(error.message,/任务剩余 50000/);
   assert.match(error.message,/本轮未发起付费调用/);
   return true;
  });
  assert.equal(paidGate,0);assert.equal(provider,0);
 });
});
test('follow-up preflight subtracts actual prior tokens before next paid round',async()=>{
 await withEnv({AI_TASK_MAX_TOKENS:10000,AI_TASK_MAX_OUTPUT_TOKENS:4096},async()=>{
  let calls=0,reservations=0;
  const resultPromise=runTask(request('增长分析'.repeat(450),{
   paidCalls:{begin:async()=>{reservations++}},
   clientFactory:()=>({modelInfo:{provider:'mock'},chat:async()=>{
    calls++;
    return {content:JSON.stringify({investigations:[{kind:'north'}]}),
     usage:{totalTokens:8900,outputTokens:400},provider:'mock',cost:0.01};
   }}),
   investigate:async()=>({status:'ok',evidence:[]})
  }));
  await assert.rejects(resultPromise,/Token预算不足/);
  assert.equal(calls,1);assert.equal(reservations,1);
 });
});
test('invalid message data fails closed',()=>{
 assert.throws(()=>estimateChatTokens([]),/模型消息为空/);
 assert.throws(()=>estimateChatTokens([{role:'user',content:null}]),/消息不完整/);
});
