const test=require('node:test'),assert=require('node:assert/strict');
const {runTask}=require('../src/ai/business/runner');

test('received response is journaled before a subsequent investigation fails',async()=>{
 const records=[],events=[],response=JSON.stringify({investigations:[{tool:'get_paths',input:{}}]});
 const traceStore={
  savePrompt:()=>{},
  begin(_ctx,round){events.push('begin:'+round)},
  finish(_ctx,round,result){events.push('finish:'+round);records.push(result)},
  unknown(){throw Error('no provider error occurred')}
 };
 await assert.rejects(()=>runTask({
  context:{},prompt:'test',ownerId:'alice',operationId:'analysis-1',operationType:'analysis',
  traceStore,
  clientFactory:()=>({modelInfo:{provider:'openai'},chat:async()=>({content:response,usage:{totalTokens:19},cost:0.01,provider:'openai'})}),
  investigate:async()=>{events.push('investigate');throw Error('data temporarily unavailable')}
 }),/data temporarily unavailable/);
 assert.deepEqual(events,['begin:0','finish:0','investigate']);
 assert.equal(records.length,1);
 assert.equal(records[0].responseContent,response);
 assert.equal(records[0].tokens,19);
 assert.equal(records[0].cost,0.01);
});

test('provider failure does not fabricate a received response checkpoint',async()=>{
 const events=[];
 await assert.rejects(()=>runTask({
  context:{},prompt:'test',ownerId:'alice',operationId:'analysis-2',operationType:'analysis',
  traceStore:{savePrompt(){},begin(){events.push('begin')},finish(){events.push('finish')},unknown(){events.push('unknown')}},
  clientFactory:()=>({chat:async()=>{throw Error('network unknown')}})
 }),/network unknown/);
 assert.deepEqual(events,['begin','unknown']);
});
