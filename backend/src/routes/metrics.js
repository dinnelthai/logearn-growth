/**
 * Aggregated metrics API for large datasets (P2-04).
 * Browser should call these instead of downloading raw events.
 */
const express = require('express')
const db = require('../db/connection')
const { toDateStr } = require('../db/rebuildRollups')

const router = express.Router()
const TZ_OFFSET_MS = 7 * 3600000
const DAY = 86400000

function readKeyedMeta(table) {
  const rows = db.prepare(`SELECT key, value FROM ${table}`).all()
  const meta = {}
  for (const row of rows) {
    try { meta[row.key] = JSON.parse(row.value) } catch { meta[row.key] = row.value }
  }
  return meta
}

function parseRange(query) {
  const start = query.start != null && query.start !== '' ? Number(query.start) : NaN
  const end = query.end != null && query.end !== '' ? Number(query.end) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return { error: 'start/end 必须是毫秒时间戳且 start < end' }
  }
  return { start, end }
}

function dateBounds(start, end) {
  return {
    startDate: toDateStr(start),
    // end is exclusive; last included business date is the day of (end - 1ms)
    endDateExclusive: toDateStr(end),
    lastDate: toDateStr(end - 1),
  }
}

function coverageFor(start, end) {
  const eventsMeta = readKeyedMeta('events_meta')
  const tradesMeta = readKeyedMeta('trades_meta')
  return {
    events: {
      history_complete: eventsMeta.history_complete === true || eventsMeta.history_complete === 'true',
      events_complete_through: eventsMeta.events_complete_through ?? null,
      start_at: eventsMeta.start_at ?? null,
      as_of: eventsMeta.as_of ?? null,
    },
    trades: {
      trades_start_at: tradesMeta.trades_start_at ?? null,
      trades_complete_through: tradesMeta.trades_complete_through ?? null,
    },
    range: { start, end },
  }
}

