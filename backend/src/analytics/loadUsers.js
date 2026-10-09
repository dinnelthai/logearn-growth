/**
 * Load a normalized users[] subset from SQLite for sequence metrics.
 * Shape matches frontend normalize output closely enough for funnel/retention/segments.
 */
const db = require('../db/connection')
const { rawNamesForTypes, internalType, MODULES } = require('./eventMap')

const MAX_CANDIDATES = Number(process.env.MAX_METRIC_CANDIDATES || 80000)

function parseProps(text) {
  try { return text ? JSON.parse(text) : {} } catch { return {} }
}

function resolveAudienceUserIds({ audience_ids, cohort_id }) {
  if (cohort_id) {
    return db.prepare(`
      SELECT user_id FROM cohort_members WHERE cohort_id = ?
    `).all(String(cohort_id)).map(r => String(r.user_id).replace(/^user:/, ''))
  }
  if (Array.isArray(audience_ids) && audience_ids.length) {
    return [...new Set(audience_ids.map(id => String(id).replace(/^user:/, '')).filter(Boolean))].slice(0, 50000)
  }
  return null
}

/**
 * Find user_ids that have at least one event of `types` in [start, end).
 */
function candidateUserIds({ types, start, end, source, audienceIds }) {
  const raws = rawNamesForTypes(types)
  if (!raws.length && !types.includes('logged_in_visit')) return []
  const placeholders = raws.map(() => '?').join(',')
  let sql = `
    SELECT DISTINCT user_id AS user_id
    FROM events
    WHERE user_id IS NOT NULL
      ${types.includes('logged_in_visit') ? "AND TRIM(user_id) <> ''" : `AND event_name IN (${placeholders})`}
      AND client_ts >= ? AND client_ts < ?
  `
  const params = [...(types.includes('logged_in_visit') ? [] : raws), start, end]
  if (source && source !== 'all') {
    sql += ` AND user_id IN (SELECT user_id FROM user_facts WHERE first_source = ? AND user_id IS NOT NULL)`
    params.push(source)
  }
  if (audienceIds) {
    if (!audienceIds.length) return []
    const ap = audienceIds.map(() => '?').join(',')
    sql += ` AND user_id IN (${ap})`
    params.push(...audienceIds)
  }
  sql += ` LIMIT ${MAX_CANDIDATES + 1}`
  const rows = db.prepare(sql).all(...params)
  return rows.map(r => r.user_id)
}

function loadFactsByUserIds(userIds) {
  if (!userIds.length) return new Map()
  const map = new Map()
  const CHUNK = 500
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK)
    const ph = slice.map(() => '?').join(',')
    for (const row of db.prepare(`
      SELECT user_id, first_source, first_chip_at, first_visit_at, first_login_at,
             first_channel_id
      FROM user_facts WHERE user_id IN (${ph})
    `).all(...slice)) {
      map.set(row.user_id, row)
    }
    // Also pull binding / language from logearn_users
    for (const row of db.prepare(`
      SELECT user_id, first_source, preferred_language, telegram_bound, email_bound,
             first_analysis_at, first_analysis_entry_module
      FROM logearn_users WHERE user_id IN (${ph})
    `).all(...slice)) {
      const cur = map.get(row.user_id) || { user_id: row.user_id }
      Object.assign(cur, {
        first_source: cur.first_source ?? row.first_source,
        preferred_language: row.preferred_language,
        telegram_bound: row.telegram_bound == null ? null : Boolean(row.telegram_bound),
        email_bound: row.email_bound == null ? null : Boolean(row.email_bound),
        first_analysis_at: row.first_analysis_at ? Date.parse(row.first_analysis_at) : cur.first_chip_at,
        first_analysis_entry_module: row.first_analysis_entry_module ?? null,
      })
      map.set(row.user_id, cur)
    }
  }
  return map
}

/**
 * Load events for userIds.
 * Strategy: scan by (event_name, client_ts) using idx_events_name_ts, filter by user set in JS.
 * This beats huge `user_id IN (...)` plans on multi-million event tables.
 *
 * @param {'full'|'light'} [opts.detail='full']
 *   light = skip properties JSON except module_viewed / strategy_started (enough for user-order funnel)
 */
