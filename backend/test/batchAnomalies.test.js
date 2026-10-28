'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeBatches}=require('../src/queues/jobs/batchAnomalies');
test('batch 9 anomalies with 3 model calls while keeping metric identity',async()=>{
 const anomalies=Array.from({length:9},(_,i)=>({metric:'metric-'+i,current:20,previous:10,change:1,trend:'up',severity:'medium'}));
 let calls=0;
 const client={chat:async(messages,options)=>{
  calls++;const req=JSON.parse(messages[1].content);
  assert.ok(req.anomalies.length<=4);
  assert.equal(options.maxTokens,3000);
  return {content:JSON.stringify({analyses:req.anomalies.map(a=>({metric:a.metric,analysis:'review '+a.metric}))}),fromCache:false}
 }};
 const count=await analyzeBatches(anomalies,{client,userId:'alice',date:'2026-10-28',jobId:'job-1'});
 assert.equal(calls,3);assert.equal(count.calls,3);
 for(let i=0;i<9;i++)assert.equal(anomalies[i].aiAnalysis,'review metric-'+i);
});
test('missing or invalid metric output never creates false success or extra paid retries',async()=>{
 const items=[{metric:'a'},{metric:'b'}];
 let calls=0;
 await analyzeBatches(items,{client:{chat:async()=>{
  calls++;return {content:JSON.stringify({analyses:[{metric:'a',analysis:'observed'}]})}
 }}});
 assert.equal(calls,1);assert.equal(items[0].aiAnalysis,'observed');
 assert.equal(items[1].aiAnalysis,null);assert.match(items[1].error,/缺少/);
});

test('markdown fenced JSON from relay is accepted without extra attempts',async()=>{
 const items=[{metric:'a'}];
 const result=await analyzeBatches(items,{client:{chat:async()=>({content:'\`\`\`json\\n{"analyses":[{"metric":"a","analysis":"ok"}]}\\n\`\`\`'})}});
 assert.equal(result.calls,1);
 assert.equal(items[0].aiAnalysis,'ok');
});
