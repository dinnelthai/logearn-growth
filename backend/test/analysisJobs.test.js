const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
test('failed read-only analysis can retry the same snapshot instead of replaying its failure',async()=>{
 const threads=require('node:worker_threads'),Original=threads.Worker;let attempts=0
 class FakeWorker extends EventEmitter{constructor(){super();const attempt=++attempts;queueMicrotask(()=>this.emit('message',attempt===1?{error:'transient connection',status:503}:{result:{lists:{all:[]},payload:{users:0}}}))}terminate(){return Promise.resolve(0)}}
 threads.Worker=FakeWorker;const location=require.resolve('../src/services/analysisJobs');delete require.cache[location]
 try{const jobs=require(location),snapshot={snapshot_id:'retry-test'},first=jobs.start('referral',{},snapshot,null,1)
 await new Promise(setImmediate);assert.equal(first.state,'failed')
 const retry=jobs.start('referral',{},snapshot,null,1);assert.notEqual(retry.id,first.id);assert.equal(jobs.start('referral',{},snapshot,null,1).id,retry.id)
 await new Promise(setImmediate);assert.equal(retry.state,'complete');assert.equal(jobs.result(retry.id,1).value.payload.users,0);assert.throws(()=>jobs.result(retry.id,2),{status:409})
 }finally{threads.Worker=Original;delete require.cache[location]}
})

test('evicted or flushed completed results can rerun while live results and running jobs coalesce',async()=>{
 const threads=require('node:worker_threads'),Original=threads.Worker;let attempts=0
 class FakeWorker extends EventEmitter{constructor(){super();attempts++;setImmediate(()=>this.emit('message',{result:{lists:{all:[]},payload:{users:attempts}}}))}terminate(){return Promise.resolve(0)}}
 threads.Worker=FakeWorker;const location=require.resolve('../src/services/analysisJobs');delete require.cache[location]
 const remote=require('../src/data/hologres'),cache=require('../src/cache/multilevel')
 try{
  const jobs=require(location),snapshot={snapshot_id:'eviction-test'},run=()=>jobs.start('segments',{start:1,end:2},snapshot,null,'owner')
  const first=run();assert.equal(run().id,first.id)
  await new Promise(setImmediate);await new Promise(setImmediate)
  assert.equal(first.state,'complete');assert.equal(run().id,first.id)
  for(let i=0;i<256;i++)await remote.cached('evict-job:'+i,async()=>i)
  assert.throws(()=>jobs.result(first.id,'owner'),{status:409})
  const second=run();assert.notEqual(second.id,first.id);assert.equal(run().id,second.id)
  await new Promise(setImmediate);await new Promise(setImmediate)
  assert.equal(jobs.result(second.id,'owner').value.payload.users,2)
  cache.flush();const third=run();assert.notEqual(third.id,second.id)
  await new Promise(setImmediate);await new Promise(setImmediate)
  assert.equal(jobs.result(third.id,'owner').value.payload.users,3)
  assert.throws(()=>jobs.result(third.id,'other'),{status:409});assert.equal(attempts,3)
 }finally{cache.flush();threads.Worker=Original;delete require.cache[location]}
})
