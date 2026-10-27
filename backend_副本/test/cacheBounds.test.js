const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const cache = require('../src/cache/multilevel')
afterEach(() => cache.flush())
test('capacity evicts old entries without rejecting successful queries', async () => {
  for (let i = 0; i < 501; i++) assert.equal(await cache.cached('capacity:' + i, () => i), i)
  assert.ok(cache.getStats().l1.keys <= 256)
  assert.equal(await cache.get('capacity:0'), null)
  assert.equal((await cache.get('capacity:500')).value, 500)
})
test('invalidating an in-flight query cannot repopulate stale data', async () => {
  let release
  const old = cache.cached('version', () => new Promise(resolve => { release = resolve }))
  await new Promise(resolve => setImmediate(resolve))
  await cache.del('version')
  assert.equal(await cache.cached('version', () => 'new'), 'new')
  release('old')
  assert.equal(await old, 'old')
  assert.equal((await cache.get('version')).value, 'new')
})
test('flush prevents an in-flight query from restoring cleared entries', async () => {
  let release
  const old = cache.cached('flush', () => new Promise(resolve => { release = resolve }))
  await new Promise(resolve => setImmediate(resolve))
  cache.flush()
  release('old')
  await old
  assert.equal(await cache.get('flush'), null)
})
