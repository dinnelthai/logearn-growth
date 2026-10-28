'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const Redis=require('ioredis');
const {createSharedStore}=require('../src/cache/snapshotShared');
const {createCache}=require('../src/cache/multilevel');
test('real Redis: separate worker caches reuse immutable facts with environment isolation',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const redis=new Redis(process.env.REDIS_URL||'redis://localhost:6379',{
  maxRetriesPerRequest:1,connectTimeout:2000});
 const namespace='int_'+randomUUID().replaceAll('-','');
 const shared=createSharedStore({client:redis,namespace});
 const other=createSharedStore({client:redis,namespace:namespace+'_other'});
 const left=createCache({shared}),right=createCache({shared});
 const k='snapshot:112233aabbccddff';
 try{
  await left.set(k,{snapshot_id:'112233aabbccddff',event_count:3},20);
  const hit=await right.get(k);
  assert.equal(hit?.source,'L2');
  assert.equal(hit?.value.event_count,3);
  assert.equal((await other.get(k)),null,'other deployment must not see it');
  await left.del(k);
  right.flush();
  assert.equal(await right.get(k),null);
  assert.ok(right.getStats().l2.hits>=1);
 }finally{
  await shared.del(k).catch(()=>{});
  await other.del(k).catch(()=>{});
  await redis.quit();
 }
});
