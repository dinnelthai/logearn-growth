/**
 * 每日预聚合刷新任务
 *
 * 功能:
 * - 每日凌晨 2:00 自动刷新预聚合表
 * - 包含: 用户概览、来源质量、漏斗转化
 *
 * 调度方式:
 * - node-cron (推荐)
 * - PM2 cron
 * - 系统 crontab
 */

const cron = require('node-cron')
const { getPool } = require('../data/hologres')

/**
 * 刷新预聚合表
 * @param {Date} targetDate - 目标日期（默认昨天）
 */
async function refreshDailyRollups(targetDate = null) {
  const pool = getPool()

  // 默认刷新昨天的数据
  if (!targetDate) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    targetDate = yesterday
  }

  const dateStr = targetDate.toISOString().split('T')[0]

  console.log(`[Daily Rollup] Starting refresh for ${dateStr}...`)
  const startTime = Date.now()

  try {
    // 调用 PostgreSQL 存储过程
    await pool.query(`SELECT refresh_all_daily_rollups($1::DATE)`, [dateStr])

    const duration = Date.now() - startTime
    console.log(`[Daily Rollup] ✓ Completed in ${duration}ms`)

    // 验证数据
    const result = await pool.query(
      `SELECT total_events, unique_users, new_users
       FROM rollup_daily_overview
       WHERE date = $1`,
      [dateStr]
    )

    if (result.rows.length > 0) {
      const stats = result.rows[0]
      console.log(`[Daily Rollup] Stats for ${dateStr}:`)
      console.log(`  - Total Events: ${stats.total_events}`)
      console.log(`  - Unique Users: ${stats.unique_users}`)
      console.log(`  - New Users: ${stats.new_users}`)
    }

    return { success: true, duration, date: dateStr }
  } catch (error) {
    console.error(`[Daily Rollup] ✗ Failed for ${dateStr}:`, error.message)

    // 发送告警（可选）
    // await sendAlert('Daily Rollup Failed', error.message)

    return { success: false, error: error.message, date: dateStr }
  }
}

/**
 * 回填历史数据
 * @param {number} days - 回填天数
 */
async function backfillHistoricalData(days = 30) {
  console.log(`[Daily Rollup] Backfilling last ${days} days...`)

  const results = []

  for (let i = 1; i <= days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)

    const result = await refreshDailyRollups(date)
    results.push(result)

    // 避免数据库压力，每次间隔 1 秒
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  const successCount = results.filter(r => r.success).length
  console.log(`[Daily Rollup] Backfill completed: ${successCount}/${days} succeeded`)

  return results
}

/**
 * 启动定时任务
 */
function startScheduledRefresh() {
  // 方案 A: 每日凌晨 2:05 执行 (推荐)
  const schedule = process.env.ROLLUP_SCHEDULE || '5 2 * * *'

  console.log(`[Daily Rollup] Starting cron job: ${schedule}`)

  cron.schedule(schedule, async () => {
    console.log('[Daily Rollup] Cron triggered')
    await refreshDailyRollups()
  }, {
    timezone: process.env.TZ || 'Asia/Shanghai'
  })

  // 方案 B: 每小时检查是否需要刷新（更灵活）
  // cron.schedule('0 * * * *', async () => {
  //   const hour = new Date().getHours()
  //   if (hour === 2) {
  //     await refreshDailyRollups()
  //   }
  // })
}

/**
 * 手动触发刷新（用于 API 端点）
 */
async function manualRefresh(req, res) {
  const { date, days } = req.query

  try {
    if (days) {
      // 回填历史数据
      const results = await backfillHistoricalData(parseInt(days))
      return res.json({
        success: true,
        message: `Backfilled ${days} days`,
        results
      })
    } else if (date) {
      // 刷新指定日期
      const targetDate = new Date(date)
      const result = await refreshDailyRollups(targetDate)
      return res.json(result)
    } else {
      // 刷新昨天
      const result = await refreshDailyRollups()
      return res.json(result)
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * 健康检查 - 检查最近刷新时间
 */
async function healthCheck() {
  const pool = getPool()

  try {
    const result = await pool.query(`
      SELECT date, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS hours_since_refresh
      FROM rollup_daily_overview
      ORDER BY date DESC
      LIMIT 1
    `)

    if (result.rows.length === 0) {
      return {
        status: 'warn',
        message: 'No rollup data found'
      }
    }

    const latest = result.rows[0]
    const hoursSinceRefresh = parseFloat(latest.hours_since_refresh)

    // 如果超过 26 小时未刷新，告警
    if (hoursSinceRefresh > 26) {
      return {
        status: 'error',
        message: `Last refresh was ${hoursSinceRefresh.toFixed(1)} hours ago`,
        latestDate: latest.date
      }
    }

    return {
      status: 'ok',
      latestDate: latest.date,
      hoursSinceRefresh: hoursSinceRefresh.toFixed(1)
    }
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    }
  }
}

// ===================================================================
// 导出
// ===================================================================

module.exports = {
  refreshDailyRollups,
  backfillHistoricalData,
  startScheduledRefresh,
  manualRefresh,
  healthCheck
}

// ===================================================================
// 单独运行脚本
// ===================================================================

if (require.main === module) {
  const command = process.argv[2]

  if (command === 'refresh') {
    // 刷新昨天的数据
    refreshDailyRollups().then(result => {
      console.log('Result:', result)
      process.exit(result.success ? 0 : 1)
    })
  } else if (command === 'backfill') {
    // 回填最近 30 天
    const days = parseInt(process.argv[3]) || 30
    backfillHistoricalData(days).then(results => {
      const successCount = results.filter(r => r.success).length
      console.log(`${successCount}/${days} succeeded`)
      process.exit(successCount === days ? 0 : 1)
    })
  } else if (command === 'schedule') {
    // 启动定时任务
    console.log('Starting daily rollup scheduler...')
    startScheduledRefresh()
    console.log('Scheduler is running. Press Ctrl+C to exit.')
  } else {
    console.log('Usage:')
    console.log('  node dailyRollupRefresh.js refresh          # Refresh yesterday')
    console.log('  node dailyRollupRefresh.js backfill [days]  # Backfill N days')
    console.log('  node dailyRollupRefresh.js schedule         # Start cron scheduler')
    process.exit(1)
  }
}
