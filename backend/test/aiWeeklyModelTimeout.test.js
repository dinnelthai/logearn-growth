'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function providerWithStub({response=null,failure=null}={}){
 let configured=null,invocation=null,calls=0;
 class FakeOpenAI {
  constructor(opts){configured=opts;this.chat={completions:{create:async(params,options)=>{
   calls++;invocation={params,options};
   if(failure)throw failure;
   return response||{choices:[{message:{content:'{}',role:'assistant'},finish_reason:'stop'}],usage:{}};
  }}};
  }
 }
 const file=fs.readFileSync(path.join(__dirname,'../src/ai/llm/providers/openai.js'),'utf8');
 const mod={exports:{}};
 vm.runInNewContext(file,{
  module:mod,exports:mod.exports,require:id=>{
   if(id==='openai')return FakeOpenAI;
   if(id==='../../../utils/logger')return {error(){}};
   if(id==='../usage')return {normalizeUsage:x=>x};
   throw Error(id);
  },
  process:{env:{AI_TIMEOUT:'120000'}},console,Number,Error,Object
 });
 return {provider:new mod.exports({apiKey:'fake',baseURL:'https://invalid.example'}),
  info:()=>({configured,invocation,calls})};
}
test('weekly transport passes longer timeout to a single request and disables SDK retries',async()=>{
 const subject=providerWithStub();
 await subject.provider.chat({model:'mock',messages:[],timeoutMs:300000});
 assert.equal(subject.info().configured.maxRetries,0);
 assert.equal(subject.info().configured.timeout,120000);
 assert.equal(subject.info().invocation.options.timeout,300000);
 assert.equal(subject.info().calls,1);
});
test('invalid timeout override cannot bypass bounded default',async()=>{
 const subject=providerWithStub();
 await subject.provider.chat({model:'mock',messages:[],timeoutMs:800000});
 assert.equal(subject.info().invocation.options,undefined);
});
test('upstream timeout stays unknown and is never silently retried',async()=>{
 const failure=Object.assign(new Error('Request timed out.'),{name:'APIConnectionTimeoutError'});
 const subject=providerWithStub({failure});
 await assert.rejects(subject.provider.chat({model:'mock',messages:[],timeoutMs:300000}),
  error=>error.code==='AI_UPSTREAM_TIMEOUT_UNKNOWN'&&/费用尚未确认/.test(error.message));
 assert.equal(subject.info().calls,1);
});
test('weekly timeout defaults to 300 seconds within a bounded opt-in setting',()=>{
 const {weeklyModelTimeoutMs}=require('../src/ai/growth/weeklyReport');
 const prior=process.env.AI_WEEKLY_MODEL_TIMEOUT_MS;
 try{
  delete process.env.AI_WEEKLY_MODEL_TIMEOUT_MS;
  assert.equal(weeklyModelTimeoutMs(),300000);
  process.env.AI_WEEKLY_MODEL_TIMEOUT_MS='540001';
  assert.throws(()=>weeklyModelTimeoutMs(),/540000/);
  process.env.AI_WEEKLY_MODEL_TIMEOUT_MS='180000';
  assert.equal(weeklyModelTimeoutMs(),180000);
 }finally{
  if(prior===undefined)delete process.env.AI_WEEKLY_MODEL_TIMEOUT_MS;
  else process.env.AI_WEEKLY_MODEL_TIMEOUT_MS=prior;
 }
});
