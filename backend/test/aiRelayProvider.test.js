'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Provider=require('../src/ai/llm/providers/openai');
test('provider leaves stream iterable intact and asks for metered usage',async()=>{
 const p=Object.create(Provider.prototype),seen=[];
 const stream={async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'hello'}}],usage:null}}};
 p.client={chat:{completions:{create:async params=>{seen.push(params);return stream}}}};
 const result=await p.chat({model:'model',messages:[],stream:true});
 assert.equal(result,stream);
 assert.equal(seen[0].stream_options.include_usage,true);
});
test('non-stream provider normalizes usage and survives relay missing usage',()=>{
 const p=Object.create(Provider.prototype);
 const obj=p.normalizeResponse({choices:[{message:{content:'ok',role:'assistant'},finish_reason:'stop'}]});
 assert.equal(obj.usage.known,false);
});

test('relay receives the requested max_tokens=1024; token discrepancies remain recorded, not guessed',async()=>{
 const seen=[];
 const p=Object.create(Provider.prototype);
 p.client={chat:{completions:{create:async params=>{
  seen.push(params);
  return {model:'gpt-6.1-terra',choices:[{message:{role:'assistant',content:'ok'},
   finish_reason:'stop'}],
   usage:{prompt_tokens:28,completion_tokens:4069,total_tokens:4097}};
 }}}};
 const result=await p.chat({model:'gpt-6.1-terra',messages:[
  {role:'user',content:'Give concise growth metrics'}],maxTokens:1024,stream:false});
 assert.equal(seen.length,1);
 assert.equal(seen[0].max_tokens,1024);
 assert.equal(result.usage.outputTokens,4069);
 assert.equal(result.usage.totalTokens,4097);
});
