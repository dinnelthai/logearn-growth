const express = require('express')
const router = express.Router()

/**
 * 系统性能指标接口
 * GET /api/metrics
 */
router.get('/', (req, res) => {
  const hologres = require('../data/hologres')
  const multilevel = require('../cache/multilevel')

  const cacheStats = hologres.cacheStats()
  const memUsage = process.memoryUsage()

  res.json({
    cache: {
      l1: {
        keys: cacheStats.l1.keys,
        hits: cacheStats.l1.hits,
        misses: cacheStats.l1.misses,
        hit_rate: (cacheStats.l1.hitRate * 100).toFixed(2) + '%',
        memory_kb: Math.round(cacheStats.l1.vsize / 1024),
      },
      l2: {
        hits: cacheStats.l2.hits,
        misses: cacheStats.l2.misses,
        hit_rate: (cacheStats.l2.hitRate * 100).toFixed(2) + '%',
      },
      total_sets: cacheStats.total.sets,
      pending_requests: cacheStats.total.pendingRequests,
    },
    path_index: process.env.ENABLE_PATH_INDEX === 'true' ? require('../pathIndex/service').stats() : {state:'disabled'},
    memory: {
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memUsage.external / 1024 / 1024),
    },
    uptime_seconds: Math.floor(process.uptime()),
    node_version: process.version,
    timestamp: new Date().toISOString(),
  })
})

/**
 * 重置缓存统计
 * POST /api/metrics/reset
 */
router.post('/reset', (req, res) => {
  const multilevel = require('../cache/multilevel')
  multilevel.resetStats()
  res.json({ ok: true, message: '缓存统计已重置' })
})

/**
 * 清空所有缓存
 * POST /api/metrics/flush-cache
 */
router.post('/flush-cache', (req, res) => {
  const multilevel = require('../cache/multilevel')
  multilevel.flush()
  res.json({ ok: true, message: '所有缓存已清空' })
})

module.exports = router
