'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cacheConnectionConfig}=require('../src/cache/redis');
const {getBullRedisConfig}=require('../src/queues/connection');
const {createRateLimiter}=require('../src/cache/rateLimit');

test('LLM cache and rate limiter honor REDIS_URL instead of default localhost 6379',()=>{
 const old={REDIS_URL:process.env.REDIS_URL,BULL_REDIS_URL:process.env.BULL_REDIS_URL,
  REDIS_DB:process.env.REDIS_DB};
 try{
  process.env.REDIS_URL='redis://127.0.0.1:16379';
  delete process.env.BULL_REDIS_URL;
  process.env.REDIS_DB='0';
  const cache=cacheConnectionConfig(process.env);
  const bull=getBullRedisConfig();
  assert.equal(cache.host,bull.host);
  assert.equal(cache.port,bull.port);
  assert.equal(cache.db,bull.db);
  assert.equal(cache.host,'127.0.0.1');
  assert.equal(cache.port,16379);
 }finally{
  for(const [key,value]of Object.entries(old)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
test('URL auth and TLS, legacy host fallback and invalid protocols',()=>{
 const secure=cacheConnectionConfig({
  REDIS_URL:'rediss://operator:p%40ss@cache.internal:6380',REDIS_DB:'2'});
 assert.equal(secure.host,'cache.internal');
 assert.equal(secure.port,6380);
 assert.equal(secure.username,'operator');
 assert.equal(secure.password,'p@ss');
 assert.equal(secure.db,2);
 assert.deepEqual(secure.tls,{});
 const legacy=cacheConnectionConfig({REDIS_HOST:'127.0.0.1',REDIS_PORT:'16379',REDIS_DB:'0'});
 assert.equal(legacy.port,16379);
 const bullFallback=cacheConnectionConfig({BULL_REDIS_URL:'redis://127.0.0.1:16379'});
 assert.equal(bullFallback.port,16379);
 assert.throws(()=>cacheConnectionConfig({REDIS_URL:'https://example.com'}),/redis/);
 assert.throws(()=>cacheConnectionConfig({REDIS_URL:'redis://localhost:6379',REDIS_DB:'invalid'}),/Redis/);
});
const quiet={warn:()=>{},error:()=>{}};
test('paid LLM calls fail closed if Redis is disconnected or the request fails',async()=>{
 const broken=createRateLimiter(()=>({incr:async()=>{throw Error('Connection is closed')}}),quiet);
 await assert.rejects(broken.checkLimit('llm:alice',100,3600,{failClosed:true}),/已阻止付费调用/);
 const missing=createRateLimiter(()=>null,quiet);
 await assert.rejects(missing.checkLimit('llm:alice',100,3600,{failClosed:true}),/Redis/);
 assert.equal((await broken.checkLimit('non-paid',100)).allowed,true);
 assert.equal((await missing.checkLimit('non-paid',100)).allowed,true);
});
test('paid LLM calls are allowed only when Redis acknowledges the rate limit increment',async()=>{
 const calls=[];
 const limiter=createRateLimiter(()=>({
  incr:async key=>{calls.push(key);return 1},
  expire:async()=>{calls.push('expire')}
 }),quiet);
 assert.equal((await limiter.checkLimit('llm:alice',100,3600,{failClosed:true})).allowed,true);
 assert.deepEqual(calls,['rate:limit:llm:alice','expire']);
 const exceeded=createRateLimiter(()=>({incr:async()=>101,ttl:async()=>3599}),quiet);
 const result=await exceeded.checkLimit('llm:alice',100,3600,{failClosed:true});
 assert.equal(result.allowed,false);
 assert.equal(result.resetIn,3599);
});
