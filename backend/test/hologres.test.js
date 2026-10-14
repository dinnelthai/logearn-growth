const {test} = require('node:test')
const assert = require('node:assert/strict')
const remote = require('../src/data/hologres')
test('cache coalesces requests, retries failures, and expires values', async () => {
  let calls = 0
  const fn = async () => { calls++; await new Promise(r=>setTimeout(r,5)); return {n:calls} }
  const values = await Promise.all([remote.cached('coalesce',fn),remote.cached('coalesce',fn)])
  assert.equal(calls,1); assert.deepEqual(values,[{n:1},{n:1}])
  let attempts=0
  await assert.rejects(remote.cached('failed',async()=>{attempts++;throw Error('failure')}))
  assert.equal(await remote.cached('failed',async()=>{attempts++;return 2}),2)
  assert.equal(attempts,2)
  await remote.cached('expired',fn,1)
  await new Promise(r=>setTimeout(r,5))
  await remote.cached('expired',fn,1)
  assert.equal(calls,3)
})
test('expired snapshot is reported as an error, never an empty audience',async()=>{
  await assert.rejects(remote.snapshot('missing'),e=>e.status===409)
})
test('oversized values are returned but never retained in cache',async()=>{
  const value={data:'x'.repeat(4*1024*1024)}
  assert.equal(await remote.cached('oversized',async()=>value),value)
  assert.equal(remote.getCached('oversized'),null)
})