/** GET /api/metrics/north-star?start&end&source= */
router.get('/north-star', (req, res) => {
  const range = parseRange(req.query)
  if (range.error) return res.status(400).json({ error: range.error })
  const { start, end } = range
  const source = req.query.source && req.query.source !== 'all' ? String(req.query.source) : null
  const { startDate, endDateExclusive } = dateBounds(start, end)

  // When source filter is set we cannot use pre-aggregated daily_north_star alone
  // (that table is global). Fall back to membership ∩ user_facts.
  let days
  if (!source) {
    days = db.prepare(`
      SELECT date, active_users, new_users, returning_users, login_users, chip_events
      FROM daily_north_star
      WHERE date >= ? AND date < ?
      ORDER BY date ASC
    `).all(startDate, endDateExclusive)
  } else {
    days = db.prepare(`
      SELECT
        d.date AS date,
        COUNT(*) AS active_users,
        SUM(d.is_new) AS new_users,
        SUM(CASE WHEN d.is_new = 0 THEN 1 ELSE 0 END) AS returning_users,
        0 AS login_users,
        0 AS chip_events
      FROM daily_north_star_users d
      JOIN user_facts f ON f.user_key = d.user_key
      WHERE d.date >= ? AND d.date < ?
        AND f.first_source = ?
      GROUP BY d.date
      ORDER BY d.date ASC
    `).all(startDate, endDateExclusive, source)

    // Fill login_users / chip_events from raw for filtered source (bounded by window)
    const loginCounts = db.prepare(`
      SELECT DATE(client_ts / 1000, 'unixepoch', '+7 hours') AS date, COUNT(DISTINCT user_id) AS n
      FROM events
      WHERE event_name = 'login_succeeded'
        AND client_ts >= ? AND client_ts < ?
        AND first_entry_source = ?
      GROUP BY date
    `).all(start, end, source)
    const loginMap = new Map(loginCounts.map(r => [r.date, r.n]))
    const chipCounts = db.prepare(`
      SELECT DATE(client_ts / 1000, 'unixepoch', '+7 hours') AS date, COUNT(*) AS n
      FROM events
      WHERE event_name = 'chip_analysis_viewed'
        AND client_ts >= ? AND client_ts < ?
        AND first_entry_source = ?
      GROUP BY date
    `).all(start, end, source)
    const chipMap = new Map(chipCounts.map(r => [r.date, r.n]))
    days = days.map(d => ({
      ...d,
      login_users: loginMap.get(d.date) ?? 0,
      chip_events: chipMap.get(d.date) ?? 0,
    }))
  }

  // Period unique active users (not sum of daily)
  const periodActive = source
    ? db.prepare(`
        SELECT COUNT(DISTINCT d.user_key) AS n
        FROM daily_north_star_users d
        JOIN user_facts f ON f.user_key = d.user_key
        WHERE d.date >= ? AND d.date < ? AND f.first_source = ?
      `).get(startDate, endDateExclusive, source).n
    : db.prepare(`
        SELECT COUNT(DISTINCT user_key) AS n
        FROM daily_north_star_users
        WHERE date >= ? AND date < ?
      `).get(startDate, endDateExclusive).n

  const periodNew = source
    ? db.prepare(`
        SELECT COUNT(DISTINCT d.user_key) AS n
        FROM daily_north_star_users d
        JOIN user_facts f ON f.user_key = d.user_key
        WHERE d.date >= ? AND d.date < ? AND d.is_new = 1 AND f.first_source = ?
      `).get(startDate, endDateExclusive, source).n
    : db.prepare(`
        SELECT COUNT(DISTINCT user_key) AS n
        FROM daily_north_star_users
        WHERE date >= ? AND date < ? AND is_new = 1
      `).get(startDate, endDateExclusive).n

  // Returning in period = active whose first_chip is before start
  const periodReturning = source
    ? db.prepare(`
        SELECT COUNT(DISTINCT d.user_key) AS n
        FROM daily_north_star_users d
        JOIN user_facts f ON f.user_key = d.user_key
        WHERE d.date >= ? AND d.date < ?
          AND f.first_source = ?
          AND f.first_chip_at IS NOT NULL AND f.first_chip_at < ?
      `).get(startDate, endDateExclusive, source, start).n
    : db.prepare(`
        SELECT COUNT(DISTINCT d.user_key) AS n
        FROM daily_north_star_users d
        JOIN user_facts f ON f.user_key = d.user_key
        WHERE d.date >= ? AND d.date < ?
          AND f.first_chip_at IS NOT NULL AND f.first_chip_at < ?
      `).get(startDate, endDateExclusive, start).n

  const avgDaa = days.length
    ? days.reduce((n, d) => n + Number(d.active_users || 0), 0) / days.length
    : 0

  res.json({
    days: days.map(d => ({
      date: d.date,
      active_users: Number(d.active_users) || 0,
      new_users: Number(d.new_users) || 0,
      returning_users: Number(d.returning_users) || 0,
      login_users: Number(d.login_users) || 0,
      chip_events: Number(d.chip_events) || 0,
    })),
    totals: {
      active_users: periodActive,
      new_users: periodNew,
      returning_users: periodReturning,
      avg_daa: avgDaa,
      days: days.length,
    },
    coverage: coverageFor(start, end),
    drill: {
      period_active: { kind: 'north_star_period', params: { start, end, source, cohort: 'active' } },
      period_new: { kind: 'north_star_period', params: { start, end, source, cohort: 'new' } },
      period_returning: { kind: 'north_star_period', params: { start, end, source, cohort: 'returning' } },
      day_active: { kind: 'north_star_day', params: { source, cohort: 'active' } },
      day_new: { kind: 'north_star_day', params: { source, cohort: 'new' } },
      day_returning: { kind: 'north_star_day', params: { source, cohort: 'returning' } },
      day_login: { kind: 'north_star_login_day', params: { source } },
    },
  })
})

