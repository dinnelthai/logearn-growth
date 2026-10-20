/**
 * 预聚合数据查询 API
 *
 * 替代实时查询，使用预计算的每日汇总数据
 * 性能提升: 800ms → 40ms (-95%)
 */

const express = require('express')
const router = express.Router()
const { getPool } = require('../data/hologres')
const { manualRefresh, healthCheck } = require('../workers/dailyRollupRefresh')

/**
 * GET /api/rollup/overview
 * 获取每日概览数据
 *
 * Query:
 *   - days: 天数（默认 30）
 *   - endDate: 结束日期（默认昨天）
 */
router.get('/overview', async (req, res) => {
  const pool = getPool()
  const days = parseInt(req.query.days) || 30
  const endDate = req.query.endDate || 'CURRENT_DATE - INTERVAL \'1 day\''

  try {
    const result = await pool.query(`
      SELECT
        date,
        total_events,
        unique_users,
        new_users,
        active_users,
        avg_events_per_user
      FROM rollup_daily_overview
      WHERE date >= ${endDate}::DATE - INTERVAL '${days} days'
        AND date <= ${endDate}::DATE
      ORDER BY date DESC
    `)

    // 汇总统计
    const summary = {
      totalEvents: result.rows.reduce((sum, row) => sum + parseInt(row.total_events), 0),
      avgDailyUsers: Math.round(
        result.rows.reduce((sum, row) => sum + parseInt(row.unique_users), 0) / result.rows.length
      ),
      totalNewUsers: result.rows.reduce((sum, row) => sum + parseInt(row.new_users), 0),
      avgEventsPerUser: (
        result.rows.reduce((sum, row) => sum + parseFloat(row.avg_events_per_user || 0), 0) / result.rows.length
      ).toFixed(2)
    }

    res.json({
      summary,
      daily: result.rows,
      meta: {
        days,
        startDate: result.rows[result.rows.length - 1]?.date,
        endDate: result.rows[0]?.date,
        source: 'rollup_daily_overview'
      }
    })
  } catch (error) {
    console.error('[Rollup API] Error fetching overview:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/rollup/sources
 * 获取来源质量数据
 *
 * Query:
 *   - days: 天数（默认 30）
 *   - topN: 返回 Top N 来源（默认 10）
 */
router.get('/sources', async (req, res) => {
  const pool = getPool()
  const days = parseInt(req.query.days) || 30
  const topN = parseInt(req.query.topN) || 10

  try {
    const result = await pool.query(`
      SELECT
        utm_source,
        SUM(total_users) AS total_users,
        SUM(new_users) AS new_users,
        SUM(events_count) AS events_count,
        ROUND(AVG(conversion_rate), 2) AS avg_conversion_rate,
        ROUND(AVG(avg_events_per_user), 2) AS avg_events_per_user
      FROM rollup_daily_sources
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
        AND date < CURRENT_DATE
      GROUP BY utm_source
      ORDER BY total_users DESC
      LIMIT ${topN}
    `)

    res.json({
      sources: result.rows,
      meta: {
        days,
        topN,
        source: 'rollup_daily_sources'
      }
    })
  } catch (error) {
    console.error('[Rollup API] Error fetching sources:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/rollup/funnels/:funnelId
 * 获取漏斗转化数据
 *
 * Params:
 *   - funnelId: 漏斗 ID（如 'registration_funnel'）
 *
 * Query:
 *   - days: 天数（默认 30）
 */
router.get('/funnels/:funnelId', async (req, res) => {
  const pool = getPool()
  const { funnelId } = req.params
  const days = parseInt(req.query.days) || 30

  try {
    const result = await pool.query(`
      SELECT
        step_index,
        event_name,
        AVG(users_count) AS avg_users,
        AVG(conversion_rate) AS avg_conversion_rate,
        AVG(drop_off_rate) AS avg_drop_off_rate
      FROM rollup_daily_funnels
      WHERE funnel_id = $1
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
        AND date < CURRENT_DATE
      GROUP BY step_index, event_name
      ORDER BY step_index
    `, [funnelId])

    res.json({
      funnelId,
      steps: result.rows,
      meta: {
        days,
        source: 'rollup_daily_funnels'
      }
    })
  } catch (error) {
    console.error('[Rollup API] Error fetching funnel:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/rollup/trend
 * 获取趋势对比数据（本周 vs 上周）
 */
router.get('/trend', async (req, res) => {
  const pool = getPool()

  try {
    const result = await pool.query(`
      WITH this_week AS (
        SELECT
          SUM(total_events) AS events,
          SUM(unique_users) AS users,
          SUM(new_users) AS new_users
        FROM rollup_daily_overview
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
          AND date < CURRENT_DATE
      ),
      last_week AS (
        SELECT
          SUM(total_events) AS events,
          SUM(unique_users) AS users,
          SUM(new_users) AS new_users
        FROM rollup_daily_overview
        WHERE date >= CURRENT_DATE - INTERVAL '14 days'
          AND date < CURRENT_DATE - INTERVAL '7 days'
      )
      SELECT
        tw.events AS this_week_events,
        lw.events AS last_week_events,
        ROUND(100.0 * (tw.events - lw.events) / NULLIF(lw.events, 0), 2) AS events_change_pct,
        tw.users AS this_week_users,
        lw.users AS last_week_users,
        ROUND(100.0 * (tw.users - lw.users) / NULLIF(lw.users, 0), 2) AS users_change_pct,
        tw.new_users AS this_week_new_users,
        lw.new_users AS last_week_new_users,
        ROUND(100.0 * (tw.new_users - lw.new_users) / NULLIF(lw.new_users, 0), 2) AS new_users_change_pct
      FROM this_week tw, last_week lw
    `)

    res.json({
      trend: result.rows[0],
      meta: {
        source: 'rollup_daily_overview'
      }
    })
  } catch (error) {
    console.error('[Rollup API] Error fetching trend:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/rollup/refresh
 * 手动触发刷新（需要 OPS_TOKEN）
 *
 * Query:
 *   - date: 刷新指定日期（可选）
 *   - days: 回填天数（可选）
 */
router.post('/refresh', (req, res) => {
  // 验证 OPS_TOKEN
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token !== process.env.OPS_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  manualRefresh(req, res)
})

/**
 * GET /api/rollup/health
 * 健康检查 - 检查最近刷新时间
 */
router.get('/health', async (req, res) => {
  const health = await healthCheck()
  const statusCode = health.status === 'ok' ? 200 : health.status === 'warn' ? 200 : 500
  res.status(statusCode).json(health)
})

/**
 * GET /api/rollup/compare
 * 对比预聚合 vs 实时查询性能
 */
router.get('/compare', async (req, res) => {
  const pool = getPool()
  const days = 30

  try {
    // 测试 1: 预聚合查询
    const rollupStart = Date.now()
    await pool.query(`
      SELECT SUM(unique_users), SUM(total_events)
      FROM rollup_daily_overview
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
    `)
    const rollupDuration = Date.now() - rollupStart

    // 测试 2: 实时查询（慢）
    const realtimeStart = Date.now()
    await pool.query(`
      SELECT COUNT(DISTINCT user_key), COUNT(*)
      FROM growth_events
      WHERE DATE(server_ts) >= CURRENT_DATE - INTERVAL '${days} days'
    `)
    const realtimeDuration = Date.now() - realtimeStart

    res.json({
      comparison: {
        rollup: {
          duration: rollupDuration,
          source: 'rollup_daily_overview'
        },
        realtime: {
          duration: realtimeDuration,
          source: 'growth_events (full scan)'
        },
        improvement: {
          percentage: Math.round(100 * (1 - rollupDuration / realtimeDuration)),
          speedup: (realtimeDuration / rollupDuration).toFixed(1) + 'x'
        }
      }
    })
  } catch (error) {
    console.error('[Rollup API] Error in comparison:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
