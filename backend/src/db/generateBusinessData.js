/**
 * generateBusinessData.js
 *
 * Clears analytics fact tables and regenerates a large, business-shaped dataset
 * directly into SQLite so the dashboard can be exercised at scale.
 *
 * Usage:
 *   node src/db/generateBusinessData.js
 *   USERS=5000 TARGET_EVENTS=200000 node src/db/generateBusinessData.js
 */
const { randomUUID } = require('node:crypto')
const db = require('./connection')
const fs = require('fs')
const path = require('path')

const USERS = Number(process.env.USERS || 5000)
const TARGET_EVENTS = Number(process.env.TARGET_EVENTS || 200000)
const DAY = 86400000
const TZ = 'Asia/Bangkok'

// Business window: ~7 weeks ending 2026-10-06 13:00 UTC+7
const AS_OF = Date.parse('2026-10-06T13:00:00+07:00')
const START_AT = Date.parse('2026-08-18T13:00:00+07:00')

const SOURCES = ['SEO', '直接访问', 'Bot', '社群', '邀请', 'KOL/合作']
const MODULES = ['callouts', 'signals', 'popular', 'fomo']
const STRATEGIES = ['1.5段', '日内2段']
const CHAINS = ['1', '56', 'solana']
const DEVICES = ['mobile', 'desktop', 'tablet']
const LANGS = ['zh', 'en', 'cn']

// Channel-ish first-touch profiles used by first_visit_captured
const CHANNEL_PROFILES = {
  SEO: { first_entry_source: 'SEO', referrer: 'https://www.google.com/', landing: 'https://logearn.com/zh/?utm_source=google&utm_medium=organic', channel_id: 'seo' },
  '直接访问': { first_entry_source: '直接访问', referrer: '', landing: 'https://logearn.com/zh/', channel_id: 'direct' },
  Bot: { first_entry_source: 'Bot', referrer: 'https://t.me/logearn_bot', landing: 'https://logearn.com/zh/?utm_source=telegram&utm_medium=bot', channel_id: 'telegram' },
  '社群': { first_entry_source: '社群', referrer: 'https://t.me/logearn_community', landing: 'https://logearn.com/zh/?utm_source=telegram&utm_medium=community', channel_id: 'community' },
  '邀请': { first_entry_source: '邀请', referrer: 'https://logearn.com/invite', landing: 'https://logearn.com/zh/?utm_source=invite&utm_medium=referral', channel_id: 'referral' },
  'KOL/合作': { first_entry_source: 'KOL/合作', referrer: 'https://x.com/kol_partner', landing: 'https://logearn.com/zh/?utm_source=x&utm_medium=kol&utm_campaign=growth', channel_id: 'kol' },
}

const AI_RATE = { SEO: 0.67, '直接访问': 0.58, Bot: 0.79, '社群': 0.45, '邀请': 0.72, 'KOL/合作': 0.54 }
const CHIP_GIVEN_AI = 0.68
const CHIP_NO_AI = 0.55
const TRADE_RATE = { SEO: 0.09, '直接访问': 0.14, Bot: 0.21, '社群': 0.16, '邀请': 0.24, 'KOL/合作': 0.12 }
const RETENTION = [0, 0.48, 0.36, 0.30, 0.29, 0.24, 0.22, 0.26]

let seed = 20261006
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }
function chance(p) { return rand() < p }
function clampTs(t) { return Math.min(Math.max(t, START_AT), AS_OF) }
function iso(t) { return new Date(t).toISOString() }

function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
}