/** GET /api/metrics/channels?start&end&channel= */
router.get('/channels', (req, res) => {
  const range = parseRange(req.query)
  if (range.error) return res.status(400).json({ error: range.error })
  const { start, end } = range
  const channel = req.query.channel && req.query.channel !== 'all' ? String(req.query.channel) : null
  const { startDate, endDateExclusive } = dateBounds(start, end)

  const rows = channel
    ? db.prepare(`
        SELECT * FROM daily_channel_stats
        WHERE date >= ? AND date < ? AND channel_id = ?
        ORDER BY date ASC
      `).all(startDate, endDateExclusive, channel)
    : db.prepare(`
        SELECT * FROM daily_channel_stats
        WHERE date >= ? AND date < ?
        ORDER BY date ASC, channel_id ASC
      `).all(startDate, endDateExclusive)

  const byChannel = new Map()
  const byDate = new Map()
  const sum = (a, b) => ({
    visits: a.visits + b.visits,
    logins: a.logins + b.logins,
    tokens: a.tokens + b.tokens,
    chips: a.chips + b.chips,
    analyses: a.analyses + b.analyses,
    strategies: a.strategies + b.strategies,
    d7_eligible: a.d7_eligible + b.d7_eligible,
    d7_retained: a.d7_retained + b.d7_retained,
    traders: a.traders + b.traders,
    volume_usd: a.volume_usd + b.volume_usd,
  })
  const zero = {
    visits: 0, logins: 0, tokens: 0, chips: 0, analyses: 0, strategies: 0,
    d7_eligible: 0, d7_retained: 0, traders: 0, volume_usd: 0,
  }

  for (const r of rows) {
    const piece = {
      visits: r.visits, logins: r.logins, tokens: r.tokens, chips: r.chips,
      analyses: r.analyses, strategies: r.strategies,
      d7_eligible: r.d7_eligible, d7_retained: r.d7_retained,
      traders: r.traders, volume_usd: r.volume_usd,
    }
    byChannel.set(r.channel_id, sum(byChannel.get(r.channel_id) || zero, piece))
    byDate.set(r.date, sum(byDate.get(r.date) || zero, piece))
  }

  let total = { ...zero }
  for (const v of byChannel.values()) total = sum(total, v)

  res.json({
    groups: [...byChannel.entries()].map(([id, stats]) => ({ id, ...stats })),
    days: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, stats]) => ({ date, ...stats })),
    total,
    coverage: coverageFor(start, end),
    drill: {
      channel_visits: { kind: 'channel_visits', params: { start, end, channel } },
    },
  })
})

/** GET /api/metrics/trades?start&end&source= (source reserved; day/chain from rollup) */
router.get('/trades', (req, res) => {
  const range = parseRange(req.query)
  if (range.error) return res.status(400).json({ error: range.error })
  const { start, end } = range
  const { startDate, endDateExclusive } = dateBounds(start, end)

  const rows = db.prepare(`
    SELECT * FROM daily_trade_stats
    WHERE date >= ? AND date < ?
    ORDER BY date ASC, chain ASC
  `).all(startDate, endDateExclusive)

  const byChain = new Map()
  const byDate = new Map()
  const zero = { submitted: 0, succeeded: 0, failed: 0, pending: 0, volume_usd: 0 }
  const sum = (a, b) => ({
    submitted: a.submitted + b.submitted,
    succeeded: a.succeeded + b.succeeded,
    failed: a.failed + b.failed,
    pending: a.pending + b.pending,
    volume_usd: a.volume_usd + b.volume_usd,
  })

  for (const r of rows) {
    const piece = {
      submitted: r.submitted, succeeded: r.succeeded, failed: r.failed,
      pending: r.pending, volume_usd: r.volume_usd,
    }
    byChain.set(r.chain, sum(byChain.get(r.chain) || zero, piece))
    byDate.set(r.date, sum(byDate.get(r.date) || zero, piece))
  }

  let total = { ...zero }
  for (const v of byDate.values()) total = sum(total, v)
  const successRate = total.submitted ? total.succeeded / total.submitted : null

  res.json({
    total: { ...total, successRate, failureRate: total.submitted ? total.failed / total.submitted : null },
    byChain: [...byChain.entries()].map(([chain, stats]) => ({
      chain,
      ...stats,
      successRate: stats.submitted ? stats.succeeded / stats.submitted : null,
    })).sort((a, b) => b.submitted - a.submitted),
    days: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, stats]) => ({
      date,
      ...stats,
      successRate: stats.submitted ? stats.succeeded / stats.submitted : null,
    })),
    coverage: coverageFor(start, end),
  })
})

// ── Phase B: funnel / retention / segments / referral ─────────────────────────
const { computeFunnel, ASSOCIATIONS } = require('../analytics/funnel')
const { computeSegmentationFromFeatures, SEGMENTS } = require('../analytics/segmentation')
const { computeReferralMetrics } = require('../analytics/referral')
const { loadNormalizedUsers } = require('../analytics/loadUsers')
const { cachePut } = require('../analytics/resultCache')

function readAsOf(fallbackEnd) {
  const meta = readKeyedMeta('events_meta')
  const asOf = Date.parse(meta.as_of)
  return Number.isFinite(asOf) ? asOf : fallbackEnd
}

