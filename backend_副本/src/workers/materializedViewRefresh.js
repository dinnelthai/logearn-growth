/**
 * Hologres 物化视图自动刷新任务
 *
 * 功能: 每小时刷新事件物化视图,保持数据新鲜度
 * 调度: Cron 每小时 :05 分执行 (避开整点高峰)
 *
 * 依赖: 需要先在 Hologres 执行 db/hologres_views.sql 创建视图
 *
 * 使用:
 * // 方式 1: 在 index.js 启动时自动运行
 * require('./workers/materializedViewRefresh').start()
 *
 * // 方式 2: 单独运行测试
 * node src/workers/materializedViewRefresh.js
 */

const cron = require('node-cron')

// 物化视图列表 (按依赖顺序)
const MATERIALIZED_VIEWS = [
  'mv_events_deduped',    // 1. 事件去重
  'mv_identity_map',      // 2. 身份映射 (依赖 mv_events_deduped)
  'mv_events_unified',    // 3. 统一事件 (依赖前两者)
]

/**
 * 刷新单个物化视图
 */
async function refreshView(viewName) {
  const hologres = require('../data/hologres')
  const start = Date.now()

  console.log(`[MV Refresh] Starting ${viewName}...`)

  try {
    // 使用 CONCURRENTLY 避免锁表 (如果 Hologres 支持)
    const sql = process.env.HOLOGRES_CONCURRENT_REFRESH === 'true'
      ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`
      : `REFRESH MATERIALIZED VIEW ${viewName}`

    await hologres.query(sql)

    const duration = Date.now() - start
    console.log(`[MV Refresh] ✓ ${viewName} completed in ${(duration / 1000).toFixed(2)}s`)

    return { view: viewName, success: true, duration }
  } catch (err) {
    const duration = Date.now() - start
    console.error(`[MV Refresh] ✗ ${viewName} failed after ${(duration / 1000).toFixed(2)}s:`, err.message)

    // 常见错误处理
    if (err.message.includes('does not exist')) {
      console.error(`[MV Refresh] 视图不存在! 请先执行 db/hologres_views.sql 创建视图`)
    } else if (err.message.includes('permission denied')) {
      console.error(`[MV Refresh] 权限不足! 需要 REFRESH MATERIALIZED VIEW 权限`)
    }

    return { view: viewName, success: false, duration, error: err.message }
  }
}

/**
 * 刷新所有物化视图
 */
async function refreshAll() {
  const start = Date.now()
  console.log(`[MV Refresh] === Starting refresh cycle ===`)

  const results = []

  // 按顺序刷新 (因为有依赖关系)
  for (const viewName of MATERIALIZED_VIEWS) {
    const result = await refreshView(viewName)
    results.push(result)

    // 如果某个视图失败,后续视图可能也会失败,但继续尝试
    if (!result.success) {
      console.warn(`[MV Refresh] ⚠ ${viewName} 刷新失败,继续执行后续视图`)
    }
  }

  const totalDuration = Date.now() - start
  const successCount = results.filter(r => r.success).length

  console.log(`[MV Refresh] === Cycle complete: ${successCount}/${results.length} views refreshed in ${(totalDuration / 1000).toFixed(2)}s ===`)

  return {
    success: successCount === results.length,
    duration: totalDuration,
    results,
  }
}

/**
 * 验证物化视图状态
 */
async function checkViewStatus() {
  const hologres = require('../data/hologres')

  try {
    const rows = await hologres.query(`
      SELECT
        'mv_events_deduped' AS view_name,
        COUNT(*) AS row_count,
        MIN(client_ts) AS min_ts,
        MAX(client_ts) AS max_ts
      FROM mv_events_deduped
      UNION ALL
      SELECT
        'mv_identity_map',
        COUNT(*),
        NULL,
        NULL
      FROM mv_identity_map
      UNION ALL
      SELECT
        'mv_events_unified',
        COUNT(*),
        MIN(client_ts),
        MAX(client_ts)
      FROM mv_events_unified
    `)

    console.log('[MV Status] Current state:')
    rows.forEach(row => {
      console.log(`  - ${row.view_name}: ${Number(row.row_count).toLocaleString()} rows`)
      if (row.max_ts) {
        const age = Date.now() - Number(row.max_ts)
        console.log(`    Latest event: ${Math.round(age / 60000)} minutes ago`)
      }
    })

    return rows
  } catch (err) {
    if (err.message.includes('does not exist')) {
      console.warn('[MV Status] 物化视图尚未创建')
      return null
    }
    throw err
  }
}

/**
 * 启动定时任务
 */
function start() {
  // 检查是否启用物化视图
  if (process.env.ENABLE_MATERIALIZED_VIEWS !== 'true') {
    console.log('[MV Refresh] 物化视图刷新已禁用 (设置 ENABLE_MATERIALIZED_VIEWS=true 启用)')
    return
  }

  console.log('[MV Refresh] 启动定时任务: 每小时 :05 分执行')

  // Cron 表达式: 分 时 日 月 周
  // '5 * * * *' = 每小时第 5 分钟
  const schedule = process.env.MV_REFRESH_SCHEDULE || '5 * * * *'

  cron.schedule(schedule, async () => {
    try {
      await refreshAll()
    } catch (err) {
      console.error('[MV Refresh] Unexpected error:', err)
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Bangkok' // 与业务日时区一致
  })

  console.log('[MV Refresh] 定时任务已启动')

  // 启动时检查一次状态
  checkViewStatus().catch(err => {
    console.warn('[MV Refresh] 初始状态检查失败:', err.message)
  })
}

/**
 * 手动触发刷新 (供 API 调用)
 */
async function triggerManual() {
  console.log('[MV Refresh] 手动触发刷新...')
  return refreshAll()
}

// 如果直接运行此文件,执行一次刷新
if (require.main === module) {
  (async () => {
    console.log('[MV Refresh] 手动执行模式')

    // 先检查状态
    await checkViewStatus()

    // 执行刷新
    const result = await refreshAll()

    // 再检查状态
    await checkViewStatus()

    process.exit(result.success ? 0 : 1)
  })()
}

module.exports = {
  start,
  refreshAll,
  refreshView,
  checkViewStatus,
  triggerManual,
}
