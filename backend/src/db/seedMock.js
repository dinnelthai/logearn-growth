/**
 * seedMock.js — imports frontend mock JSON into SQLite when tables are empty
 * (or when rows are missing). Safe to call on every startup.
 *
 * Sources:
 *   frontend/src/api/logearn_events.json
 *   frontend/src/api/logearn_user.json
 *   frontend/src/api/logearn_user_referral.json
 *   frontend/src/api/trades.json
 */
const fs = require('fs')
const path = require('path')
const db = require('./connection')

const API_DIR = path.join(__dirname, '../../../frontend/src/api')

function readJson(name) {
  const full = path.join(API_DIR, name)
  if (!fs.existsSync(full)) {
    console.warn(`seedMock: missing ${full}`)
    return null
  }
  return JSON.parse(fs.readFileSync(full, 'utf8'))
}

function upsertMeta(table, meta) {
  const stmt = db.prepare(
    `INSERT INTO ${table} (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  for (const [key, value] of Object.entries(meta ?? {})) {
    stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
}

function withTx(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function resolveClientTs(e) {
  if (Number.isFinite(Number(e.client_ts))) return Number(e.client_ts)
  if (e.occurred_at != null) {
    const ts = Date.parse(e.occurred_at)
    if (Number.isFinite(ts)) return ts
  }
  return null
}

function seedEvents() {
  const file = readJson('logearn_events.json')
  if (!file) return { imported: 0 }
  const raw = Array.isArray(file) ? file : file.logearn_events
  if (!Array.isArray(raw) || !raw.length) return { imported: 0 }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO events (
      event_id, event_name, user_id, anonymous_id,
      first_entry_source, session_entry_source, session_id,
      client_ts, page, referrer, chain, app_version, device, ua, lang, properties
    ) VALUES (
      @event_id, @event_name, @user_id, @anonymous_id,
      @first_entry_source, @session_entry_source, @session_id,
      @client_ts, @page, @referrer, @chain, @app_version, @device, @ua, @lang, @properties
    )
  `)

  let imported = 0
  let skippedInvalid = 0
  withTx(() => {
    for (const e of raw) {
      const client_ts = resolveClientTs(e)
      if (!e.event_id || e.event_name == null || !Number.isFinite(client_ts)) {
        skippedInvalid += 1
        continue
      }
      const result = insert.run({
        event_id: e.event_id,
        event_name: e.event_name,
        user_id: e.user_id ?? null,
        anonymous_id: e.anonymous_id ?? null,
        first_entry_source: e.first_entry_source ?? null,
        session_entry_source: e.session_entry_source ?? null,
        session_id: e.session_id ?? null,
        client_ts,
        page: e.page ?? null,
        referrer: e.referrer ?? null,
        chain: e.chain ?? null,
        app_version: e.app_version ?? null,
        device: e.device ?? null,
        ua: e.ua ?? null,
        lang: e.lang ?? null,
        properties: JSON.stringify(e.properties ?? {}),
      })
      imported += Number(result.changes || 0)
    }
    upsertMeta('events_meta', file.meta ?? {})
  })
  return { imported, skippedInvalid }
}

