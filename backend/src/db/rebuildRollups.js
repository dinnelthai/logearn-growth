/**
 * rebuildRollups.js — rebuild user_facts + daily_* tables from raw events.
 *
 * Usage:
 *   node src/db/rebuildRollups.js
 *
 * Safe to re-run. Intended for demo/scale datasets after generateBusinessData
 * or after importing mock JSON via seedMock.
 */
const db = require('./connection')
const fs = require('fs')
const path = require('path')

const TZ_OFFSET_MS = 7 * 3600000
const DAY = 86400000

function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
}

function toDateStr(ts) {
  return new Date(Number(ts) + TZ_OFFSET_MS).toISOString().slice(0, 10)
}

function readMeta() {
  const rows = db.prepare('SELECT key, value FROM events_meta').all()
  const meta = {}
  for (const row of rows) {
    try { meta[row.key] = JSON.parse(row.value) } catch { meta[row.key] = row.value }
  }
  return meta
}

function upsertMeta(meta) {
  const stmt = db.prepare(
    `INSERT INTO events_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  for (const [key, value] of Object.entries(meta)) {
    stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
}

function resolveUserKey(userId, anonymousId) {
  if (userId) return `user:${userId}`
  if (anonymousId) return `anonymous:${anonymousId}`
  return null
}

/** Backfill / refresh user_facts from events + logearn_users. */
function rebuildUserFacts() {
  db.exec('DELETE FROM user_facts')
  const insert = db.prepare(`
    INSERT INTO user_facts (
      user_key, user_id, anonymous_id, first_source, first_visit_at, first_login_at,
      first_chip_at, first_channel_id, updated_at
    ) VALUES (
      @user_key, @user_id, @anonymous_id, @first_source, @first_visit_at, @first_login_at,
      @first_chip_at, @first_channel_id, @updated_at
    )
  `)

  const now = Date.now()
  const facts = new Map()

  const ensure = (key, patch) => {
    if (!key) return
    const cur = facts.get(key) || {
      user_key: key,
      user_id: null,
      anonymous_id: null,
      first_source: null,
      first_visit_at: null,
      first_login_at: null,
      first_chip_at: null,
      first_channel_id: null,
      updated_at: now,
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) continue
      if (k === 'first_visit_at' || k === 'first_login_at' || k === 'first_chip_at') {
        cur[k] = cur[k] == null ? v : Math.min(cur[k], v)
      } else if (cur[k] == null) {
        cur[k] = v
      }
    }
    facts.set(key, cur)
  }

  // Seed from product user table
  for (const u of db.prepare('SELECT * FROM logearn_users').all()) {
    const key = `user:${u.user_id}`
    ensure(key, {
      user_id: u.user_id,
      first_source: u.first_source,
      first_chip_at: u.first_analysis_at ? Date.parse(u.first_analysis_at) : null,
    })
  }

  // Scan key events for firsts in time order (chunked to avoid finalize quirks)
  const stmt = db.prepare(`
    SELECT event_name, user_id, anonymous_id, first_entry_source, client_ts, properties
    FROM events
    WHERE event_name IN ('first_visit_captured','login_succeeded','chip_analysis_viewed','chip_analysis_drilldown')
      AND client_ts >= ? AND client_ts < ?
    ORDER BY client_ts ASC
  `)
  const bounds = db.prepare('SELECT MIN(client_ts) AS min_ts, MAX(client_ts) AS max_ts FROM events').get()
  const minTs = bounds?.min_ts ?? 0
  const maxTs = (bounds?.max_ts ?? 0) + 1
  const CHUNK = 7 * DAY
  for (let cursor = minTs; cursor < maxTs; cursor += CHUNK) {
    const rows = stmt.all(cursor, Math.min(cursor + CHUNK, maxTs))
    for (const row of rows) {
      const key = resolveUserKey(row.user_id, row.anonymous_id)
      if (!key) continue
      let props = {}
      try { props = JSON.parse(row.properties || '{}') } catch { /* ignore */ }
      if (row.event_name === 'first_visit_captured') {
        ensure(key, {
          user_id: row.user_id,
          anonymous_id: row.anonymous_id,
          first_source: row.first_entry_source,
          first_visit_at: row.client_ts,
          first_channel_id: props.channel_id ?? null,
        })
      } else if (row.event_name === 'login_succeeded') {
        ensure(key, {
          user_id: row.user_id,
          anonymous_id: row.anonymous_id,
          first_source: row.first_entry_source,
          first_login_at: row.client_ts,
        })
        // Merge anonymous first-visit facts into the logged-in user key when both ids are present.
        if (row.user_id && row.anonymous_id) {
          const anonKey = `anonymous:${row.anonymous_id}`
          const anon = facts.get(anonKey)
          if (anon) {
            ensure(key, {
              first_visit_at: anon.first_visit_at,
              first_channel_id: anon.first_channel_id,
              first_source: anon.first_source,
              anonymous_id: row.anonymous_id,
            })
          }
        }
      } else if (['chip_analysis_viewed', 'chip_analysis_drilldown'].includes(row.event_name)) {
        ensure(key, {
          user_id: row.user_id,
          anonymous_id: row.anonymous_id,
          first_source: row.first_entry_source,
          first_chip_at: row.client_ts,
        })
      }
    }
  }

  db.exec('BEGIN')
  try {
    for (const fact of facts.values()) insert.run(fact)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return facts.size
}

function rebuildDailyNorthStar() {
  db.exec('DELETE FROM daily_north_star_users')
  db.exec('DELETE FROM daily_north_star')

  const firstChip = new Map()
  for (const row of db.prepare('SELECT user_key, first_chip_at FROM user_facts WHERE first_chip_at IS NOT NULL').all()) {
    firstChip.set(row.user_key, row.first_chip_at)
  }

  // Per-day active chip users
  const dayUsers = new Map() // date -> Map(user_key -> {is_new, events})
  const chipRows = db.prepare(`
    SELECT user_id, anonymous_id, client_ts
    FROM events
    WHERE event_name IN ('chip_analysis_viewed', 'chip_analysis_drilldown')
    ORDER BY client_ts ASC
  `).all()
  for (const row of chipRows) {
    const key = resolveUserKey(row.user_id, row.anonymous_id)
    if (!key) continue
    const date = toDateStr(row.client_ts)
    if (!dayUsers.has(date)) dayUsers.set(date, new Map())
    const bucket = dayUsers.get(date)
    const first = firstChip.get(key)
    const isNew = first != null && toDateStr(first) === date ? 1 : 0
    const cur = bucket.get(key)
    if (cur) cur.events += 1
    else bucket.set(key, { is_new: isNew, events: 1 })
  }

  // Per-day login users
  const loginByDay = new Map()
  const loginRows = db.prepare(`
    SELECT user_id, anonymous_id, client_ts
    FROM events
    WHERE user_id IS NOT NULL AND TRIM(user_id) <> ''
  `).all()
  for (const row of loginRows) {
    const key = resolveUserKey(row.user_id, row.anonymous_id)
    if (!key) continue
    const date = toDateStr(row.client_ts)
    if (!loginByDay.has(date)) loginByDay.set(date, new Set())
    loginByDay.get(date).add(key)
  }

  const insertDay = db.prepare(`
    INSERT INTO daily_north_star (date, active_users, new_users, returning_users, login_users, chip_events)
    VALUES (@date, @active_users, @new_users, @returning_users, @login_users, @chip_events)
  `)
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO daily_north_star_users (date, user_key, is_new)
    VALUES (@date, @user_key, @is_new)
  `)

  const allDates = new Set([...dayUsers.keys(), ...loginByDay.keys()])
  db.exec('BEGIN')
  try {
    for (const date of [...allDates].sort()) {
      const bucket = dayUsers.get(date) || new Map()
      let newUsers = 0
      let returningUsers = 0
      let chipEvents = 0
      for (const [userKey, info] of bucket) {
        chipEvents += info.events
        if (info.is_new) newUsers += 1
        else returningUsers += 1
        insertMember.run({ date, user_key: userKey, is_new: info.is_new })
      }
      insertDay.run({
        date,
        active_users: bucket.size,
        new_users: newUsers,
        returning_users: returningUsers,
        login_users: loginByDay.get(date)?.size ?? 0,
        chip_events: chipEvents,
      })
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return allDates.size
}

/**
 * Channel daily stats: cohort by first_visit day + channel_id from user_facts /
 * first_visit_captured. Funnel flags are computed per user then rolled by visit day.
 * This is heavier than north-star; acceptable as an offline rebuild.
 */
function rebuildDailyChannelStats() {
  db.exec('DELETE FROM daily_channel_stats')

  // Load channel_id + first_visit_at per user_key
  const visits = []
  for (const row of db.prepare(`
    SELECT user_key, user_id, first_channel_id AS channel_id, first_visit_at, first_chip_at, first_source
    FROM user_facts
    WHERE first_visit_at IS NOT NULL
  `).all()) {
    visits.push(row)
  }

  // Preload chip / login / token / ai event days per user_id (logged-in only for channel funnel)
  const byUser = new Map() // user_id -> { logins:Set(ts), tokens:Set(ts), chips:Set(ts), ais:Set(ts) }
  const ensureUser = (uid) => {
    if (!byUser.has(uid)) byUser.set(uid, { logins: [], tokens: [], chips: [], ais: [] })
    return byUser.get(uid)
  }
  for (const row of db.prepare(`
    SELECT user_id, event_name, client_ts FROM events
    WHERE user_id IS NOT NULL AND event_name IN (
      'login_succeeded','token_detail_viewed','chip_analysis_viewed','chip_analysis_drilldown','strategy_started'
    )
  `).all()) {
    const u = ensureUser(row.user_id)
    if (row.event_name === 'login_succeeded') u.logins.push(row.client_ts)
    else if (row.event_name === 'token_detail_viewed') u.tokens.push(row.client_ts)
    else if (['chip_analysis_viewed', 'chip_analysis_drilldown'].includes(row.event_name)) u.chips.push(row.client_ts)
    else if (row.event_name === 'strategy_started') u.ais.push(row.client_ts)
  }

  // Trades by user
  const tradesByUser = new Map()
  for (const t of db.prepare(`
    SELECT user_id, confirmed_at, volume_usd, status FROM trades WHERE status = 'confirmed'
  `).all()) {
    if (!tradesByUser.has(t.user_id)) tradesByUser.set(t.user_id, [])
    tradesByUser.get(t.user_id).push({
      t: Date.parse(t.confirmed_at),
      volume: Number(t.volume_usd) || 0,
    })
  }

  const meta = readMeta()
  const asOf = Date.parse(meta.as_of) || Date.now()

  const agg = new Map() // `${date}|${channel}` -> counters
  const bump = (date, channelId, patch) => {
    const id = channelId || 'unknown'
    const key = `${date}|${id}`
    const cur = agg.get(key) || {
      date,
      channel_id: id,
      visits: 0, logins: 0, tokens: 0, chips: 0, analyses: 0, strategies: 0,
      d7_eligible: 0, d7_retained: 0, traders: 0, volume_usd: 0,
    }
    for (const [k, v] of Object.entries(patch)) cur[k] += v
    agg.set(key, cur)
  }

  for (const v of visits) {
    const date = toDateStr(v.first_visit_at)
    const channelId = v.channel_id || v.first_channel_id || 'unknown'
    // Prefer logged-in user keys for funnel attribution; skip pure anonymous duplicates once merged.
    if (!v.user_id && v.user_key?.startsWith('anonymous:')) {
      bump(date, channelId, { visits: 1 })
      continue
    }
    bump(date, channelId, { visits: 1 })

    const uid = v.user_id
    if (!uid) continue
    const ev = byUser.get(uid)
    if (!ev) continue

    const after = (arr) => arr.find(ts => ts >= v.first_visit_at)
    const loginTs = after(ev.logins)
    const tokenTs = loginTs != null ? ev.tokens.find(ts => ts > loginTs) : null
    const chipTs = tokenTs != null ? ev.chips.find(ts => ts > tokenTs) : null
    const anyChip = ev.chips.some(ts => ts >= v.first_visit_at)
    const anyAi = ev.ais.some(ts => ts >= v.first_visit_at)

    if (loginTs != null) bump(date, channelId, { logins: 1 })
    if (tokenTs != null) bump(date, channelId, { tokens: 1 })
    if (chipTs != null) bump(date, channelId, { chips: 1 })
    if (anyChip) bump(date, channelId, { analyses: 1 })
    if (anyAi) bump(date, channelId, { strategies: 1 })

    // D7 retention relative to first chip (all-time), mature if D7 day fully before asOf
    if (v.first_chip_at != null) {
      const d0 = Math.floor((v.first_chip_at + TZ_OFFSET_MS) / DAY)
      const d7Start = (d0 + 7) * DAY - TZ_OFFSET_MS
      const d7End = (d0 + 8) * DAY - TZ_OFFSET_MS
      if (d7End <= asOf) {
        bump(date, channelId, { d7_eligible: 1 })
        const retained = ev.chips.some(ts => ts >= d7Start && ts < d7End)
        if (retained) bump(date, channelId, { d7_retained: 1 })
      }
    }

    const txs = tradesByUser.get(uid) || []
    // Attribute trades in a soft window after visit for volume (visit day cohort reporting uses period filter at query time)
    let vol = 0
    let traded = false
    for (const t of txs) {
      if (t.t >= v.first_visit_at) { vol += t.volume; traded = true }
    }
    if (traded) bump(date, channelId, { traders: 1, volume_usd: vol })
  }

  const insert = db.prepare(`
    INSERT INTO daily_channel_stats (
      date, channel_id, visits, logins, tokens, chips, analyses, strategies,
      d7_eligible, d7_retained, traders, volume_usd
    ) VALUES (
      @date, @channel_id, @visits, @logins, @tokens, @chips, @analyses, @strategies,
      @d7_eligible, @d7_retained, @traders, @volume_usd
    )
  `)
  db.exec('BEGIN')
  try {
    for (const row of agg.values()) insert.run(row)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return agg.size
}

function rebuildDailyTradeStats() {
  db.exec('DELETE FROM daily_trade_stats')

  // submissions in period by attempt; outcomes may be later — mirror tradeMonitor semantics loosely at day grain
  const submissions = db.prepare(`
    SELECT event_id, user_id, client_ts, chain, properties
    FROM events WHERE event_name = 'trade_submitted'
  `).all()

  const outcomes = db.prepare(`
    SELECT event_id, user_id, client_ts, event_name, properties
    FROM events WHERE event_name IN ('trade_succeeded','trade_failed')
  `).all()

  const outcomeByKey = new Map()
  for (const o of outcomes) {
    let props = {}
    try { props = JSON.parse(o.properties || '{}') } catch { /* ignore */ }
    const keys = [
      props.trade_attempt_id && `${o.user_id}:attempt:${props.trade_attempt_id}`,
      props.trade_id && `${o.user_id}:trade:${props.trade_id}`,
    ].filter(Boolean)
    for (const k of keys) {
      const prev = outcomeByKey.get(k)
      if (!prev || o.client_ts >= prev.client_ts) outcomeByKey.set(k, { ...o, props })
    }
  }

  // confirmed volume by day/chain from trades table
  const volumeByDayChain = new Map()
  for (const t of db.prepare(`SELECT confirmed_at, chain, volume_usd, status FROM trades`).all()) {
    if (t.status !== 'confirmed') continue
    const ts = Date.parse(t.confirmed_at)
    if (!Number.isFinite(ts)) continue
    const date = toDateStr(ts)
    const chain = t.chain || '未知'
    const key = `${date}|${chain}`
    volumeByDayChain.set(key, (volumeByDayChain.get(key) || 0) + (Number(t.volume_usd) || 0))
  }

  const agg = new Map()
  for (const s of submissions) {
    let props = {}
    try { props = JSON.parse(s.properties || '{}') } catch { /* ignore */ }
    const date = toDateStr(s.client_ts)
    const chain = props.chain || s.chain || '未知'
    const key = `${date}|${chain}`
    const cur = agg.get(key) || {
      date, chain, submitted: 0, succeeded: 0, failed: 0, pending: 0, volume_usd: 0,
    }
    cur.submitted += 1
    const keys = [
      props.trade_attempt_id && `${s.user_id}:attempt:${props.trade_attempt_id}`,
      props.trade_id && `${s.user_id}:trade:${props.trade_id}`,
    ].filter(Boolean)
    if (!keys.length) {
      // missing correlation — count as submitted only (matches monitor's missingCorrelation idea)
    } else {
      const outcome = keys.map(k => outcomeByKey.get(k)).find(Boolean)
      if (!outcome) cur.pending += 1
      else if (outcome.event_name === 'trade_succeeded') cur.succeeded += 1
      else if (outcome.event_name === 'trade_failed') cur.failed += 1
    }
    agg.set(key, cur)
  }

  for (const [key, vol] of volumeByDayChain) {
    const [date, chain] = key.split('|')
    const cur = agg.get(key) || {
      date, chain, submitted: 0, succeeded: 0, failed: 0, pending: 0, volume_usd: 0,
    }
    cur.volume_usd = vol
    agg.set(key, cur)
  }

  const insert = db.prepare(`
    INSERT INTO daily_trade_stats (date, chain, submitted, succeeded, failed, pending, volume_usd)
    VALUES (@date, @chain, @submitted, @succeeded, @failed, @pending, @volume_usd)
  `)
  db.exec('BEGIN')
  try {
    for (const row of agg.values()) insert.run(row)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return agg.size
}

function loadUserFeatureBases() {
  // Prefer product user table when present; otherwise derive logged-in users
  // from user_facts + events so event-only imports still power segmentation.
  const fromUsers = db.prepare(`
    SELECT
      u.user_id AS user_id,
      COALESCE(f.first_source, u.first_source) AS first_source,
      COALESCE(f.first_chip_at,
        CASE WHEN u.first_analysis_at IS NOT NULL THEN CAST(strftime('%s', u.first_analysis_at) AS INTEGER) * 1000 END
      ) AS first_chip_at,
      u.telegram_bound AS telegram_bound,
      u.email_bound AS email_bound,
      u.preferred_language AS preferred_language
    FROM logearn_users u
    LEFT JOIN user_facts f ON f.user_id = u.user_id
  `).all()
  if (fromUsers.length) return fromUsers

  const byId = new Map()
  for (const row of db.prepare(`
    SELECT
      user_id AS user_id,
      first_source AS first_source,
      first_chip_at AS first_chip_at,
      NULL AS telegram_bound,
      NULL AS email_bound,
      NULL AS preferred_language
    FROM user_facts
    WHERE user_id IS NOT NULL AND TRIM(user_id) != ''
  `).all()) {
    byId.set(row.user_id, row)
  }

  for (const row of db.prepare(`
    SELECT
      user_id AS user_id,
      MIN(first_entry_source) AS first_source
    FROM events
    WHERE user_id IS NOT NULL AND TRIM(user_id) != ''
    GROUP BY user_id
  `).all()) {
    const cur = byId.get(row.user_id)
    if (cur) {
      if (cur.first_source == null && row.first_source != null) cur.first_source = row.first_source
      continue
    }
    byId.set(row.user_id, {
      user_id: row.user_id,
      first_source: row.first_source ?? null,
      first_chip_at: null,
      telegram_bound: null,
      email_bound: null,
      preferred_language: null,
    })
  }

  return [...byId.values()]
}

function rebuildUserFeatures() {
  ensureSchema()
  try { db.exec('DELETE FROM user_features') } catch { /* table created by ensureSchema */ }
  const meta = readMeta()
  // Prefer events watermark / imported max ts over wall clock so fresh imports
  // classify against observed data instead of "now".
  const asOf =
    Date.parse(meta.as_of) ||
    Date.parse(meta.events_complete_through) ||
    (Number.isFinite(Number(meta.max_client_ts)) ? Number(meta.max_client_ts) : NaN) ||
    Date.now()
  const recent28 = asOf - 28 * DAY
  const now = Date.now()

  const insert = db.prepare(`
    INSERT INTO user_features (
      user_id, user_key, first_source, first_chip_at, last_chip_at,
      chip_days_28, ai_strategies_28, ai_strategies_all, used_strategy, returned_28,
      telegram_bound, email_bound, preferred_language, as_of, updated_at
    ) VALUES (
      @user_id, @user_key, @first_source, @first_chip_at, @last_chip_at,
      @chip_days_28, @ai_strategies_28, @ai_strategies_all, @used_strategy, @returned_28,
      @telegram_bound, @email_bound, @preferred_language, @as_of, @updated_at
    )
  `)

  const bases = loadUserFeatureBases()

  const chipByUser = new Map()
  for (const row of db.prepare(`
    SELECT user_id, client_ts FROM events
    WHERE event_name IN ('chip_analysis_viewed', 'chip_analysis_drilldown') AND user_id IS NOT NULL AND client_ts <= ?
    ORDER BY client_ts ASC
  `).all(asOf)) {
    if (!chipByUser.has(row.user_id)) chipByUser.set(row.user_id, [])
    chipByUser.get(row.user_id).push(row.client_ts)
  }

  const aiByUser = new Map()
  for (const row of db.prepare(`
    SELECT user_id, client_ts, properties FROM events
    WHERE event_name = 'strategy_started' AND user_id IS NOT NULL AND client_ts <= ?
  `).all(asOf)) {
    let props = {}
    try { props = JSON.parse(row.properties || '{}') } catch { /* ignore */ }
    if (!aiByUser.has(row.user_id)) aiByUser.set(row.user_id, [])
    aiByUser.get(row.user_id).push({ t: row.client_ts, strategy: props.strategy_type || null })
  }

  db.exec('BEGIN')
  try {
    for (const b of bases) {
      if (!b?.user_id) continue
      const chips = chipByUser.get(b.user_id) || []
      const firstChip = b.first_chip_at ?? (chips[0] ?? null)
      const lastChip = chips.length ? chips[chips.length - 1] : firstChip
      const days28 = new Set()
      let returned28 = 0
      for (let i = 0; i < chips.length; i++) {
        const t = chips[i]
        if (t >= recent28) days28.add(toDateStr(t))
        if (i > 0 && t >= recent28 && t - chips[i - 1] >= 28 * DAY) returned28 = 1
      }
      const ais = aiByUser.get(b.user_id) || []
      const stratAll = new Set(ais.map(a => a.strategy).filter(Boolean))
      const strat28 = new Set(ais.filter(a => a.t >= recent28).map(a => a.strategy).filter(Boolean))
      insert.run({
        user_id: b.user_id,
        user_key: `user:${b.user_id}`,
        first_source: b.first_source ?? null,
        first_chip_at: firstChip,
        last_chip_at: lastChip,
        chip_days_28: days28.size,
        ai_strategies_28: strat28.size,
        ai_strategies_all: stratAll.size,
        used_strategy: ais.length ? 1 : 0,
        returned_28: returned28,
        telegram_bound: b.telegram_bound,
        email_bound: b.email_bound,
        preferred_language: b.preferred_language ?? null,
        as_of: asOf,
        updated_at: now,
      })
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return bases.length
}

function rebuildAll() {
  ensureSchema()
  const t0 = Date.now()
  console.log('rebuildRollups: user_facts…')
  const facts = rebuildUserFacts()
  console.log(`  user_facts=${facts}`)
  console.log('rebuildRollups: daily_north_star…')
  const ns = rebuildDailyNorthStar()
  console.log(`  north_star_days=${ns}`)
  console.log('rebuildRollups: daily_channel_stats…')
  const ch = rebuildDailyChannelStats()
  console.log(`  channel_rows=${ch}`)
  console.log('rebuildRollups: daily_trade_stats…')
  const tr = rebuildDailyTradeStats()
  console.log(`  trade_rows=${tr}`)
  console.log('rebuildRollups: user_features…')
  const features = rebuildUserFeatures()
  console.log(`  user_features=${features}`)
  upsertMeta({
    rollups_built_at: new Date().toISOString(),
    rollups_version: 2,
  })
  console.log(`rebuildRollups: done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return { facts, ns, ch, tr, features }
}

if (require.main === module) {
  rebuildAll()
}

module.exports = {
  rebuildAll,
  rebuildUserFacts,
  rebuildDailyNorthStar,
  rebuildDailyChannelStats,
  rebuildDailyTradeStats,
  rebuildUserFeatures,
  toDateStr,
}
