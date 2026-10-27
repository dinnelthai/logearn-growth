/**
 * Analytics facts API — returns mock-compatible shapes from SQLite.
 *
 *   GET /api/analytics/logearn_events?start=&end=
 *   GET /api/analytics/logearn_user
 *   GET /api/analytics/users                 (alias of logearn_user → { users })
 *   GET /api/analytics/logearn_user_referral
 *   GET /api/analytics/trades?start=ISO&end=ISO
 *   GET /api/events                         (events only, same payload)
 */
const express = require('express')
const db = require('../db/connection')

const router = express.Router()

/** Hard cap for raw event dumps — large datasets must use /api/metrics + /api/drill. */
const MAX_EVENTS_RAW = Number(process.env.MAX_EVENTS_RAW || 100000)

function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback
  } catch {
    return fallback
  }
}

function readKeyedMeta(table) {
  const rows = db.prepare(`SELECT key, value FROM ${table}`).all()
  const meta = {}
  for (const row of rows) {
    try {
      meta[row.key] = JSON.parse(row.value)
    } catch {
      meta[row.key] = row.value
    }
  }
  return meta
}

function eventFromRow(row) {
  return {
    event_id: row.event_id,
    event_name: row.event_name,
    user_id: row.user_id,
    anonymous_id: row.anonymous_id,
    first_entry_source: row.first_entry_source,
    session_entry_source: row.session_entry_source,
    session_id: row.session_id,
    client_ts: row.client_ts,
    page: row.page,
    referrer: row.referrer,
    chain: row.chain,
    app_version: row.app_version,
    device: row.device,
    ua: row.ua,
    lang: row.lang,
    properties: parseJson(row.properties, {}),
  }
}

function userFromRow(row) {
  return {
    user_id: row.user_id,
    created_at: row.created_at,
    telegram_bound: row.telegram_bound == null ? null : Boolean(row.telegram_bound),
    email_bound: row.email_bound == null ? null : Boolean(row.email_bound),
    is_partner: row.is_partner == null ? null : Boolean(row.is_partner),
    first_source: row.first_source,
    preferred_language: row.preferred_language,
    first_analysis_entry_module: row.first_analysis_entry_module,
    ...(row.first_analysis_at != null ? { first_analysis_at: row.first_analysis_at } : {}),
  }
}

function tradeFromRow(row) {
  const tradeId = typeof row.trade_id === 'string' && row.trade_id.startsWith('__noid__:')
    ? null
    : row.trade_id
  return {
    trade_id: tradeId,
    user_id: row.user_id,
    confirmed_at: row.confirmed_at,
    volume_usd: row.volume_usd,
    status: row.status,
    ...(row.chain != null ? { chain: row.chain } : {}),
    ...(row.mock_scenario != null ? { mock_scenario: row.mock_scenario } : {}),
    ...(row.trade_attempt_id != null ? { trade_attempt_id: row.trade_attempt_id } : {}),
  }
}

function readEventsMeta() {
  const meta = readKeyedMeta('events_meta')
  if (!meta.timezone) meta.timezone = 'Asia/Bangkok'
  if (meta.history_complete == null) meta.history_complete = true
  if (!meta.start_at || !meta.as_of) {
    const range = db.prepare('SELECT MIN(client_ts) AS min_ts, MAX(client_ts) AS max_ts FROM events').get()
    if (range?.min_ts != null && !meta.start_at) meta.start_at = new Date(range.min_ts).toISOString()
    if (range?.max_ts != null && !meta.as_of) meta.as_of = new Date(range.max_ts).toISOString()
    if (range?.max_ts != null && !meta.events_complete_through) {
      meta.events_complete_through = new Date(range.max_ts).toISOString()
    }
  }
  return meta
}

