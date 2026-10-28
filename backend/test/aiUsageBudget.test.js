'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeUsage}=require('../src/ai/llm/usage');
const {getModelInfo,getConfig,validateConfig}=require('../src/ai/llm/config');
const CostTracker=require('../src/ai/llm/costTracker');
test('usage accepts normalized and relay-native shapes but never invents missing tokens',()=>{
 assert.deepEqual(normalizeUsage({prompt_tokens:150,completion_tokens:50,total_tokens:200}),
  {inputTokens:150,outputTokens:50,totalTokens:200,known:true});
 assert.deepEqual(normalizeUsage({inputTokens:12,outputTokens:8}),
  {inputTokens:12,outputTokens:8,totalTokens:20,known:true});
 assert.equal(normalizeUsage({total_tokens:100}).known,false);
 assert.equal(normalizeUsage(undefined).known,false);
 assert.equal(normalizeUsage({prompt_tokens:-1,completion_tokens:1}).known,false);
});
test('unknown and placeholder zero prices fail closed unless free service is verified',()=>{
 const p1=process.env.AI_RELAY_COST_PER_1K_INPUT,p2=process.env.AI_RELAY_COST_PER_1K_OUTPUT,free=process.env.AI_RELAY_FREE_TIER_VERIFIED;
 try{
  delete process.env.AI_RELAY_COST_PER_1K_INPUT;delete process.env.AI_RELAY_COST_PER_1K_OUTPUT;delete process.env.AI_RELAY_FREE_TIER_VERIFIED;
  assert.equal(getModelInfo(getConfig().defaultModel).pricingKnown,false);
  process.env.AI_RELAY_COST_PER_1K_INPUT='0';process.env.AI_RELAY_COST_PER_1K_OUTPUT='0';
  assert.equal(getModelInfo(getConfig().defaultModel).pricingKnown,false);
  process.env.AI_RELAY_FREE_TIER_VERIFIED='1';
  assert.equal(getModelInfo(getConfig().defaultModel).pricingKnown,true);
  delete process.env.AI_RELAY_FREE_TIER_VERIFIED;
  process.env.AI_RELAY_COST_PER_1K_INPUT='0.003';process.env.AI_RELAY_COST_PER_1K_OUTPUT='0.015';
  assert.equal(getModelInfo(getConfig().defaultModel).pricingKnown,true);
  process.env.AI_RELAY_COST_PER_1K_OUTPUT='0';
  assert.equal(getModelInfo(getConfig().defaultModel).pricingKnown,false);
 }finally{
  if(p1===undefined)delete process.env.AI_RELAY_COST_PER_1K_INPUT;else process.env.AI_RELAY_COST_PER_1K_INPUT=p1;
  if(p2===undefined)delete process.env.AI_RELAY_COST_PER_1K_OUTPUT;else process.env.AI_RELAY_COST_PER_1K_OUTPUT=p2;
  if(free===undefined)delete process.env.AI_RELAY_FREE_TIER_VERIFIED;else process.env.AI_RELAY_FREE_TIER_VERIFIED=free;
 }
});
test('daily token guard rejects a consumed budget independently of dollar cost',async()=>{
 const c=new CostTracker({schemaReady:async()=>true});c.getTodayStats=async()=>[{total_cost:'0.1',total_tokens:'120',unknown_cost_calls:'0'}];
 await assert.rejects(c.checkDailyLimit(5,'alice',100),/Token 配额/);
 assert.equal(await c.checkDailyLimit(5,'alice',121),0.1);
});

test('daily budget refuses paid inference if usage ledger schema is stale',async()=>{
 const c=new CostTracker({schemaReady:async()=>false});
 c.getTodayStats=async()=>{throw Error('should never query usage after failed schema preflight')};
 await assert.rejects(c.checkDailyLimit(5,'alice',100),/计费表版本过旧/);
});
test('schema preflight fails closed on unavailable AI PostgreSQL',async()=>{
 const c=new CostTracker({schemaReady:async()=>{throw Error('database offline')}});
 c.getTodayStats=async()=>{throw Error('should not run')};
 await assert.rejects(c.checkDailyLimit(5,'alice',100),/database offline/);
});
