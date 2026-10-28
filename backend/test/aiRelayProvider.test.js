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
