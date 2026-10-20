/** Bounded process cache. Shared Redis/SWR caching is deferred until invalidation
 * and snapshot lifetime semantics can be preserved across processes. */
const entries = new Map()
const pending = new Map()
const MAX_KEYS = 256
const MAX_BYTES = 64 * 1024 * 1024
const MAX_VALUE_BYTES = 4 * 1024 * 1024
let bytes = 0
let generation = 0
const stats = { hits: 0, misses: 0, sets: 0 }

function remove(key) {
  const entry = entries.get(key)
  if (entry) { bytes -= entry.size; entries.delete(key) }
}
function read(key) {
  const entry = entries.get(key)
  if (!entry) return undefined
  if (entry.expires <= Date.now()) { remove(key); return undefined }
  return entry.value
}
async function get(key) {
  const value = read(key)
  if (value === undefined) { stats.misses++; return null }
  stats.hits++
  return { value, source: 'L1' }
}
async function set(key, value, ttl = 30) {
  stats.sets++
  remove(key)
  let size
  try { size = Buffer.byteLength(JSON.stringify(value)) } catch { return }
  if (size > MAX_VALUE_BYTES || !(ttl > 0)) return
  for (const [k, entry] of entries) if (entry.expires <= Date.now()) remove(k)
  while (entries.size && (entries.size >= MAX_KEYS || bytes + size > MAX_BYTES)) {
    remove(entries.keys().next().value)
  }
  entries.set(key, { value, size, expires: Date.now() + ttl * 1000 })
  bytes += size
}
async function del(key) {
  remove(key)
  pending.delete(key)
}
async function cached(key, fn, { ttl = 30 } = {}) {
  const hit = await get(key)
  if (hit) return hit.value
  if (pending.has(key)) return pending.get(key)
  const epoch = generation
  // Defer invocation until the promise is registered, including synchronous errors.
  const promise = Promise.resolve().then(fn).then(async value => {
    if (epoch === generation && pending.get(key) === promise) await set(key, value, ttl)
    return value
  }).finally(() => { if (pending.get(key) === promise) pending.delete(key) })
  pending.set(key, promise)
  return promise
}
function getStats() {
  return {
    l1: { keys: entries.size, hits: stats.hits, misses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0, vsize: bytes, ksize: 0 },
    l2: { hits: 0, misses: 0, hitRate: 0 },
    total: { sets: stats.sets, pendingRequests: pending.size },
  }
}
function resetStats() { stats.hits = stats.misses = stats.sets = 0 }
function flush() { generation++; entries.clear(); pending.clear(); bytes = 0 }
module.exports = { get, set, del, cached, getStats, resetStats, flush, l1: { get: read } }
