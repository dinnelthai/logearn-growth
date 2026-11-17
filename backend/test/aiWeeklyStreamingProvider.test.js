'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {normalizeUsage}=require('../src/ai/llm/usage');

function provider(create){
 const sent=[],errors=[],constructors=[];
 class FakeOpenAI {
  constructor(options){
   constructors.push(options);
   this.chat={completions:{create:async(params,request)=>{
    sent.push({params,request});
    return create(params,request);
   }}};
  }
 }
 const mod={exports:{}};
 const source=fs.readFileSync(
  path.join(__dirname,'../src/ai/llm/providers/openai.js'),'utf8');
 vm.runInNewContext(source,{module:mod,exports:mod.exports,
  process:{env:{AI_TIMEOUT:'120000'}},
  require:id=>{
   if(id==='openai')return FakeOpenAI;
   if(id==='../../../utils/logger')return {error:(...args)=>errors.push(args)};
   if(id==='../usage')return {normalizeUsage};
   throw Error('unexpected dependency '+id);
  },Error,Object,Number,String,console});
 const instance=new mod.exports({apiKey:'fake',baseURL:'https://relay.example/v1'});
 return {instance,sent,errors,constructors};
}
const input={model:'test-model',messages:[{role:'user',content:'one JSON'}],
 temperature:0.3,maxTokens:1024,timeoutMs:300000};
test('new weekly SSE is collected into one complete response with relay usage',async()=>{
 const fake=provider(async function* (){
  yield {choices:[{delta:{content:'{"summary":'}}]};
  yield {choices:[{delta:{content:'"ok"}'},finish_reason:'stop'}]};
  yield {choices:[],usage:{prompt_tokens:125,completion_tokens:35,total_tokens:160}};
 });
 const response=await fake.instance.chat({...input,collectStream:true});
 assert.equal(response.content,'{"summary":"ok"}');
 assert.equal(response.finishReason,'stop');
 assert.equal(response.usage.totalTokens,160);
 assert.equal(response.usage.known,true);
 assert.equal(response.streamCollected,true);
 assert.equal(fake.sent.length,1);
 assert.equal(fake.sent[0].params.stream,true);
 assert.equal(fake.sent[0].params.stream_options.include_usage,true);
 assert.equal(fake.sent[0].request.timeout,300000);
 assert.equal(fake.constructors[0].maxRetries,0);
});
test('524 is an unknown billed outcome and MUST NOT trigger a retry',async()=>{
 const fake=provider(async()=>{
  throw Object.assign(Error('524 status code (no body)'),{status:524});
 });
 await assert.rejects(fake.instance.chat({...input,collectStream:true}),error=>
  error.code==='AI_UPSTREAM_524_UNKNOWN'&&error.status===524&&
  /费用均未确认/.test(error.message));
 assert.equal(fake.sent.length,1);
});
test('partial SSE without a completion marker cannot be published as success',async()=>{
 const fake=provider(async function* (){
  yield {choices:[{delta:{content:'{"unfinished":'}}]};
 });
 await assert.rejects(fake.instance.chat({...input,collectStream:true}),
  error=>error.code==='AI_STREAM_INCOMPLETE_UNKNOWN');
 assert.equal(fake.sent.length,1);
});
test('completed stream with missing relay usage is UNKNOWN, not a free invocation',async()=>{
 const fake=provider(async function* (){
  yield {choices:[{delta:{content:'{}'},finish_reason:'stop'}]};
 });
 const response=await fake.instance.chat({...input,collectStream:true});
 assert.equal(response.content,'{}');
 assert.equal(response.usage.known,false);
 assert.equal(response.usage.totalTokens,0);
});
test('nonstreaming existing client still consumes normalized ChatCompletion',async()=>{
 const fake=provider(async()=>({
  choices:[{message:{role:'assistant',content:'{"done":true}'},
   finish_reason:'stop'}],
  usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}
 }));
 const response=await fake.instance.chat({...input,collectStream:false});
 assert.equal(response.content,'{"done":true}');
 assert.equal(response.usage.totalTokens,15);
 assert.equal(fake.sent[0].params.stream,false);
 assert.equal(fake.sent.length,1);
});
