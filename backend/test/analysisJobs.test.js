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