function listEvents(req, res) {
  const start = req.query.start != null && req.query.start !== '' ? Number(req.query.start) : null
  const end = req.query.end != null && req.query.end !== '' ? Number(req.query.end) : null
  if (start != null && !Number.isFinite(start)) return res.status(400).json({ error: 'start 必须是毫秒时间戳' })
  if (end != null && !Number.isFinite(end)) return res.status(400).json({ error: 'end 必须是毫秒时间戳' })

  const where = []
  const params = {}
  if (start != null) { where.push('client_ts >= @start'); params.start = start }
  if (end != null) { where.push('client_ts <= @end'); params.end = end }

  const countSql = `SELECT COUNT(*) AS n FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
  const count = db.prepare(countSql).get(params).n
  if (count > MAX_EVENTS_RAW) {
    return res.status(413).json({
      error: '事件结果集过大，请改用 /api/metrics/* 与 /api/drill/*',
      count,
      max: MAX_EVENTS_RAW,
      hint: 'GET /api/analytics/meta 可查看水位；全量明细仅用于小数据集调试',
    })
  }

  const events = db.prepare(`
    SELECT * FROM events
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY client_ts ASC, event_id ASC
  `).all(params).map(eventFromRow)

  res.json({ logearn_events: events, events, meta: readEventsMeta() })
}

/** GET /api/analytics/meta — lightweight bootstrap for large datasets */
function getMeta(_req, res) {
  const meta = readEventsMeta()
  const tradesMeta = readKeyedMeta('trades_meta')
  const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM logearn_users').get().n
  const factCount = (() => {
    try { return db.prepare('SELECT COUNT(*) AS n FROM user_facts').get().n } catch { return 0 }
  })()
  const rollupDays = (() => {
    try { return db.prepare('SELECT COUNT(*) AS n FROM daily_north_star').get().n } catch { return 0 }
  })()

  res.json({
    as_of: meta.as_of ?? null,
    start_at: meta.start_at ?? null,
    timezone: meta.timezone ?? 'Asia/Bangkok',
    history_complete: meta.history_complete === true || meta.history_complete === 'true',
    events_complete_through: meta.events_complete_through ?? null,
    event_count: eventCount,
    user_count: userCount,
    user_fact_count: factCount,
    north_star_days: rollupDays,
    rollups_built_at: meta.rollups_built_at ?? null,
    coverage: {
      events: {
        history_complete: meta.history_complete === true || meta.history_complete === 'true',
        events_complete_through: meta.events_complete_through ?? null,
        start_at: meta.start_at ?? null,
        as_of: meta.as_of ?? null,
      },
      trades: {
        trades_start_at: tradesMeta.trades_start_at ?? null,
        trades_complete_through: tradesMeta.trades_complete_through ?? null,
      },
    },
    mode: eventCount > MAX_EVENTS_RAW ? 'aggregated' : 'raw_ok',
    max_events_raw: MAX_EVENTS_RAW,
  })
}

function listUsers(_req, res) {
  const logearn_users = db.prepare(`
    SELECT * FROM logearn_users ORDER BY created_at ASC, user_id ASC
  `).all().map(userFromRow)
  res.json({ logearn_users, users: logearn_users })
}

function listReferrals(_req, res) {
  const trees = db.prepare(`SELECT * FROM referral_trees ORDER BY user_id ASC`).all()
  const invitees = db.prepare(`
    SELECT * FROM referral_invitees ORDER BY inviter_user_id ASC, level ASC, bound_at ASC
  `).all()

  const byInviter = new Map()
  for (const tree of trees) {
    byInviter.set(tree.user_id, {
      user_id: tree.user_id,
      invited_by: tree.invited_by,
      invited_at: tree.invited_at,
      invitees_l1: [],
      invitees_l2: [],
      invitees_l3: [],
      commission: parseJson(tree.commission, {}),
    })
  }
  for (const inv of invitees) {
    const tree = byInviter.get(inv.inviter_user_id)
    if (!tree) continue
    const item = {
      user_id: inv.invitee_user_id,
      bound_at: inv.bound_at,
      referral_link_id: inv.referral_link_id,
      share_type: inv.share_type,
    }
    if (inv.level === 1) tree.invitees_l1.push(item)
    else if (inv.level === 2) tree.invitees_l2.push(item)
    else if (inv.level === 3) tree.invitees_l3.push(item)
  }

  res.json({ logearn_user_referrals: [...byInviter.values()] })
}

function listTrades(req, res) {
  const startIso = req.query.start || null
  const endIso = req.query.end || null
  const startMs = startIso != null && startIso !== '' ? Date.parse(startIso) : null
  const endMs = endIso != null && endIso !== '' ? Date.parse(endIso) : null
  if (startIso && !Number.isFinite(startMs)) return res.status(400).json({ error: 'start 必须是 ISO 时间' })
  if (endIso && !Number.isFinite(endMs)) return res.status(400).json({ error: 'end 必须是 ISO 时间' })

  // confirmed_at is stored as ISO text; lexical compare works for UTC ISO-8601.
  const where = []
  const params = {}
  if (startIso) { where.push('confirmed_at >= @start'); params.start = new Date(startMs).toISOString() }
  if (endIso) { where.push('confirmed_at <= @end'); params.end = new Date(endMs).toISOString() }

  const trades = db.prepare(`
    SELECT * FROM trades
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY confirmed_at ASC, trade_id ASC
  `).all(params).map(tradeFromRow)

  res.json({ trades, meta: readKeyedMeta('trades_meta') })
}

router.get('/meta', getMeta)
router.get('/logearn_events', listEvents)
router.get('/logearn_user', listUsers)
router.get('/users', listUsers)
router.get('/logearn_user_referral', listReferrals)
router.get('/trades', listTrades)
router.get('/', listEvents) // also used under /api/events

module.exports = router
