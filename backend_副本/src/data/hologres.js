const { Pool } = require('pg')
const { createHash } = require('node:crypto')
const multilevelCache = require('../cache/multilevel')

const table = process.env.SOURCE_EVENTS_TABLE || 'growth_events'
if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(table)) throw new Error('Invalid SOURCE_EVENTS_TABLE')
const mode = (process.env.PGSSL || 'prefer').toLowerCase()

function config(ssl) {
  return { ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE,
    user: process.env.PGUSER, password: process.env.PGPASSWORD,
  }), ssl,
    max: Number(process.env.PG_POOL_MAX || 10),  // 提升到 10 (原: 4)
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 3000),  // 3s (原: 5s)
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),  // 30s
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000),  // 15s (原: 10s)
  }
}

let pool

async function getPool() {
  if (pool) return pool
  const ssl = mode === 'disable' ? false : mode === 'no-verify' ? { rejectUnauthorized: false } : true
  const candidate = new Pool(config(ssl))
  candidate.on('error', err => console.error('[hologres pool]', err.message))
  try { await candidate.query('SELECT 1') } catch (err) {
    await candidate.end()
    if (mode !== 'prefer' || !/does not support SSL/i.test(err.message)) throw err
    pool = new Pool(config(false))
    pool.on('error', err => console.error('[hologres pool]', err.message))
    return pool
  }
  pool = candidate
  return pool
}

let connecting

/**
 * 执行 Hologres 查询 (带慢查询日志 + Prometheus 指标)
 */
async function query(sql, params = []) {
  if (!pool) { connecting ||= getPool().finally(() => { connecting = null }); await connecting }
  if (pool.waitingCount >= 20) throw Object.assign(new Error('查询队列已满，请稍后重试'), { status: 429 })

  const start = Date.now()
  const queryId = Math.random().toString(36).slice(2, 8)

  // 更新连接池指标
  try {
    const prometheus = require('../monitoring/prometheus')
    prometheus.updatePoolStats(
      pool.totalCount || 0,
      pool.idleCount || 0,
      pool.waitingCount || 0
    )
  } catch (err) {
    // Prometheus 模块可选，失败不影响查询
  }

  try {
    const result = await pool.query(sql, params)
    const duration = Date.now() - start

    // 记录查询指标
    try {
      const prometheus = require('../monitoring/prometheus')
      if (duration > 500) {
        prometheus.recordSlowQuery()
      }
      prometheus.recordQuery() // 总查询计数在慢查询判断之后，避免重复
    } catch (err) {
      // 忽略指标记录错误
    }

    // 慢查询告警 (> 500ms)
    if (duration > 500) {
      console.warn(`[Hologres Slow Query] ${queryId} took ${duration}ms`, {
        sql: sql.slice(0, 200),
        rows: result.rows.length,
        waitingCount: pool.waitingCount,
      })
    }

    return result.rows
  } catch (err) {
    const duration = Date.now() - start
    console.error(`[Hologres Query Error] ${queryId} after ${duration}ms:`, err.message)
    throw err
  }
}

/**
 * 智能缓存包装器 (使用多级缓存)
 * @deprecated 使用 multilevelCache.cached 替代
 */
