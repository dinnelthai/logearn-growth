/**
 * Paginated drill-down API. Numbers from /api/metrics/* and user lists here
 * must share the same filter params (P2-04 同口径).
 */
const express = require('express')
const db = require('../db/connection')
const { toDateStr } = require('../db/rebuildRollups')

const router = express.Router()
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100

function clampPage(offset, limit) {
  const off = Math.max(0, Number(offset) || 0)
  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT))
  return { offset: off, limit: lim }
}

function dateBounds(start, end) {
  return {
    startDate: toDateStr(start),
    endDateExclusive: toDateStr(end),
  }
}

function profileRows(userKeys) {
  if (!userKeys.length) return []
  const placeholders = userKeys.map(() => '?').join(',')
  const facts = db.prepare(`
    SELECT user_key, user_id, first_source, first_chip_at, first_visit_at, first_login_at
    FROM user_facts WHERE user_key IN (${placeholders})
  `).all(...userKeys)
  const byKey = new Map(facts.map(f => [f.user_key, f]))
  return userKeys.map(key => {
    const f = byKey.get(key) || {}
    const id = f.user_id ? `user:${f.user_id}` : key
    return {
      id,
      user_id: f.user_id ?? (key.startsWith('user:') ? key.slice(5) : null),
      source: f.first_source ?? '未知',
      first_chip_at: f.first_chip_at ?? null,
      first_visit_at: f.first_visit_at ?? null,
      first_event_at: f.first_chip_at ?? f.first_login_at ?? f.first_visit_at ?? null,
    }
  })
}

function filterQ(rows, q) {
  if (!q) return rows
  const needle = String(q).toLowerCase()
  return rows.filter(r =>
    `${r.id} ${r.user_id ?? ''} ${r.source ?? ''}`.toLowerCase().includes(needle)
  )
}

function northStarPeriodKeys({ start, end, source, cohort }) {
  const { startDate, endDateExclusive } = dateBounds(start, end)
  let sql
  let params
  if (cohort === 'new') {
    sql = `
      SELECT DISTINCT d.user_key AS user_key
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date >= ? AND d.date < ? AND d.is_new = 1
      ${source ? 'AND f.first_source = ?' : ''}
      ORDER BY d.user_key
    `
    params = source ? [startDate, endDateExclusive, source] : [startDate, endDateExclusive]
  } else if (cohort === 'returning') {
    sql = `
      SELECT DISTINCT d.user_key AS user_key
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date >= ? AND d.date < ?
        AND f.first_chip_at IS NOT NULL AND f.first_chip_at < ?
        ${source ? 'AND f.first_source = ?' : ''}
      ORDER BY d.user_key
    `
    params = source
      ? [startDate, endDateExclusive, start, source]
      : [startDate, endDateExclusive, start]
  } else {
    sql = `
      SELECT DISTINCT d.user_key AS user_key
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date >= ? AND d.date < ?
        ${source ? 'AND f.first_source = ?' : ''}
      ORDER BY d.user_key
    `
    params = source ? [startDate, endDateExclusive, source] : [startDate, endDateExclusive]
  }
  return db.prepare(sql).all(...params).map(r => r.user_key)
}

function northStarDayKeys({ date, source, cohort }) {
  if (!date) return []
  let sql
  let params
  if (cohort === 'new') {
    sql = `
      SELECT d.user_key AS user_key
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date = ? AND d.is_new = 1
      ${source ? 'AND f.first_source = ?' : ''}
      ORDER BY d.user_key
    `
    params = source ? [date, source] : [date]
  } else if (cohort === 'returning') {
    sql = `
      SELECT d.user_key AS user_key
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date = ? AND d.is_new = 0
      ${source ? 'AND f.first_source = ?' : ''}
      ORDER BY d.user_key
    `
    params = source ? [date, source] : [date]
  } else {
    sql = `
      SELECT d.user_key AS user_key
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date = ?
      ${source ? 'AND f.first_source = ?' : ''}
      ORDER BY d.user_key
    `
    params = source ? [date, source] : [date]
  }
  return db.prepare(sql).all(...params).map(r => r.user_key)
}