function parseBodyRange(body = {}) {
  const start = Number(body.start)
  const end = Number(body.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return { error: 'start/end 必须是毫秒时间戳且 start < end' }
  }
  return { start, end }
}

/** POST /api/metrics/funnel */
router.post('/funnel', (req, res) => {
  const range = parseBodyRange(req.body)
  if (range.error) return res.status(400).json({ error: range.error })
  const {
    steps,
    hours = 24,
    association = 'user',
    source = 'all',
    strategy = 'all',
    audience_ids = null,
    cohort_id = null,
  } = req.body ?? {}
  if (!Array.isArray(steps) || steps.length < 2) {
    return res.status(400).json({ error: 'steps 至少 2 步' })
  }
  if (!Object.hasOwn(ASSOCIATIONS, association)) {
    return res.status(400).json({ error: '未知 association' })
  }

  const { start, end } = range
  const asOf = readAsOf(end)
  const conversionWindowMs = Math.max(1, Number(hours) || 24) * 3600000
  const types = [...new Set(steps)]

  const loaded = loadNormalizedUsers({
    types,
    start,
    end,
    asOf,
    source,
    audience_ids,
    cohort_id,
    endExtraMs: conversionWindowMs,
  })

  const result = computeFunnel(loaded.users, {
    steps,
    startAt: start,
    endAt: end,
    conversionWindowMs,
    sourceFilter: source || 'all',
    strategyFilter: strategy || 'all',
    asOf,
    association,
  })

  const lists = {
    missing_start: result.quality.missingStartUserIds,
    incomplete: result.quality.incompleteUserIds,
  }
  steps.forEach((_, i) => {
    lists[`reached:${i}`] = result.rows.filter(r => r.times.length > i).map(r => r.userId)
  })
  steps.slice(1).forEach((_, i) => {
    lists[`drop:${i}`] = result.rows
      .filter(r => r.times.length === i + 1 && !r.pending && !r.dataIncomplete)
      .map(r => r.userId)
  })
  const bySource = {}
  for (const r of result.rows) {
    if (!bySource[r.source]) bySource[r.source] = []
    bySource[r.source].push(r.userId)
  }
  for (const [sourceName, ids] of Object.entries(bySource)) {
    lists[`source:${sourceName}`] = ids
  }

  const cache_id = cachePut({ kind: 'funnel', lists, meta: { steps, start, end, association } })

  res.json({
    association,
    steps: result.steps,
    total_entered: result.total_entered,
    total_converted: result.total_converted,
    pending_count: result.pending_count,
    median_conversion_ms: result.median_conversion_ms,
    quality: {
      missing_start: result.quality.missingStartUserIds.length,
      incomplete: result.quality.incompleteUserIds.length,
    },
    by_source: Object.entries(bySource).map(([sourceName, ids]) => {
      const complete = result.rows.filter(r => r.source === sourceName && r.times.length === steps.length).length
      return { source: sourceName, entered: ids.length, converted: complete }
    }),
    truncated: loaded.truncated,
    candidate_count: loaded.candidate_count,
    coverage: coverageFor(start, end),
    drill: { cache_id },
  })
})