function loadEventsForUsers(userIds, {
  types,
  start = null,
  end = null,
  endExtraMs = 0,
  asOf = Infinity,
  detail = 'full',
} = {}) {
  if (!userIds.length) return new Map()
  const byUser = new Map(userIds.map(id => [id, []]))
  const userSet = new Set(userIds)
  const raws = types ? rawNamesForTypes(types) : null
  const typeSet = types ? new Set(types) : null
  if (!raws?.length) return byUser

  const rangeStart = Number.isFinite(start) ? start : 0
  let rangeEnd = Number.isFinite(end) ? end + (Number(endExtraMs) || 0) : Number.MAX_SAFE_INTEGER
  if (Number.isFinite(asOf) && asOf !== Infinity) rangeEnd = Math.min(rangeEnd, asOf + 1)

  const needsProps = detail === 'light'
    ? new Set(['module_viewed', 'strategy_started'])
    : new Set([
      'module_viewed', 'strategy_started', 'strategy_result_generated',
      'signal_viewed', 'strategy_signal_viewed',
      'ranking_token_clicked', 'token_opened', 'callout_card_clicked', 'token_detail_viewed',
      'chip_analysis_viewed', 'chip_analysis_drilldown',
      'trade_submitted', 'trade_succeeded', 'trade_failed',
    ])

  const stmtPlain = db.prepare(`
    SELECT event_id, event_name, user_id, client_ts, session_id, first_entry_source, chain
    FROM events
    WHERE event_name = ? AND client_ts >= ? AND client_ts < ?
  `)
  const stmtProps = db.prepare(`
    SELECT event_id, event_name, user_id, client_ts, session_id, first_entry_source, chain, properties
    FROM events
    WHERE event_name = ? AND client_ts >= ? AND client_ts < ?
  `)

  for (const raw of raws) {
    const rows = (needsProps.has(raw) ? stmtProps : stmtPlain).all(raw, rangeStart, rangeEnd)
    for (const row of rows) {
      if (!userSet.has(row.user_id)) continue
      const props = row.properties != null ? parseProps(row.properties) : {}
      const type = internalType(row.event_name, props)
      if (!type) continue
      if (typeSet && !typeSet.has(type)) continue
      byUser.get(row.user_id).push({
        type,
        t: row.client_ts,
        entry_source: row.first_entry_source ?? props.first_entry_source ?? null,
        strategy: props.strategy_type ?? null,
        strategy_run_id: props.strategy_run_id ?? null,
        token_visit_id: props.token_visit_id ?? null,
        token_address: props.token_address ?? null,
        chain: props.chain ?? row.chain ?? null,
        trade_id: props.trade_id ?? null,
        trade_attempt_id: props.trade_attempt_id ?? null,
        session_id: row.session_id ?? null,
        reason: props.reason ?? props.error ?? null,
        _raw_event_id: row.event_id,
        module: props.module ?? null,
        entry_module: props.entry_module ?? null,
      })
    }
  }
  for (const list of byUser.values()) list.sort((a, b) => a.t - b.t)
  return byUser
}

/**
 * Build normalized users for sequence metrics.
 */
function loadNormalizedUsers({
  types,
  start,
  end,
  asOf,
  source = 'all',
  audience_ids = null,
  cohort_id = null,
  endExtraMs = 0,
  /** Pull events this many ms before `start` (session continuity); candidates still use `start`. */
  eventStartPadMs = 0,
  detail = 'full',
  /** If true, candidates = all logearn_users (optionally audience), not event-window based */
  allUsers = false,
}) {
  const audienceIds = resolveAudienceUserIds({ audience_ids, cohort_id })
  let userIds
  if (allUsers) {
    if (audienceIds) {
      userIds = audienceIds
    } else if (source && source !== 'all') {
      userIds = db.prepare(`
        SELECT user_id FROM user_facts WHERE user_id IS NOT NULL AND first_source = ? LIMIT ?
      `).all(source, MAX_CANDIDATES).map(r => r.user_id)
    } else {
      userIds = db.prepare(`
        SELECT user_id FROM logearn_users LIMIT ?
      `).all(MAX_CANDIDATES).map(r => r.user_id)
    }
  } else {
    userIds = candidateUserIds({ types, start, end, source, audienceIds })
  }

  const truncated = userIds.length > MAX_CANDIDATES
  if (truncated) userIds = userIds.slice(0, MAX_CANDIDATES)

  const facts = loadFactsByUserIds(userIds)
  const eventStart = allUsers
    ? null
    : (Number.isFinite(start) ? start - Math.max(0, Number(eventStartPadMs) || 0) : start)
  const eventsByUser = loadEventsForUsers(userIds, {
    types,
    start: eventStart,
    end,
    endExtraMs,
    asOf,
    detail,
  })

  if (types.includes('logged_in_visit')) {
    const ids = new Set(userIds)
    const rows = db.prepare(`SELECT user_id, client_ts, session_id, chain, properties
      FROM events WHERE user_id IS NOT NULL AND TRIM(user_id) <> ''
      AND client_ts >= ? AND client_ts < ?`).all(eventStart ?? 0, Math.min(end + endExtraMs, asOf + 1))
    for (const row of rows) {
      if (!ids.has(row.user_id)) continue
      const props = parseProps(row.properties)
      eventsByUser.get(row.user_id).push({type: 'logged_in_visit', t: row.client_ts,
        session_id: row.session_id, token_visit_id: props.token_visit_id ?? null,
        strategy_run_id: props.strategy_run_id ?? null, token_address: props.token_address ?? null,
        chain: props.chain ?? row.chain ?? null})
    }
  }

  // For retention/funnel, also need history before start for firstEvent — load first_chip from facts
  const users = userIds.map(uid => {
    const fact = facts.get(uid) || {}
    const events = eventsByUser.get(uid) || []
    return {
      id: `user:${uid}`,
      source: fact.first_source || '未知',
      preferred_language: fact.preferred_language ?? null,
      telegram_bound: fact.telegram_bound ?? null,
      email_bound: fact.email_bound ?? null,
      first_analysis_at: fact.first_chip_at ?? fact.first_analysis_at ?? null,
      first_analysis_entry_module: fact.first_analysis_entry_module ?? null,
      events,
    }
  })

  return { users, truncated, candidate_count: userIds.length }
}

module.exports = {
  loadNormalizedUsers,
  resolveAudienceUserIds,
  candidateUserIds,
  loadEventsForUsers,
  loadFactsByUserIds,
  MAX_CANDIDATES,
}
