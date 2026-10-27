/**
 * Prometheus 指标导出器
 *
 * 用途: 将系统性能指标导出为 Prometheus 格式
 * 端点: GET /metrics (Prometheus 标准端点)
 *
 * 使用:
 * // 在 index.js 中注册
 * app.get('/metrics', require('./monitoring/prometheus').handler)
 *
 * Prometheus 配置:
 * scrape_configs:
 *   - job_name: 'logearn-backend'
 *     static_configs:
 *       - targets: ['localhost:3000']
 */

const multilevel = require('../cache/multilevel')

/**
 * 格式化 Prometheus 指标
 */
function formatMetric(name, type, help, value, labels = {}) {
  const labelStr = Object.keys(labels).length > 0
    ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
    : ''

  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} ${type}`,
    `${name}${labelStr} ${value}`,
  ].join('\n')
}

/**
 * 生成 Prometheus 指标
 */
function generateMetrics() {
  const stats = multilevel.getStats()
  const mem = process.memoryUsage()
  const now = Date.now()

  const metrics = []

  // 1. 缓存指标
  metrics.push(formatMetric(
    'cache_l1_hits_total',
    'counter',
    'L1 cache hits',
    stats.l1.hits
  ))

  metrics.push(formatMetric(
    'cache_l1_misses_total',
    'counter',
    'L1 cache misses',
    stats.l1.misses
  ))

  metrics.push(formatMetric(
    'cache_l1_keys_total',
    'gauge',
    'L1 cache key count',
    stats.l1.keys
  ))

  metrics.push(formatMetric(
    'cache_l1_memory_bytes',
    'gauge',
    'L1 cache memory usage in bytes',
    stats.l1.vsize
  ))

  metrics.push(formatMetric(
    'cache_pending_requests_total',
    'gauge',
    'Pending cache requests',
    stats.total.pendingRequests
  ))

  metrics.push(formatMetric(
    'cache_total_sets',
    'counter',
    'Total cache set operations',
    stats.total.sets
  ))

  // L2 缓存 (Redis, 如果启用)
  if (stats.l2.hits > 0 || stats.l2.misses > 0) {
    metrics.push(formatMetric(
      'cache_l2_hits_total',
      'counter',
      'L2 cache hits',
      stats.l2.hits
    ))

    metrics.push(formatMetric(
      'cache_l2_misses_total',
      'counter',
      'L2 cache misses',
      stats.l2.misses
    ))
  }

  // 2. 内存指标
  metrics.push(formatMetric(
    'process_resident_memory_bytes',
    'gauge',
    'Resident memory size in bytes',
    mem.rss
  ))

  metrics.push(formatMetric(
    'nodejs_heap_size_total_bytes',
    'gauge',
    'Total heap size in bytes',
    mem.heapTotal
  ))

  metrics.push(formatMetric(
    'nodejs_heap_size_used_bytes',
    'gauge',
    'Used heap size in bytes',
    mem.heapUsed
  ))

  metrics.push(formatMetric(
    'nodejs_external_memory_bytes',
    'gauge',
    'External memory in bytes',
    mem.external
  ))

  // 3. 进程指标
  metrics.push(formatMetric(
    'process_uptime_seconds',
    'gauge',
    'Process uptime in seconds',
    Math.floor(process.uptime())
  ))

  metrics.push(formatMetric(
    'nodejs_version_info',
    'gauge',
    'Node.js version',
    1,
    { version: process.version }
  ))

  // 4. 自定义业务指标 (可选，需要在其他地方收集)
  if (global._metricsStore) {
    const store = global._metricsStore

    // 慢查询计数
    if (store.slowQueries !== undefined) {
      metrics.push(formatMetric(
        'slow_queries_total',
        'counter',
        'Total slow queries (> 500ms)',
        store.slowQueries
      ))
    }

    // 总查询计数
    if (store.totalQueries !== undefined) {
      metrics.push(formatMetric(
        'queries_total',
        'counter',
        'Total queries',
        store.totalQueries
      ))
    }

    // 批量查询平均并发数
    if (store.avgBatchConcurrency !== undefined) {
      metrics.push(formatMetric(
        'batch_query_concurrency',
        'gauge',
        'Average batch query concurrency',
        store.avgBatchConcurrency
      ))
    }

    // Hologres 连接池
    if (store.pgPoolTotal !== undefined) {
      metrics.push(formatMetric(
        'pg_pool_total_connections',
        'gauge',
        'PostgreSQL pool total connections',
        store.pgPoolTotal
      ))

      metrics.push(formatMetric(
        'pg_pool_idle_connections',
        'gauge',
        'PostgreSQL pool idle connections',
        store.pgPoolIdle
      ))

      metrics.push(formatMetric(
        'pg_pool_waiting_count',
        'gauge',
        'PostgreSQL pool waiting count',
        store.pgPoolWaiting
      ))
    }

    // 物化视图刷新耗时 (阶段 2)
    if (store.mvRefreshDuration) {
      Object.entries(store.mvRefreshDuration).forEach(([view, duration]) => {
        metrics.push(formatMetric(
          'materialized_view_refresh_duration_seconds',
          'gauge',
          'Materialized view refresh duration',
          duration / 1000,
          { view_name: view }
        ))
      })
    }
  }

  return metrics.join('\n\n') + '\n'
}

/**
 * Express 路由处理器
 */
function handler(req, res) {
  try {
    const metrics = generateMetrics()
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    res.send(metrics)
  } catch (err) {
    console.error('[Prometheus] Error generating metrics:', err)
    res.status(500).send('Internal Server Error')
  }
}

/**
 * 初始化全局指标存储
 */
function initMetricsStore() {
  if (!global._metricsStore) {
    global._metricsStore = {
      slowQueries: 0,
      totalQueries: 0,
      avgBatchConcurrency: 0,
      pgPoolTotal: 0,
      pgPoolIdle: 0,
      pgPoolWaiting: 0,
      mvRefreshDuration: {},
    }
  }
  return global._metricsStore
}

/**
 * 记录慢查询
 */
function recordSlowQuery() {
  const store = initMetricsStore()
  store.slowQueries++
  store.totalQueries++
}

/**
 * 记录查询
 */
function recordQuery() {
  const store = initMetricsStore()
  store.totalQueries++
}

/**
 * 更新批量查询并发数
 */
function updateBatchConcurrency(concurrency) {
  const store = initMetricsStore()
  store.avgBatchConcurrency = concurrency
}

/**
 * 更新连接池状态
 */
function updatePoolStats(total, idle, waiting) {
  const store = initMetricsStore()
  store.pgPoolTotal = total
  store.pgPoolIdle = idle
  store.pgPoolWaiting = waiting
}

/**
 * 记录物化视图刷新耗时
 */
function recordMVRefresh(viewName, durationMs) {
  const store = initMetricsStore()
  if (!store.mvRefreshDuration) {
    store.mvRefreshDuration = {}
  }
  store.mvRefreshDuration[viewName] = durationMs
}

module.exports = {
  handler,
  generateMetrics,
  initMetricsStore,
  recordSlowQuery,
  recordQuery,
  updateBatchConcurrency,
  updatePoolStats,
  recordMVRefresh,
}
