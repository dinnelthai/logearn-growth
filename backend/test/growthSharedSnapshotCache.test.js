'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSharedStore,immutable}=require('../src/cache/snapshotShared');
const {createCache}=require('../src/cache/multilevel');
test('only immutable snapshot and weekly core keys qualify for L2',()=>{
 assert.equal(immutable('status'),false);
 assert.equal(immutable('agent:alice:report'),false);
 assert.equal(immutable('snapshot:ab1234cd5678'),true);
 assert.equal(immutable(JSON.stringify(['weekly-core-v1','snap1234',1690000000000,'all'])),true);
 assert.equal(immutable(JSON.stringify(['weekly-core-v1','snap1234',1690000000000,'owner:alice',1])),false);
 assert.equal(immutable(JSON.stringify(['business-north-v3','snap1234',1000,2000,null])),true);
 assert.equal(immutable(JSON.stringify(['business-north-v3','snap1234',2000,1000,'all'])),false);
});
test('two independent process caches reuse Redis snapshot and respect expiry + namespace',async()=>{
 let now=1000000;
 const db=new Map(),client={
  get:async k=>db.get(k)||null,
  set:async(k,value,flag,seconds)=>{assert.equal(flag,'EX');assert.ok(seconds<=900);db.set(k,value);return 'OK'},
  del:async k=>db.delete(k)
 };
 const shared=createSharedStore({client,namespace:'test-v1',clock:()=>now});
 const a=createCache({shared,clock:()=>now}),b=createCache({shared,clock:()=>now});
 const key='snapshot:abcdef1234567890',value={snapshot_id:'abcdef1234567890',coverage:{complete:false}};
 await a.set(key,value,30);
 const hit=await b.get(key);
 assert.equal(hit.source,'L2');assert.deepEqual(hit.value,value);
 assert.equal(b.getStats().l2.hits,1);
 assert.equal((await b.get('status')),null);
 now+=31000;
 assert.equal(await b.get(key),null);
 assert.equal(await a.get(key),null);
 await a.del(key);assert.equal(db.size,0);
 const other=createSharedStore({client,namespace:'test-v2',clock:()=>now});
 await other.set(key,value,30);
 assert.equal(await shared.get(key),null,'no environment cross talk');
});
test('L2 outage is fail-soft; no live key is sent to shared store',async()=>{
 const shared={get:async()=>{throw Error('Redis down')},set:async()=>{throw Error('Redis down')},del:async()=>{}};
 const a=createCache({shared});
 let calls=0;
 assert.deepEqual(await a.cached('status',async()=>{calls++;return {value:1}}),{value:1});
 assert.deepEqual(await a.cached('status',async()=>{calls++;return {value:2}}),{value:1});
 assert.equal(calls,1);
 assert.deepEqual(await a.cached('snapshot:abcd1234',async()=>{calls++;return {value:3}}),{value:3});
 assert.equal(a.getStats().l2.errors>=1,true);
});