function clearFacts() {
  db.exec('BEGIN')
  try {
    for (const table of [
      'daily_north_star_users', 'daily_north_star',
      'daily_channel_stats', 'daily_trade_stats',
      'user_features',
      'user_facts',
      'events', 'events_meta',
      'logearn_users',
      'referral_invitees', 'referral_trees',
      'trades', 'trades_meta',
    ]) {
      try { db.exec(`DELETE FROM ${table}`) } catch { /* table may not exist yet */ }
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function upsertMeta(table, meta) {
  const stmt = db.prepare(
    `INSERT INTO ${table} (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  for (const [key, value] of Object.entries(meta)) {
    stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
}

function makeEvent(partial) {
  return {
    event_id: partial.event_id || randomUUID(),
    event_name: partial.event_name,
    user_id: partial.user_id ?? null,
    anonymous_id: partial.anonymous_id,
    first_entry_source: partial.first_entry_source ?? null,
    session_entry_source: partial.session_entry_source ?? partial.first_entry_source ?? null,
    session_id: partial.session_id,
    client_ts: partial.client_ts,
    page: partial.page ?? '/zh/tokens',
    referrer: partial.referrer ?? '',
    chain: partial.chain ?? '56',
    app_version: '1.5.3',
    device: partial.device ?? 'mobile',
    ua: partial.ua ?? 'Mozilla/5.0',
    lang: partial.lang ?? 'zh',
    properties: partial.properties ?? {},
  }
}

function buildUserJourney(i) {
  const userId = `LE${String(20000 + i)}`
  const anonymousId = `anon-${userId}`
  const source = SOURCES[i % SOURCES.length]
  const channel = CHANNEL_PROFILES[source]
  const device = DEVICES[i % DEVICES.length]
  const lang = LANGS[i % LANGS.length]
  const chain = CHAINS[i % CHAINS.length]
  const strategyType = chance(0.55) ? STRATEGIES[0] : STRATEGIES[1]
  const telegramBound = i % 5 < 2
  const emailBound = i % 7 < 4

  // Spread first-seen across the window; earlier cohorts are denser.
  const windowDays = Math.floor((AS_OF - START_AT) / DAY)
  const firstDay = Math.floor(rand() * Math.min(windowDays - 7, 42))
  const firstTs = clampTs(START_AT + firstDay * DAY + (8 + Math.floor(rand() * 12)) * 3600000)

  const events = []
  const push = (e) => {
    if (e.client_ts > AS_OF) return
    events.push(e)
  }

  // 1) First visit (often anonymous)
  push(makeEvent({
    event_id: `fv-${userId}`,
    event_name: 'first_visit_captured',
    user_id: chance(0.35) ? userId : null,
    anonymous_id: anonymousId,
    first_entry_source: channel.first_entry_source,
    session_entry_source: channel.first_entry_source,
    session_id: `sess-${userId}-0`,
    client_ts: firstTs - 60000,
    page: '/zh/',
    referrer: channel.referrer,
    chain,
    device,
    lang,
    properties: {
      first_referrer_url: channel.referrer || null,
      first_landing_url: channel.landing,
      first_visit_at: firstTs - 60000,
      channel_id: channel.channel_id,
      channel_version: 1,
    },
  }))

  // 2) Login
  push(makeEvent({
    event_id: `login-${userId}-0`,
    event_name: 'login_succeeded',
    user_id: userId,
    anonymous_id: anonymousId,
    first_entry_source: source,
    session_id: `sess-${userId}-0`,
    client_ts: firstTs,
    page: '/zh/login',
    referrer: channel.referrer,
    chain,
    device,
    lang,
    properties: { login_method: chance(0.7) ? 'wallet' : 'email', is_new_user: true },
  }))

  const withAiBase = chance(AI_RATE[source])
  let firstChipTs = null
  let visitIndex = 0

  const runVisit = (loginTs, sessionIdx, forceChip = false) => {
    const sessionId = `sess-${userId}-${sessionIdx}`
    const module = MODULES[(i + sessionIdx) % MODULES.length]
    const tokenAddress = `0x${(100000 + (i * 17 + sessionIdx) % 900000).toString(16)}`
    const tokenVisitId = `visit-${userId}-${visitIndex++}`
    const strategyRunId = `run-${userId}-${sessionIdx}`
    const t0 = loginTs

    if (sessionIdx > 0) {
      push(makeEvent({
        event_id: `login-${userId}-${sessionIdx}`,
        event_name: 'login_succeeded',
        user_id: userId,
        anonymous_id: anonymousId,
        first_entry_source: source,
        session_id: sessionId,
        client_ts: t0,
        chain, device, lang,
        properties: { login_method: 'wallet', is_new_user: false },
      }))
    }

    push(makeEvent({
      event_name: 'module_viewed',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: t0 + 15000,
      chain, device, lang,
      properties: { module },
    }))

    push(makeEvent({
      event_name: 'token_opened',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: t0 + 30000,
      chain, device, lang,
      page: `/zh/tokens/${tokenAddress}`,
      properties: {
        token_address: tokenAddress,
        chain,
        entry_module: module,
        token_visit_id: tokenVisitId,
        position: (i % 10) + 1,
        list_type: module,
      },
    }))

    push(makeEvent({
      event_name: 'token_detail_viewed',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: t0 + 60000,
      chain, device, lang,
      page: `/zh/tokens/${tokenAddress}`,
      properties: {
        token_address: tokenAddress,
        chain,
        entry_module: module,
        token_visit_id: tokenVisitId,
        symbol: `TKN${i % 200}`,
      },
    }))

    const doAi = sessionIdx === 0 ? withAiBase : chance(0.5)
    let aiTs = null
    if (doAi) {
      aiTs = t0 + 60000 + (1 + Math.floor(rand() * 100)) * 60000
      push(makeEvent({
        event_name: 'strategy_started',
        user_id: userId,
        anonymous_id: anonymousId,
        first_entry_source: source,
        session_id: sessionId,
        client_ts: aiTs,
        chain, device, lang,
        properties: {
          strategy_type: strategyType,
          strategy_run_id: strategyRunId,
          token_address: tokenAddress,
          chain,
          token_visit_id: tokenVisitId,
          is_first_strategy: sessionIdx === 0,
        },
      }))
      if (chance(0.55)) {
        push(makeEvent({
          event_name: 'strategy_result_generated',
          user_id: userId,
          anonymous_id: anonymousId,
          first_entry_source: source,
          session_id: sessionId,
          client_ts: aiTs + 120000,
          chain, device, lang,
          properties: {
            strategy_type: strategyType,
            strategy_run_id: strategyRunId,
            result_id: `result-${userId}-${sessionIdx}`,
            token_visit_id: tokenVisitId,
          },
        }))
        if (chance(0.5)) {
          push(makeEvent({
            event_name: 'strategy_signal_viewed',
            user_id: userId,
            anonymous_id: anonymousId,
            first_entry_source: source,
            session_id: sessionId,
            client_ts: aiTs + 180000,
            chain, device, lang,
            properties: {
              strategy_run_id: strategyRunId,
              result_id: `result-${userId}-${sessionIdx}`,
              token_visit_id: tokenVisitId,
            },
          }))
        }
      }
    }

    const doChip = forceChip || chance(doAi ? CHIP_GIVEN_AI : CHIP_NO_AI)
    if (doChip) {
      const chipTs = (aiTs ?? (t0 + 60000)) + (5 + Math.floor(rand() * 190)) * 60000
      if (!firstChipTs) firstChipTs = chipTs
      push(makeEvent({
        event_name: 'chip_analysis_viewed',
        user_id: userId,
        anonymous_id: anonymousId,
        first_entry_source: source,
        session_id: sessionId,
        client_ts: chipTs,
        chain, device, lang,
        page: `/zh/tokens/${tokenAddress}`,
        properties: {
          token_address: tokenAddress,
          chain,
          entry_module: module,
          token_visit_id: tokenVisitId,
          cache_hit: chance(0.25),
          analysis_source: doAi ? 'strategy' : 'manual',
        },
      }))
      if (chance(0.2)) {
        push(makeEvent({
          event_name: 'chip_analysis_drilldown',
          user_id: userId,
          anonymous_id: anonymousId,
          first_entry_source: source,
          session_id: sessionId,
          client_ts: chipTs + 45000,
          chain, device, lang,
          properties: {
            token_address: tokenAddress,
            token_visit_id: tokenVisitId,
            drilldown_type: pick(['holder', 'cluster', 'range']),
          },
        }))
      }
    }

    // Trade attempt linked by trade_attempt_id / trade_id
    const tradeFact = []
    if (doChip && chance(TRADE_RATE[source])) {
      const attemptId = `attempt-${userId}-${sessionIdx}`
      const tradeId = `trade-${userId}-${sessionIdx}`
      const submitTs = (firstChipTs || t0) + (2 + Math.floor(rand() * 40)) * 60000
      push(makeEvent({
        event_name: 'trade_submitted',
        user_id: userId,
        anonymous_id: anonymousId,
        first_entry_source: source,
        session_id: sessionId,
        client_ts: submitTs,
        chain, device, lang,
        properties: {
          trade_attempt_id: attemptId,
          token_address: tokenAddress,
          chain,
          token_visit_id: tokenVisitId,
          trade_type: chance(0.7) ? 'market' : 'limit',
          amount: Math.round((50 + rand() * 950) * 100) / 100,
        },
      }))
      const success = chance(0.72)
      if (success) {
        const okTs = submitTs + (30 + Math.floor(rand() * 300)) * 1000
        push(makeEvent({
          event_name: 'trade_succeeded',
          user_id: userId,
          anonymous_id: anonymousId,
          first_entry_source: source,
          session_id: sessionId,
          client_ts: okTs,
          chain, device, lang,
          properties: {
            trade_attempt_id: attemptId,
            trade_id: tradeId,
            token_address: tokenAddress,
            chain,
          },
        }))
        tradeFact.push({
          trade_id: tradeId,
          user_id: userId,
          confirmed_at: iso(okTs),
          volume_usd: Math.round((80 + rand() * 1200) * 100) / 100,
          status: 'confirmed',
          chain,
          trade_attempt_id: attemptId,
        })
      } else {
        push(makeEvent({
          event_name: 'trade_failed',
          user_id: userId,
          anonymous_id: anonymousId,
          first_entry_source: source,
          session_id: sessionId,
          client_ts: submitTs + (20 + Math.floor(rand() * 120)) * 1000,
          chain, device, lang,
          properties: {
            trade_attempt_id: attemptId,
            token_address: tokenAddress,
            reason: pick(['slippage', 'insufficient_balance', 'user_cancelled', 'rpc_timeout']),
          },
        }))
      }
    }

    // Light share / invite noise for growth loop
    if (chance(0.08)) {
      const linkId = `link-${userId}`
      push(makeEvent({
        event_name: 'share_button_clicked',
        user_id: userId,
        anonymous_id: anonymousId,
        first_entry_source: source,
        session_id: sessionId,
        client_ts: t0 + 10 * 60000,
        chain, device, lang,
        properties: { referral_link_id: linkId, share_type: 'signal', share_method: 'copy' },
      }))
      if (chance(0.6)) {
        push(makeEvent({
          event_name: 'share_completed',
          user_id: userId,
          anonymous_id: anonymousId,
          first_entry_source: source,
          session_id: sessionId,
          client_ts: t0 + 11 * 60000,
          chain, device, lang,
          properties: { referral_link_id: linkId, share_type: 'signal', share_method: 'copy' },
        }))
      }
    }

    return tradeFact
  }

  const trades = []
  // First session
  if (withAiBase || chance(0.7)) {
    trades.push(...runVisit(firstTs, 0))
  } else {
    // Still login-only / shallow users
    push(makeEvent({
      event_name: 'module_viewed',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: `sess-${userId}-0`,
      client_ts: firstTs + 20000,
      chain, device, lang,
      properties: { module: pick(MODULES) },
    }))
  }

  // Retention returns from first chip day
  if (firstChipTs) {
    for (let d = 1; d <= 7; d++) {
      if (!chance(RETENTION[d])) continue
      const rt = firstChipTs + d * DAY + Math.floor(rand() * 6) * 3600000
      if (rt >= AS_OF) continue
      trades.push(...runVisit(rt, d, true))
    }
  }

  // Occasional extra later sessions for power users
  if (chance(0.18)) {
    const extra = firstTs + (10 + Math.floor(rand() * 20)) * DAY
    if (extra < AS_OF) trades.push(...runVisit(extra, 20 + Math.floor(rand() * 5), chance(0.7)))
  }

  const user = {
    user_id: userId,
    created_at: iso(firstTs - 120000),
    telegram_bound: telegramBound,
    email_bound: emailBound,
    is_partner: i % 40 === 0,
    first_source: source,
    preferred_language: i % 10 === 0 ? null : (lang === 'en' ? 'en' : 'zh'),
    first_analysis_entry_module: events.find(e => e.event_name === 'chip_analysis_viewed')?.properties?.entry_module ?? null,
    first_analysis_at: firstChipTs ? iso(firstChipTs) : null,
  }

  return { user, events: events.filter(e => Number.isFinite(e.client_ts) && e.client_ts <= AS_OF), trades }
}

function buildReferrals(users) {
  // ~12% of users invite 1-3 others from later cohort
  const trees = []
  const invitees = []
  const byId = new Map(users.map(u => [u.user_id, u]))
  const ids = users.map(u => u.user_id)

  for (let i = 0; i < ids.length; i++) {
    if (!chance(0.12)) continue
    const inviter = ids[i]
    const n = 1 + Math.floor(rand() * 3)
    const children = []
    for (let k = 0; k < n; k++) {
      const invitee = ids[Math.min(ids.length - 1, i + 3 + k * 7 + Math.floor(rand() * 11))]
      if (!invitee || invitee === inviter) continue
      if (children.includes(invitee)) continue
      children.push(invitee)
      const bound = Date.parse(byId.get(invitee).created_at) + Math.floor(rand() * DAY)
      invitees.push({
        inviter_user_id: inviter,
        invitee_user_id: invitee,
        level: 1,
        bound_at: iso(Math.min(bound, AS_OF)),
        referral_link_id: `link-${inviter}-invite`,
        share_type: 'invite',
      })
    }
    if (!children.length) continue
    trees.push({
      user_id: inviter,
      invited_by: null,
      invited_at: null,
      commission: { l1: children.length, l2: 0, l3: 0 },
    })
  }
  return { trees, invitees }
}

function prepareWriters() {
  return {
    insertEvent: db.prepare(`
      INSERT OR IGNORE INTO events (
        event_id, event_name, user_id, anonymous_id,
        first_entry_source, session_entry_source, session_id,
        client_ts, page, referrer, chain, app_version, device, ua, lang, properties
      ) VALUES (
        @event_id, @event_name, @user_id, @anonymous_id,
        @first_entry_source, @session_entry_source, @session_id,
        @client_ts, @page, @referrer, @chain, @app_version, @device, @ua, @lang, @properties
      )
    `),
    insertUser: db.prepare(`
      INSERT OR IGNORE INTO logearn_users (
        user_id, created_at, telegram_bound, email_bound, is_partner,
        first_source, preferred_language, first_analysis_entry_module, first_analysis_at
      ) VALUES (
        @user_id, @created_at, @telegram_bound, @email_bound, @is_partner,
        @first_source, @preferred_language, @first_analysis_entry_module, @first_analysis_at
      )
    `),
    insertTrade: db.prepare(`
      INSERT OR IGNORE INTO trades (
        trade_id, user_id, confirmed_at, volume_usd, status, chain, mock_scenario, trade_attempt_id
      ) VALUES (
        @trade_id, @user_id, @confirmed_at, @volume_usd, @status, @chain, @mock_scenario, @trade_attempt_id
      )
    `),
    insertFact: db.prepare(`
      INSERT INTO user_facts (
        user_key, user_id, anonymous_id, first_source, first_visit_at, first_login_at,
        first_chip_at, first_channel_id, updated_at
      ) VALUES (
        @user_key, @user_id, @anonymous_id, @first_source, @first_visit_at, @first_login_at,
        @first_chip_at, @first_channel_id, @updated_at
      )
      ON CONFLICT(user_key) DO UPDATE SET
        first_visit_at = COALESCE(excluded.first_visit_at, user_facts.first_visit_at),
        first_login_at = COALESCE(excluded.first_login_at, user_facts.first_login_at),
        first_chip_at = COALESCE(excluded.first_chip_at, user_facts.first_chip_at),
        first_source = COALESCE(excluded.first_source, user_facts.first_source),
        first_channel_id = COALESCE(excluded.first_channel_id, user_facts.first_channel_id),
        updated_at = excluded.updated_at
    `),
    insertTree: db.prepare(`
      INSERT OR IGNORE INTO referral_trees (user_id, invited_by, invited_at, commission)
      VALUES (@user_id, @invited_by, @invited_at, @commission)
    `),
    insertInvitee: db.prepare(`
      INSERT OR IGNORE INTO referral_invitees (
        inviter_user_id, invitee_user_id, level, bound_at, referral_link_id, share_type
      ) VALUES (
        @inviter_user_id, @invitee_user_id, @level, @bound_at, @referral_link_id, @share_type
      )
    `),
  }
}

function writeBatch(writers, { users, events, trades, facts }) {
  for (const u of users) {
    writers.insertUser.run({
      user_id: u.user_id,
      created_at: u.created_at,
      telegram_bound: u.telegram_bound ? 1 : 0,
      email_bound: u.email_bound ? 1 : 0,
      is_partner: u.is_partner ? 1 : 0,
      first_source: u.first_source,
      preferred_language: u.preferred_language,
      first_analysis_entry_module: u.first_analysis_entry_module,
      first_analysis_at: u.first_analysis_at,
    })
  }
  for (const e of events) {
    writers.insertEvent.run({
      ...e,
      properties: JSON.stringify(e.properties ?? {}),
    })
  }
  for (const t of trades) {
    writers.insertTrade.run({
      trade_id: t.trade_id,
      user_id: t.user_id,
      confirmed_at: t.confirmed_at,
      volume_usd: t.volume_usd,
      status: t.status,
      chain: t.chain ?? null,
      mock_scenario: t.mock_scenario ?? null,
      trade_attempt_id: t.trade_attempt_id ?? null,
    })
  }
  for (const f of facts) writers.insertFact.run(f)
}

function userFactFromBuilt(built) {
  const firstVisit = built.events.find(e => e.event_name === 'first_visit_captured')
  const firstLogin = built.events.find(e => e.event_name === 'login_succeeded')
  const firstChip = built.events.find(e => e.event_name === 'chip_analysis_viewed')
  return {
    user_key: `user:${built.user.user_id}`,
    user_id: built.user.user_id,
    anonymous_id: `anon-${built.user.user_id}`,
    first_source: built.user.first_source,
    first_visit_at: firstVisit?.client_ts ?? null,
    first_login_at: firstLogin?.client_ts ?? null,
    first_chip_at: firstChip?.client_ts ?? (built.user.first_analysis_at ? Date.parse(built.user.first_analysis_at) : null),
    first_channel_id: firstVisit?.properties?.channel_id ?? null,
    updated_at: Date.now(),
  }
}

function makeExtraVisit(user, guard) {
  const userId = user.user_id
  const anonymousId = `anon-${userId}`
  const source = user.first_source
  const extraTs = clampTs(START_AT + (20 + (guard % 25)) * DAY + (9 + Math.floor(rand() * 8)) * 3600000)
  const module = pick(MODULES)
  const tokenAddress = `0xextra${(guard % 5000).toString(16)}`
  const tokenVisitId = `visit-extra-${userId}-${guard}`
  const sessionId = `sess-extra-${userId}-${guard}`
  return [
    makeEvent({
      event_name: 'login_succeeded',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: extraTs,
      properties: { login_method: 'wallet', is_new_user: false },
    }),
    makeEvent({
      event_name: 'module_viewed',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: extraTs + 10000,
      properties: { module },
    }),
    makeEvent({
      event_name: 'token_opened',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: extraTs + 20000,
      properties: { token_address: tokenAddress, chain: '56', entry_module: module, token_visit_id: tokenVisitId, position: 1 },
    }),
    makeEvent({
      event_name: 'token_detail_viewed',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: extraTs + 40000,
      properties: { token_address: tokenAddress, chain: '56', entry_module: module, token_visit_id: tokenVisitId },
    }),
    makeEvent({
      event_name: 'chip_analysis_viewed',
      user_id: userId,
      anonymous_id: anonymousId,
      first_entry_source: source,
      session_id: sessionId,
      client_ts: extraTs + 90000,
      properties: { token_address: tokenAddress, chain: '56', entry_module: module, token_visit_id: tokenVisitId, analysis_source: 'manual' },
    }),
  ].filter(e => e.client_ts <= AS_OF)
}

function main() {
  const started = Date.now()
  const BATCH = Number(process.env.BATCH || 200)
  console.log(`Generating business data: users=${USERS}, target_events≈${TARGET_EVENTS}, batch=${BATCH}`)
  ensureSchema()
  clearFacts()

  const writers = prepareWriters()
  const userSummaries = [] // lightweight refs for referral + extra visits (no events)
  let eventCount = 0
  let tradeCount = 0

  let pending = { users: [], events: [], trades: [], facts: [] }
  const flush = () => {
    if (!pending.users.length && !pending.events.length) return
    db.exec('BEGIN')
    try {
      writeBatch(writers, pending)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    pending = { users: [], events: [], trades: [], facts: [] }
  }

  for (let i = 0; i < USERS; i++) {
    const built = buildUserJourney(i)
    userSummaries.push({
      user_id: built.user.user_id,
      first_source: built.user.first_source,
      created_at: built.user.created_at,
      first_analysis_at: built.user.first_analysis_at,
    })
    pending.users.push(built.user)
    pending.events.push(...built.events)
    pending.trades.push(...built.trades)
    pending.facts.push(userFactFromBuilt(built))
    eventCount += built.events.length
    tradeCount += built.trades.length

    if (pending.users.length >= BATCH) {
      flush()
      if ((i + 1) % 1000 === 0 || pending.users.length === 0) {
        console.log(`  users ${i + 1}/${USERS}, events so far ${eventCount}`)
      }
    }
  }
  flush()

  // Top up toward TARGET_EVENTS without holding the full array in memory
  let guard = 0
  while (eventCount < TARGET_EVENTS && guard < USERS * 20) {
    const user = userSummaries[guard % userSummaries.length]
    const batch = makeExtraVisit(user, guard)
    pending.events.push(...batch)
    eventCount += batch.length
    // first_chip_at may already be set; extras don't rewrite facts
    guard += 1
    if (pending.events.length >= BATCH * 20) {
      flush()
      if (guard % 2000 === 0) console.log(`  extra visits ${guard}, events so far ${eventCount}`)
    }
  }
  flush()

  const { trees, invitees } = buildReferrals(userSummaries.map(u => ({
    user_id: u.user_id,
    first_source: u.first_source,
    created_at: u.created_at,
    first_analysis_at: u.first_analysis_at,
  })))
  db.exec('BEGIN')
  try {
    for (const tree of trees) {
      writers.insertTree.run({
        user_id: tree.user_id,
        invited_by: tree.invited_by,
        invited_at: tree.invited_at,
        commission: JSON.stringify(tree.commission ?? {}),
      })
    }
    for (const inv of invitees) writers.insertInvitee.run(inv)
    upsertMeta('events_meta', {
      as_of: iso(AS_OF),
      start_at: iso(START_AT),
      timezone: TZ,
      history_complete: true,
      events_complete_through: iso(AS_OF),
      generated_by: 'generateBusinessData.js',
      generated_at: new Date().toISOString(),
      target_events: TARGET_EVENTS,
      users: USERS,
    })
    upsertMeta('trades_meta', {
      trades_start_at: iso(START_AT + 14 * DAY),
      trades_complete_through: iso(AS_OF),
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  // Rebuild daily rollups if the helper is available
  try {
    const { rebuildAll } = require('./rebuildRollups')
    console.log('rebuilding rollups…')
    rebuildAll()
  } catch (err) {
    console.warn('rollup rebuild skipped:', err.message)
  }

  const counts = {
    events: db.prepare('SELECT COUNT(*) n FROM events').get().n,
    users: db.prepare('SELECT COUNT(*) n FROM logearn_users').get().n,
    user_facts: db.prepare('SELECT COUNT(*) n FROM user_facts').get().n,
    trades: db.prepare('SELECT COUNT(*) n FROM trades').get().n,
    trees: db.prepare('SELECT COUNT(*) n FROM referral_trees').get().n,
    invitees: db.prepare('SELECT COUNT(*) n FROM referral_invitees').get().n,
    chip: db.prepare("SELECT COUNT(*) n FROM events WHERE event_name='chip_analysis_viewed'").get().n,
    daily_ns: db.prepare('SELECT COUNT(*) n FROM daily_north_star').get().n,
  }
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/analytics.db')
  const sizeMb = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)
  console.log('done', counts, `db=${sizeMb}MB`, `elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main()