function seedUsers() {
  const file = readJson('logearn_user.json')
  const raw = file?.logearn_users
  if (!Array.isArray(raw) || !raw.length) return { imported: 0 }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO logearn_users (
      user_id, created_at, telegram_bound, email_bound, is_partner,
      first_source, preferred_language, first_analysis_entry_module, first_analysis_at
    ) VALUES (
      @user_id, @created_at, @telegram_bound, @email_bound, @is_partner,
      @first_source, @preferred_language, @first_analysis_entry_module, @first_analysis_at
    )
  `)

  let imported = 0
  withTx(() => {
    for (const u of raw) {
      if (!u?.user_id) continue
      const result = insert.run({
        user_id: u.user_id,
        created_at: u.created_at ?? null,
        telegram_bound: typeof u.telegram_bound === 'boolean' ? (u.telegram_bound ? 1 : 0) : null,
        email_bound: typeof u.email_bound === 'boolean' ? (u.email_bound ? 1 : 0) : null,
        is_partner: typeof u.is_partner === 'boolean' ? (u.is_partner ? 1 : 0) : null,
        first_source: u.first_source ?? null,
        preferred_language: u.preferred_language ?? null,
        first_analysis_entry_module: u.first_analysis_entry_module ?? null,
        first_analysis_at: u.first_analysis_at ?? null,
      })
      imported += Number(result.changes || 0)
    }
  })
  return { imported }
}

function seedReferrals() {
  const file = readJson('logearn_user_referral.json')
  const raw = file?.logearn_user_referrals
  if (!Array.isArray(raw) || !raw.length) return { importedTrees: 0, importedInvitees: 0 }

  const insertTree = db.prepare(`
    INSERT OR IGNORE INTO referral_trees (user_id, invited_by, invited_at, commission)
    VALUES (@user_id, @invited_by, @invited_at, @commission)
  `)
  const insertInvitee = db.prepare(`
    INSERT OR IGNORE INTO referral_invitees (
      inviter_user_id, invitee_user_id, level, bound_at, referral_link_id, share_type
    ) VALUES (
      @inviter_user_id, @invitee_user_id, @level, @bound_at, @referral_link_id, @share_type
    )
  `)

  let importedTrees = 0
  let importedInvitees = 0
  withTx(() => {
    for (const tree of raw) {
      if (!tree?.user_id) continue
      const treeResult = insertTree.run({
        user_id: tree.user_id,
        invited_by: tree.invited_by ?? null,
        invited_at: tree.invited_at ?? null,
        commission: JSON.stringify(tree.commission ?? {}),
      })
      importedTrees += Number(treeResult.changes || 0)

      for (const [key, level] of [['invitees_l1', 1], ['invitees_l2', 2], ['invitees_l3', 3]]) {
        for (const inv of tree[key] ?? []) {
          if (!inv?.user_id) continue
          const r = insertInvitee.run({
            inviter_user_id: tree.user_id,
            invitee_user_id: inv.user_id,
            level,
            bound_at: inv.bound_at ?? null,
            referral_link_id: inv.referral_link_id ?? null,
            share_type: inv.share_type ?? null,
          })
          importedInvitees += Number(r.changes || 0)
        }
      }
    }
  })
  return { importedTrees, importedInvitees }
}

function seedTrades() {
  const file = readJson('trades.json')
  const raw = file?.trades
  if (!Array.isArray(raw) || !raw.length) return { imported: 0 }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO trades (
      trade_id, user_id, confirmed_at, volume_usd, status, chain, mock_scenario, trade_attempt_id
    ) VALUES (
      @trade_id, @user_id, @confirmed_at, @volume_usd, @status, @chain, @mock_scenario, @trade_attempt_id
    )
  `)

  let imported = 0
  withTx(() => {
    for (const [index, t] of raw.entries()) {
      // Some quality-demo rows intentionally omit trade_id; keep them with a
      // synthetic PK so the API can still return trade_id: null.
      const tradeId = t?.trade_id || `__noid__:${t?.user_id ?? 'unknown'}:${t?.confirmed_at ?? index}:${t?.volume_usd ?? ''}`
      const result = insert.run({
        trade_id: tradeId,
        user_id: t.user_id ?? null,
        confirmed_at: t.confirmed_at ?? null,
        volume_usd: t.volume_usd == null ? null : Number(t.volume_usd),
        status: t.status ?? null,
        chain: t.chain ?? null,
        mock_scenario: t.mock_scenario ?? null,
        trade_attempt_id: t.trade_attempt_id ?? null,
      })
      imported += Number(result.changes || 0)
    }
    upsertMeta('trades_meta', file.meta ?? {})
  })
  return { imported }
}

function seedMock() {
  // Skip JSON fixture import when a generated dataset (or any events) already exist.
  const existing = db.prepare('SELECT COUNT(*) AS n FROM events').get().n
  const generated = db.prepare(
    `SELECT value FROM events_meta WHERE key = 'generated_by'`
  ).get()?.value
  if (existing > 0) {
    if (generated) {
      console.log(`seedMock: skipped (using generated dataset, events=${existing})`)
    }
    return { skipped: true, existing, generated: Boolean(generated) }
  }

  const events = seedEvents()
  const users = seedUsers()
  const referrals = seedReferrals()
  const trades = seedTrades()

  console.log(
    `seedMock: events +${events.imported}` +
      (events.skippedInvalid ? ` (${events.skippedInvalid} invalid skipped)` : '') +
      `, users +${users.imported}` +
      `, referral_trees +${referrals.importedTrees}` +
      `, referral_invitees +${referrals.importedInvitees}` +
      `, trades +${trades.imported}`
  )
  return { events, users, referrals, trades }
}

module.exports = seedMock
