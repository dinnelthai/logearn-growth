const { createHash, randomBytes } = require('node:crypto')

const RESULT_CACHE = new Map()
const MEMO_CACHE = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000
const MEMO_TTL_MS = Number(process.env.METRICS_MEMO_TTL_MS || 5 * 60 * 1000)

function sweep(map, now = Date.now()) {
  for (const [k, v] of map) {
    if (v.expires < now) map.delete(k)
  }
}

function cachePut(payload) {
  const id = randomBytes(12).toString('hex')
  RESULT_CACHE.set(id, { expires: Date.now() + CACHE_TTL_MS, payload })
  if (RESULT_CACHE.size > 200) sweep(RESULT_CACHE)
  return id
}

function cacheGet(id) {
  const hit = RESULT_CACHE.get(id)
  if (!hit) return null
  if (hit.expires < Date.now()) {
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
  if (hit.expires < Date.now()) {
    MEMO_CACHE.delete(key)
    return null
  }
  return hit.payload
}

function memoPut(key, payload) {
  MEMO_CACHE.set(key, { expires: Date.now() + MEMO_TTL_MS, payload })
  if (MEMO_CACHE.size > 100) sweep(MEMO_CACHE)
  return payload
}

module.exports = { cachePut, cacheGet, memoKey, memoGet, memoPut }