async function cached(key, fn, ttl = 30000) {
  return multilevelCache.cached(key, fn, {
    ttl: ttl / 1000,
    staleWhileRevalidate: false, // Keep snapshot freshness and explicit refresh deterministic.
    swr_probability: 0.1,
  })
}
// Remote queries exclude later arrivals; source updates/deletes remain weakly
// consistent. The optional path index pins its projected facts to a generation.
function eventsCte(cutoffIndex = 1) {
  return `WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY server_ts, id) AS rn
    FROM ${table} WHERE server_ts <= $${cutoffIndex}::timestamptz
      AND event_id IS NOT NULL AND BTRIM(event_id) <> '' AND client_ts IS NOT NULL
      AND client_ts >= 0 AND client_ts <= EXTRACT(EPOCH FROM $${cutoffIndex}::timestamptz)*1000
  ), identities AS (
    SELECT anonymous_id, MIN(user_id) AS linked_user FROM ranked
    WHERE user_id IS NOT NULL AND BTRIM(user_id) <> '' AND anonymous_id IS NOT NULL
    GROUP BY anonymous_id HAVING COUNT(DISTINCT user_id) = 1
  ), e AS (
    SELECT r.*, CASE WHEN NULLIF(BTRIM(r.user_id),'') IS NOT NULL THEN 'user:' || r.user_id
      WHEN i.linked_user IS NOT NULL THEN 'user:' || i.linked_user
      ELSE 'anonymous:' || r.anonymous_id END AS user_key,
      TO_CHAR(TO_TIMESTAMP(client_ts / 1000.0) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS date
    FROM ranked r LEFT JOIN identities i ON i.anonymous_id = r.anonymous_id
    WHERE rn = 1 AND (NULLIF(BTRIM(r.user_id),'') IS NOT NULL OR NULLIF(BTRIM(r.anonymous_id),'') IS NOT NULL)
      AND LEFT(BTRIM(COALESCE(NULLIF(BTRIM(r.user_id),''),i.linked_user,'')),4) <> 'acc_'
      AND NOT (NULLIF(BTRIM(r.user_id),'') IS NULL AND EXISTS (
        SELECT 1 FROM ranked dirty WHERE dirty.anonymous_id=r.anonymous_id AND LEFT(BTRIM(dirty.user_id),4)='acc_'
      ))
  ), facts AS (
    SELECT user_key,
      MIN(client_ts) FILTER (WHERE event_name IN ('chip_analysis_viewed','chip_analysis_drilldown')) AS first_chip,
      (ARRAY_AGG(first_entry_source ORDER BY client_ts, event_id) FILTER (WHERE first_entry_source IS NOT NULL))[1] AS source
    FROM e GROUP BY user_key
  )`
}
async function status(force = false, {raw = false} = {}) {
  if (!force && !raw && process.env.ENABLE_PATH_INDEX === 'true') {
    const indexed = require('../pathIndex/reader').latest()
    if (indexed) {
      await multilevelCache.set(`snapshot:${indexed.snapshot_id}`, indexed, 15 * 60)
      return indexed
    }
  }
  if (force) multilevelCache.del('status')
  return cached('status', async () => {
    const cutoff = new Date().toISOString()
    const [row] = await query(`${eventsCte()} SELECT COUNT(*) AS n, MIN(client_ts) AS start, MAX(client_ts) AS latest,
      MAX(server_ts) AS source_seen FROM e`, [cutoff])
    if (Number(row.n) === 0 || row.start == null || row.latest == null) throw new Error('远程事件为空或缺少有效时间')
    const [sources, strategies, eventTypes] = await Promise.all([
      query(`${eventsCte()} SELECT DISTINCT first_entry_source AS value FROM e WHERE first_entry_source IS NOT NULL ORDER BY 1 LIMIT 100`, [cutoff]),
      query(`${eventsCte()} SELECT DISTINCT properties->>'strategy_type' AS value FROM e WHERE event_name='strategy_started' AND properties->>'strategy_type' IS NOT NULL ORDER BY 1 LIMIT 100`, [cutoff]),
      query(`${eventsCte()} SELECT DISTINCT event_name,properties->>'module' AS module FROM e`, [cutoff])
    ])
    const { internalType, TYPE_TO_RAWS } = require('../analytics/eventMap')
    const funnelSteps = ['daily_visit', 'logged_in_visit', 'login_verified', ...new Set(eventTypes.map(r => internalType(r.event_name, { module: r.module })).filter(t => t && TYPE_TO_RAWS[t]))]
    const snapshot = createHash('sha1').update(cutoff).digest('hex').slice(0, 16)
    const value = {
      mode: 'aggregated', storage: 'hologres', data_version: snapshot, snapshot_id: snapshot,
      snapshot_cutoff: cutoff, funnel_steps: funnelSteps, sources: sources.map(r => r.value), strategies: strategies.map(r => r.value), start_at: new Date(Number(row.start)).toISOString(),
      as_of: new Date(Math.min(Number(row.latest), Date.parse(cutoff))).toISOString(), last_success_at: cutoff,
      latest_event_at: new Date(Number(row.latest)).toISOString(), source_seen_at: row.source_seen,
      event_count: Number(row.n), max_events_raw: 0, timezone: 'Asia/Bangkok', history_complete: false,
      events_complete_through: null, capabilities: ['conversion-loss', 'tracking-audit', 'growth-insights', 'value-diagnostics', 'login-conversion', 'invite-conversion', 'north', 'funnel', 'retention', 'segments', 'referral', 'paths', 'trade-monitor', 'channels'], consistency: 'arrival-cutoff',
      coverage: { events: { history_complete: false, events_complete_through: null }, trades: {} }
    }
    await multilevelCache.set(`snapshot:${snapshot}`, value, 15 * 60) // 15 分钟
    return value
  }, 30000)
}

async function snapshot(id) {
  if (!id) return status()
  const hit = await multilevelCache.get(`snapshot:${id}`)
  if (!hit || !hit.value || typeof hit.value !== 'object') {
    throw Object.assign(new Error('分析快照已过期，请重新运行'), { status: 409 })
  }
  return hit.value
}

async function close() { if (pool) await pool.end(); pool = null }

function getCached(key) {
  const hit = multilevelCache.l1.get(key)
  return hit !== undefined ? hit : null
}

function deleteCached(key) {
  multilevelCache.del(key)
}

module.exports = {
  query,
  cached,
  getCached,
  deleteCached,
  eventsCte,
  status,
  snapshot,
  close,
  sourceEventsTable: () => table,
  cacheStats: () => multilevelCache.getStats(), // 新增: 导出缓存统计
}
