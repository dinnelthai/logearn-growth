const { randomBytes } = require('node:crypto')

const RESULT_CACHE = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000

function cachePut(payload) {
  const id = randomBytes(12).toString('hex')
  RESULT_CACHE.set(id, { expires: Date.now() + CACHE_TTL_MS, payload })
  if (RESULT_CACHE.size > 200) {
    const now = Date.now()
    for (const [k, v] of RESULT_CACHE) {
      if (v.expires < now) RESULT_CACHE.delete(k)
    }
  }
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

module.exports = { cachePut, cacheGet }