function northStarLoginDayKeys({ date, source, start, end }) {
  // Prefer explicit date; else derive from start of day window
  const day = date || (Number.isFinite(start) ? toDateStr(start) : null)
  if (!day) return []
  const dayStart = Date.parse(`${day}T00:00:00+07:00`)
  const dayEnd = dayStart + 86400000
  const rows = source
    ? db.prepare(`
        SELECT DISTINCT
          CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id ELSE 'anonymous:' || anonymous_id END AS user_key
        FROM events
        WHERE event_name = 'login_succeeded'
          AND client_ts >= ? AND client_ts < ?
          AND first_entry_source = ?
        ORDER BY user_key
      `).all(dayStart, dayEnd, source)
    : db.prepare(`
        SELECT DISTINCT
          CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id ELSE 'anonymous:' || anonymous_id END AS user_key
        FROM events
        WHERE event_name = 'login_succeeded'
          AND client_ts >= ? AND client_ts < ?
        ORDER BY user_key
      `).all(dayStart, dayEnd)
  return rows.map(r => r.user_key).filter(Boolean)
}

function channelVisitKeys({ start, end, channel }) {
  const { startDate, endDateExclusive } = dateBounds(start, end)
  const rows = channel
    ? db.prepare(`
        SELECT user_key FROM user_facts
        WHERE first_visit_at IS NOT NULL
          AND DATE(first_visit_at / 1000, 'unixepoch', '+7 hours') >= ?
          AND DATE(first_visit_at / 1000, 'unixepoch', '+7 hours') < ?
          AND first_channel_id = ?
        ORDER BY user_key
      `).all(startDate, endDateExclusive, channel)
    : db.prepare(`
        SELECT user_key FROM user_facts
        WHERE first_visit_at IS NOT NULL
          AND DATE(first_visit_at / 1000, 'unixepoch', '+7 hours') >= ?
          AND DATE(first_visit_at / 1000, 'unixepoch', '+7 hours') < ?
        ORDER BY user_key
      `).all(startDate, endDateExclusive)
  return rows.map(r => r.user_key)
}

function resolveKeys(kind, params = {}) {
  switch (kind) {
    case 'north_star_period':
      return northStarPeriodKeys(params)
    case 'north_star_day':
      return northStarDayKeys(params)
    case 'north_star_login_day':
      return northStarLoginDayKeys(params)
    case 'channel_visits':
      return channelVisitKeys(params)
    case 'cached_list': {
      const { cacheGet } = require('../analytics/resultCache')
      const cached = cacheGet(params.cache_id)
      if (!cached) return []
      const list = cached.lists?.[params.list_key]
      if (!Array.isArray(list)) return []
      return list.map(id => String(id))
    }
    default:
      return null
  }
}

/** POST /api/drill/users  { kind, params, offset, limit, q } */
router.post('/users', (req, res) => {
  const { kind, params = {}, q } = req.body ?? {}
  if (!kind) return res.status(400).json({ error: '缺少 kind' })
  const keys = resolveKeys(kind, params)
  if (keys == null) return res.status(400).json({ error: `未知 drill kind: ${kind}` })

  const profiles = filterQ(profileRows(keys), q)
  const { offset, limit } = clampPage(req.body?.offset, req.body?.limit)
  const rows = profiles.slice(offset, offset + limit)

  res.json({
    total: profiles.length,
    offset,
    limit,
    rows,
  })
})

/** GET /api/drill/timeline?user_id=&start=&end=&limit= */
router.get('/timeline', (req, res) => {
  const userId = req.query.user_id ? String(req.query.user_id).replace(/^user:/, '') : null
  if (!userId) return res.status(400).json({ error: '缺少 user_id' })
  const start = req.query.start != null ? Number(req.query.start) : null
  const end = req.query.end != null ? Number(req.query.end) : null
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200))

  const where = ['user_id = @user_id']
  const params = { user_id: userId }
  if (Number.isFinite(start)) { where.push('client_ts >= @start'); params.start = start }
  if (Number.isFinite(end)) { where.push('client_ts < @end'); params.end = end }

  const events = db.prepare(`
    SELECT event_id, event_name, client_ts, session_id, first_entry_source, chain, properties
    FROM events
    WHERE ${where.join(' AND ')}
    ORDER BY client_ts ASC, event_id ASC
    LIMIT ${limit}
  `).all(params).map(row => {
    let properties = {}
    try { properties = JSON.parse(row.properties || '{}') } catch { /* ignore */ }
    return {
      event_id: row.event_id,
      event_name: row.event_name,
      t: row.client_ts,
      session_id: row.session_id,
      entry_source: row.first_entry_source,
      chain: row.chain,
      properties,
    }
  })

  const fact = db.prepare(`
    SELECT user_key, first_source, first_chip_at, first_visit_at, first_login_at
    FROM user_facts WHERE user_id = ?
  `).get(userId)

  res.json({
    user: {
      id: `user:${userId}`,
      user_id: userId,
      source: fact?.first_source ?? '未知',
      first_chip_at: fact?.first_chip_at ?? null,
    },
    events,
    truncated: events.length >= limit,
  })
})

module.exports = router
