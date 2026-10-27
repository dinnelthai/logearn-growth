'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Isolate the HTTP contract from Redis/Postgres; no production connections or paid calls.
const queuePath = require.resolve('../src/queues/queues');
const recordsPath = require.resolve('../src/db/aiRecords');
const queue = {current:{exists:false}, async getJobStatus(){return this.current}};
const records = {byOwner:new Map(), async getAnalysisRecord(id,owner){return this.byOwner.get(`${owner}:${id}`) || null}};
require.cache[queuePath] = {id:queuePath, filename:queuePath, loaded:true, exports:{getJobStatus:queue.getJobStatus.bind(queue)}};
require.cache[recordsPath] = {id:recordsPath, filename:recordsPath, loaded:true, exports:records};
const router = require('../src/routes/aiAnalysis');

async function fixture(fn) {
  const app=express();
  app.use((req,_res,next)=>{req.user={user_id:req.headers['x-test-owner'] || 'alice'};next()});
  app.use('/api/ai-analysis',router);
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/api/ai-analysis/jobs/analysis-1/status`;
    async function get(owner='alice') {const response=await fetch(url,{headers:{'x-test-owner':owner}});return {status:response.status,body:await response.json()}}
    await fn(get);
  } finally {await new Promise(resolve=>server.close(resolve))}
}

test('job status HTTP contract: live, pruned, failed, unknown and isolation',async()=>{
  await fixture(async get=>{
    records.byOwner.clear();
    queue.current={exists:true,id:'analysis-1',data:{ownerId:'alice'},state:'active',progress:40,returnvalue:null,failedReason:null};
    let r=await get();assert.equal(r.status,200);assert.equal(r.body.state,'active');assert.equal(r.body.progress,40);
    r=await get('bob');assert.equal(r.status,403);assert.equal(r.body.result,undefined);

    queue.current={exists:false};
    records.byOwner.set('alice:analysis-1',{status:'completed',result:{summary:'done'}});
    r=await get();assert.equal(r.status,200);assert.equal(r.body.state,'completed');assert.deepEqual(r.body.result,{summary:'done'});assert.equal(r.body.source,'analysis-record');
    r=await get('bob');assert.equal(r.status,404);assert.equal(r.body.result,undefined);

    records.byOwner.set('alice:analysis-1',{status:'failed',error_message:'provider error'});
    r=await get();assert.equal(r.status,200);assert.equal(r.body.state,'failed');assert.equal(r.body.error,'provider error');

    records.byOwner.set('alice:analysis-1',{status:'processing'});
    r=await get();assert.equal(r.status,200);assert.equal(r.body.state,'unknown');assert.equal(r.body.resumable,false);assert.equal(r.body.progress,null);

    records.byOwner.clear();
    r=await get();assert.equal(r.status,404);
  });
});