/** POST /api/metrics/retention */
router.post('/retention', (req, res) => {
  const range = parseBodyRange(req.body)
  if (range.error) return res.status(400).json({ error: range.error })
  const {
    initial = 'chip',
    returning = 'chip',
    source = 'all',
    audience_ids = null,
    cohort_id = null,
    maxDailyPeriods = 7,
  } = req.body ?? {}
  const { start, end } = range
  const asOf = readAsOf(end)
  const periods = Number(maxDailyPeriods) || 7

  const loaded = loadNormalizedUsers({
    types: [...new Set([initial, returning])],
    start,
    end,
    asOf,
    source,
    audience_ids,
    cohort_id,
    endExtraMs: Math.max(0, asOf - end) + 8 * 86400000,
  })

  const { retainedUsers: retainedFn, buildCohorts, toDateStr } = require('../analytics/retention')
  const cohorts = buildCohorts(loaded.users, {
    startAt: start, endAt: end, asOf, initialEvent: initial, sourceFilter: source || 'all',
  }).map(co => ({ ...co, returningEvent: returning, asOf }))

  const lists = {}
  const daily = []
  for (const co of cohorts) {
    if (!co.users.length) continue
    const cohort_date = toDateStr(co.start)
    lists[`cohort:${cohort_date}`] = co.users.map(u => u.id)
    const periodRows = []
    for (let p = 1; p <= periods; p++) {
      const observed = co.start + p * 86400000 <= asOf
      const complete = co.start + (p + 1) * 86400000 <= asOf
      if (!observed) {
        periodRows.push({ period: p, retained_users: null, retention_rate: null, complete: false })
        continue
      }
      const dailyIds = retainedFn(co, p, false, returning).map(u => u.id)
      const contIds = retainedFn(co, p, true, returning).map(u => u.id)
      lists[`retained:${cohort_date}:D${p}`] = dailyIds
      lists[`retained:${cohort_date}:C${p}`] = contIds
      periodRows.push({
        period: p,
        retained_users: dailyIds.length,
        retention_rate: co.users.length ? dailyIds.length / co.users.length : 0,
        continuous_retained_users: contIds.length,
        continuous_retention_rate: co.users.length ? contIds.length / co.users.length : 0,
        complete,
      })
    }
    daily.push({
      cohort_date,
      cohort_start: co.start,
      cohort_size: co.users.length,
      periods: periodRows,
    })
  }

  const cache_id = cachePut({ kind: 'retention', lists, meta: { start, end, initial, returning } })

  res.json({
    daily,
    truncated: loaded.truncated,
    candidate_count: loaded.candidate_count,
    coverage: coverageFor(start, end),
    drill: { cache_id },
  })
})

/** POST /api/metrics/segments */
router.post('/segments', (req, res) => {
  const asOfBody = req.body?.as_of != null ? Number(req.body.as_of) : NaN
  const asOf = Number.isFinite(asOfBody) ? asOfBody : readAsOf(Date.now())
  const source = req.body?.source && req.body.source !== 'all' ? String(req.body.source) : null
  const audience_ids = req.body?.audience_ids ?? null
  const cohort_id = req.body?.cohort_id ?? null

  let sql = `SELECT * FROM user_features WHERE 1=1`
  const params = []
  if (source) { sql += ` AND first_source = ?`; params.push(source) }

  const { resolveAudienceUserIds } = require('../analytics/loadUsers')
  const audienceIds = resolveAudienceUserIds({ audience_ids, cohort_id })
  if (audienceIds) {
    if (!audienceIds.length) {
      return res.json({
        segments: SEGMENTS.map(segment => ({ segment, users: 0, percentage: 0 })),
        tags: {},
        total: 0,
        drill: { cache_id: null },
      })
    }
    sql += ` AND user_id IN (${audienceIds.map(() => '?').join(',')})`
    params.push(...audienceIds)
  }

  const rows = db.prepare(sql).all(...params)
  const inviters = db.prepare(`SELECT DISTINCT inviter_user_id AS id FROM referral_invitees WHERE level = 1`).all()
    .map(r => `user:${r.id}`)
  const referred = db.prepare(`SELECT DISTINCT invitee_user_id AS id FROM referral_invitees WHERE level = 1`).all()
    .map(r => `user:${r.id}`)

  const result = computeSegmentationFromFeatures(rows, {
    asOf,
    inviterIds: inviters,
    referredIds: referred,
  })

  const lists = { ...result.segmentUsers }
  const cache_id = cachePut({ kind: 'segments', lists, meta: { asOf, source } })

  res.json({
    segments: result.segments,
    tags: result.tags,
    total: result.total,
    as_of: asOf,
    drill: { cache_id },
  })
})

/** GET /api/metrics/referral?start&end&source= */
router.get('/referral', (req, res) => {
  const range = parseRange(req.query)
  if (range.error) return res.status(400).json({ error: range.error })
  const { start, end } = range
  const asOf = readAsOf(end)
  const source = req.query.source || 'all'
  const result = computeReferralMetrics({ startAt: start, endAt: end, asOf, source })
  const lists = {
    advocates: result._ids.advocates,
    bound: result._ids.bound,
    activated: result._ids.activated,
  }
  const cache_id = cachePut({ kind: 'referral', lists, meta: { start, end, source } })
  const { _ids, ...publicResult } = result
  res.json({
    ...publicResult,
    coverage: coverageFor(start, end),
    drill: { cache_id },
  })
})

module.exports = router
