/**
 * 多级缓存系统
 *
 * L1: 进程内存 (Node Cache) - 热数据, TTL 30s, 最多 500 个 key
 * L2: 可选的 Redis - 温数据, TTL 5min (未来扩展)
 *
 * 特性:
 * - 自动回填: L2 命中时写回 L1
 * - 防击穿: 同一 key 并发请求只执行一次
 * - SWR (Stale-While-Revalidate): 返回旧值同时后台刷新
 */

const NodeCache = require('node-cache')

// L1: 进程内存缓存
const l1 = new NodeCache({
  stdTTL: 30,           // 默认 TTL 30 秒
  checkperiod: 10,      // 每 10 秒清理过期 key
  maxKeys: 500,         // 最多缓存 500 个 key
  useClones: false,     // 不克隆对象 (性能优化)
})

// L2: Redis 缓存 (可选)
let redis = null
const ENABLE_REDIS = process.env.ENABLE_REDIS_L2 === 'true'

if (ENABLE_REDIS) {
  try {
    const Redis = require('ioredis')
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      lazyConnect: true, // 延迟连接
    })

    redis.connect().then(() => {
      console.log('[Cache L2] Redis connected')
    }).catch(err => {
      console.warn('[Cache L2] Redis connection failed:', err.message)
      redis = null // 禁用 Redis
    })

    redis.on('error', err => {
      console.warn('[Cache L2] Redis error:', err.message)
    })
  } catch (err) {
    console.warn('[Cache L2] Redis module not found, L2 cache disabled')
    redis = null
  }
}

// 待执行的 Promise (防击穿)
const pending = new Map()

// 缓存统计
const stats = {
  l1Hit: 0,
  l1Miss: 0,
  l2Hit: 0,
  l2Miss: 0,
  set: 0,
}

/**
 * 获取缓存
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function get(key) {
  // 1. 先查 L1
  const l1Hit = l1.get(key)
  if (l1Hit !== undefined) {
    stats.l1Hit++
    return { value: l1Hit, source: 'L1' }
  }

  stats.l1Miss++

  // 2. 查 L2 Redis
  if (redis) {
    try {
      const l2Hit = await redis.get(key)
      if (l2Hit) {
        stats.l2Hit++
        const value = JSON.parse(l2Hit)
        l1.set(key, value, 30) // 回填 L1
        return { value, source: 'L2' }
      }
    } catch (err) {
      console.warn('[Cache L2] Get error:', err.message)
    }
  }

  stats.l2Miss++
  return null
}

/**
 * 设置缓存
 * @param {string} key
 * @param {any} value
 * @param {number} ttl - TTL 秒数
 */
async function set(key, value, ttl = 30) {
  stats.set++
  l1.set(key, value, ttl)

  // L2 Redis (异步写入，不阻塞)
  if (redis) {
    const l2Ttl = ttl // 使用与 L1 相同的 TTL，不强制最小值
    redis.setex(key, l2Ttl, JSON.stringify(value)).catch(err => {
      console.warn('[Cache L2] Set failed:', err.message)
    })
  }
}

/**
 * 删除缓存
 * @param {string} key
 */
async function del(key) {
  l1.del(key)

  // L2 Redis
  if (redis) {
    redis.del(key).catch(err => {
      console.warn('[Cache L2] Del failed:', err.message)
    })
  }
}

/**
 * 智能缓存包装器 (带防击穿 + SWR)
 *
 * @param {string} key - 缓存 key
 * @param {Function} fn - 数据获取函数
 * @param {Object} options - 选项
 * @param {number} options.ttl - TTL 秒数 (默认 30)
 * @param {boolean} options.staleWhileRevalidate - 启用 SWR (默认 false)
 * @param {number} options.swr_probability - SWR 触发概率 (默认 0.1 即 10%)
 * @returns {Promise<any>}
 *
 * @example
 * const data = await cached('user:123', async () => {
 *   return await db.query('SELECT * FROM users WHERE id = ?', [123])
 * }, { ttl: 60, staleWhileRevalidate: true })
 */
async function cached(key, fn, options = {}) {
  const {
    ttl = 30,
    staleWhileRevalidate = false,
    swr_probability = 0.1,
  } = options

  // 1. 尝试从缓存获取
  const hit = await get(key)
  if (hit) {
    // SWR 模式: 返回旧值的同时有概率后台刷新
    if (staleWhileRevalidate && Math.random() < swr_probability) {
      // 防止 SWR 与并发 del/invalidation 冲突
      if (!pending.has(key)) {
        setImmediate(() => {
          if (pending.has(key)) return // 如果已经有请求在执行，跳过
          const refresh = (async () => {
            try {
              const value = await fn()
              await set(key, value, ttl)
            } catch (err) {
              console.warn(`[Cache SWR] Refresh failed for ${key}:`, err.message)
            } finally {
              pending.delete(key)
            }
          })()
          pending.set(key, refresh)
        })
      }
    }
    return hit.value
  }

  // 2. 防击穿: 同一个 key 只有一个请求执行
  if (pending.has(key)) {
    return pending.get(key)
  }

  const promise = (async () => {
    try {
      const value = await fn()
      await set(key, value, ttl)
      return value
    } finally {
      pending.delete(key)
    }
  })()

  pending.set(key, promise)
  return promise
}

/**
 * 获取缓存统计
 */
function getStats() {
  const l1Stats = l1.getStats()
  return {
    l1: {
      keys: l1Stats.keys,
      hits: stats.l1Hit,
      misses: stats.l1Miss,
      hitRate: stats.l1Hit / (stats.l1Hit + stats.l1Miss) || 0,
      ksize: l1Stats.ksize,
      vsize: l1Stats.vsize,
    },
    l2: {
      hits: stats.l2Hit,
      misses: stats.l2Miss,
      hitRate: stats.l2Hit / (stats.l2Hit + stats.l2Miss) || 0,
    },
    total: {
      sets: stats.set,
      pendingRequests: pending.size,
    },
  }
}

/**
 * 重置统计
 */
function resetStats() {
  stats.l1Hit = 0
  stats.l1Miss = 0
  stats.l2Hit = 0
  stats.l2Miss = 0
  stats.set = 0
}

/**
 * 清空所有缓存
 */
function flush() {
  l1.flushAll()
  pending.clear()
}

module.exports = {
  get,
  set,
  del,
  cached,
  getStats,
  resetStats,
  flush,
  l1, // 导出供直接操作
}
