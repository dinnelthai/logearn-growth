const { createHash, randomBytes } = require('node:crypto')

const RESULT_CACHE = new Map()
const MEMO_CACHE = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000
const MEMO_TTL_MS = Number(process.env.METRICS_MEMO_TTL_MS || 5 * 60 * 1000)

function sweep(map, now = Date.now()) {
  for (const [k, v] of map) {
    if (v.expires <= now) map.delete(k)
  }
}

// FIFO capacity preserves insertion order and never extends the snapshot TTL.
function trim(map, limit) {
  sweep(map)
  while (map.size > limit) map.delete(map.keys().next().value)
}

function cachePut(payload) {
  const id = randomBytes(12).toString('hex')
  RESULT_CACHE.set(id, { expires: Date.now() + CACHE_TTL_MS, payload })
  trim(RESULT_CACHE, 200)
  return id
}

function cacheGet(id) {
  const hit = RESULT_CACHE.get(id)
  if (!hit) return null
  if (hit.expires <= Date.now()) {
    RESULT_CACHE.delete(id)
    return null
  }
  return hit.payload
}

/** Short-TTL memoization for expensive metrics responses (funnel/paths/referral). */
function memoKey(parts) {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex')
}

function memoGet(key) {
  const hit = MEMO_CACHE.get(key)
  if (!hit) return null
  const resultId = hit.payload?.drill?.cache_id
  if (hit.expires <= Date.now() || (resultId && !cacheGet(resultId))) {
    MEMO_CACHE.delete(key)
    return null
  }
  return hit.payload
}

function memoPut(key, payload) {
  MEMO_CACHE.delete(key)
  MEMO_CACHE.set(key, { expires: Date.now() + MEMO_TTL_MS, payload })
  trim(MEMO_CACHE, 100)
  return payload
}

module.exports = { cachePut, cacheGet, memoKey, memoGet, memoPut }
