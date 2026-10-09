/**
 * importGrowthEvents.js — pull growth_events from Hologres/Postgres into local SQLite.
 *
 * Usage:
 *   node src/db/importGrowthEvents.js              # sample 20 rows + counts (safe)
 *   node src/db/importGrowthEvents.js --probe       # same as default
 *   node src/db/importGrowthEvents.js --import      # full import (backs up DB first)
 *   node src/db/importGrowthEvents.js --import --limit=5000
 *   node src/db/importGrowthEvents.js --import --since=2026-09-01
 *   node src/db/importGrowthEvents.js --import --rebuild
 *
 * Reads connection from backend/.env (PG* or DATABASE_URL).
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// Load backend/.env before opening SQLite (connection.js reads DB_PATH from env).
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const { Client } = require('pg')

const ROOT = path.join(__dirname, '../..')
const DEFAULT_DB_PATH = path.join(ROOT, 'data/analytics.db')
const DB_PATH = process.env.DB_PATH
  ? path.resolve(ROOT, process.env.DB_PATH)
  : DEFAULT_DB_PATH
const SOURCE_TABLE = sanitizeIdent(process.env.SOURCE_EVENTS_TABLE || 'growth_events')

function sanitizeIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(String(name || ''))) {
    throw new Error(`Invalid SOURCE_EVENTS_TABLE: ${name}`)
  }
  return String(name)
}

function parseArgs(argv) {
  const out = {
    probe: true,
    doImport: false,
    rebuild: false,
    limit: null,
    since: null,
    sample: 20,
  }
  for (const raw of argv) {
    if (raw === '--import') {
      out.doImport = true
      out.probe = false
    } else if (raw === '--probe') {
      out.probe = true
      out.doImport = false
    } else if (raw === '--rebuild') {
      out.rebuild = true
    } else if (raw.startsWith('--limit=')) {
      out.limit = Number(raw.slice('--limit='.length))
    } else if (raw.startsWith('--since=')) {
      out.since = raw.slice('--since='.length)
    } else if (raw.startsWith('--sample=')) {
      out.sample = Number(raw.slice('--sample='.length))
    } else if (raw === '--help' || raw === '-h') {
      out.help = true
    }
  }
  if (out.limit != null && (!Number.isFinite(out.limit) || out.limit <= 0)) {
    throw new Error(`Invalid --limit=${out.limit}`)
  }
  if (out.since != null && !/^\d{4}-\d{2}-\d{2}/.test(out.since)) {
    throw new Error(`Invalid --since=${out.since} (use YYYY-MM-DD)`)
  }
  return out
}

function sslMode() {
  // Match DataGrip: Prefer (default) | require | disable | no-verify
  const raw = String(process.env.PGSSL || 'prefer').toLowerCase()
  if (raw === '0' || raw === 'disable' || raw === 'false') return 'disable'
  if (raw === 'require' || raw === '1' || raw === 'true') return 'require'
  if (raw === 'no-verify') return 'no-verify'
  return 'prefer'
}

function pgConfig(ssl) {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl,
      connectionTimeoutMillis: 15000,
    }
  }
  const host = process.env.PGHOST
  const database = process.env.PGDATABASE
  const user = process.env.PGUSER
  const password = process.env.PGPASSWORD
  const port = Number(process.env.PGPORT || 5432)
  if (!host || !database || !user || password == null || password === '') {
    throw new Error('Missing PGHOST/PGDATABASE/PGUSER/PGPASSWORD (or DATABASE_URL) in backend/.env')
  }
  return {
    host,
    port,
    database,
    user,
    password,
    ssl,
    connectionTimeoutMillis: 15000,
  }
}

function isSslUnsupportedError(err) {
  const msg = String(err && err.message || err || '')
  return /does not support SSL|SSL.*(not|unsupported)|server does not support SSL/i.test(msg)
}

async function connectPg() {
  const mode = sslMode()
  const attempts = []
  if (mode === 'disable') {
    attempts.push({ label: 'ssl=disable', ssl: false })
  } else if (mode === 'require') {
    attempts.push({ label: 'ssl=require', ssl: true })
  } else if (mode === 'no-verify') {
    attempts.push({ label: 'ssl=no-verify', ssl: { rejectUnauthorized: false } })
  } else {
    // prefer — same idea as DataGrip SSL Mode=Prefer
    attempts.push({ label: 'ssl=prefer/on', ssl: true })
    attempts.push({ label: 'ssl=prefer/off', ssl: false })
  }

  let lastErr = null
  for (const attempt of attempts) {
    const client = new Client(pgConfig(attempt.ssl))
    try {
      await client.connect()
      console.log(`[pg] connected with ${attempt.label}`)
      return client
    } catch (err) {
      lastErr = err
      try { await client.end() } catch {}
      if (mode === 'prefer' && attempt.ssl && isSslUnsupportedError(err)) {
        console.warn(`[pg] ${attempt.label} failed (${err.message}); falling back like DataGrip Prefer`)
        continue
      }
      throw err
    }
  }
  throw lastErr || new Error('Failed to connect')
}

function resolveClientTs(row) {
  if (row.client_ts != null && Number.isFinite(Number(row.client_ts))) {
    return Number(row.client_ts)
  }
  if (row.server_ts != null) {
    const ts = Date.parse(row.server_ts)
    if (Number.isFinite(ts)) return ts
  }
  return null
}

function resolveEventId(row) {
  if (row.event_id != null && String(row.event_id).trim() !== '') {
    return String(row.event_id)
  }
  if (row.id != null) return `hg-${row.id}`
  return null
}

function normalizeProperties(value) {
  if (value == null) return '{}'
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify({ raw: value })
    }
  }
  return JSON.stringify(value)
}

function mapRow(row) {
  const event_id = resolveEventId(row)
  const event_name = row.event_name == null ? null : String(row.event_name)
  const client_ts = resolveClientTs(row)
  if (!event_id || event_name == null || !Number.isFinite(client_ts)) return null
  return {
    event_id,
    event_name,
    user_id: row.user_id ?? null,
    anonymous_id: row.anonymous_id ?? null,
    first_entry_source: row.first_entry_source ?? null,
    session_entry_source: row.session_entry_source ?? null,
    session_id: row.session_id ?? null,
    client_ts,
    page: row.page ?? null,
    referrer: row.referrer ?? null,
    chain: row.chain ?? null,
    app_version: row.app_version ?? null,
    device: row.device ?? null,
    ua: row.ua ?? null,
    lang: row.lang ?? null,
    properties: normalizeProperties(row.properties),
  }
}

async function probe(client, opts) {
  console.log(`[probe] source table: ${SOURCE_TABLE}`)
  const countRes = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${SOURCE_TABLE}`)
  const total = Number(countRes.rows[0].n)
  console.log(`[probe] total rows: ${total.toLocaleString('en-US')}`)

  const names = await client.query(`
    SELECT event_name, COUNT(*)::bigint AS c
    FROM ${SOURCE_TABLE}
    GROUP BY 1
    ORDER BY c DESC
    LIMIT 20
  `)
  console.log('[probe] top event_name:')
  for (const row of names.rows) {
    console.log(`  ${row.event_name}\t${Number(row.c).toLocaleString('en-US')}`)
  }

  const bounds = await client.query(`
    SELECT
      MIN(client_ts) AS min_client_ts,
      MAX(client_ts) AS max_client_ts,
      MIN(server_ts) AS min_server_ts,
      MAX(server_ts) AS max_server_ts,
      COUNT(*) FILTER (WHERE event_id IS NULL OR btrim(event_id) = '') AS missing_event_id,
      COUNT(*) FILTER (WHERE client_ts IS NULL) AS missing_client_ts,
      COUNT(*) FILTER (WHERE user_id IS NULL AND anonymous_id IS NULL) AS missing_both_ids
    FROM ${SOURCE_TABLE}
  `)
  console.log('[probe] bounds / quality:', bounds.rows[0])

  const sampleN = Number.isFinite(opts.sample) ? opts.sample : 20
  const sample = await client.query(
    `
    SELECT id, event_id, event_name, user_id, anonymous_id, first_entry_source,
           session_id, client_ts, server_ts, page, referrer, chain, app_version,
           device, lang, properties
    FROM ${SOURCE_TABLE}
    ORDER BY server_ts DESC NULLS LAST
    LIMIT $1
    `,
    [sampleN],
  )
  console.log(`[probe] latest ${sample.rows.length} rows (mapped preview):`)
  for (const row of sample.rows.slice(0, 5)) {
    const mapped = mapRow(row)
    console.log({
      src_id: row.id,
      event_id: mapped?.event_id ?? null,
      event_name: mapped?.event_name ?? row.event_name,
      client_ts: mapped?.client_ts ?? null,
      user_id: mapped?.user_id ?? null,
      anonymous_id: mapped?.anonymous_id ?? null,
      ok: Boolean(mapped),
    })
  }
  return { total }
}

function backupLocalDb() {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[backup] no existing DB at ${DB_PATH}`)
    return null
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = `${DB_PATH}.bak-${stamp}`
  fs.copyFileSync(DB_PATH, dest)
  console.log(`[backup] ${DB_PATH} -> ${dest}`)
  return dest
}

function openSqlite() {
  // Ensure env DB_PATH matches the path we backed up / will write.
  process.env.DB_PATH = DB_PATH
  // Fresh require so connection.js picks up DB_PATH.
  delete require.cache[require.resolve('./connection')]
  const db = require('./connection')
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  schema.split(';').map((s) => s.trim()).filter(Boolean).forEach((stmt) => {
    try {
      db.exec(stmt)
    } catch (err) {
      if (!String(err.message || '').includes('already exists')) throw err
    }
  })
  return db
}

function clearAnalyticsFacts(db) {
  db.exec('BEGIN')
  try {
    db.exec(`
      DELETE FROM daily_north_star_users;
      DELETE FROM daily_north_star;
      DELETE FROM daily_channel_stats;
      DELETE FROM daily_trade_stats;
      DELETE FROM user_features;
      DELETE FROM user_facts;
      DELETE FROM events;
      DELETE FROM events_meta;
      DELETE FROM trades;
      DELETE FROM trades_meta;
      DELETE FROM referral_invitees;
      DELETE FROM referral_trees;
      DELETE FROM logearn_users;
    `)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function upsertEventsMeta(db, meta) {
  const stmt = db.prepare(
    `INSERT INTO events_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
  for (const [key, value] of Object.entries(meta)) {
    stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
}

async function importAll(client, opts) {
  backupLocalDb()
  const db = openSqlite()
  console.log(`[import] clearing local analytics facts in ${DB_PATH}`)
  clearAnalyticsFacts(db)

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

  const params = []
  const where = []
  if (opts.since) {
    // Prefer client_ts; also accept rows whose server_ts falls in range when client_ts null.
    const sinceMs = Date.parse(`${opts.since}T00:00:00.000Z`)
    if (!Number.isFinite(sinceMs)) throw new Error(`Invalid --since=${opts.since}`)
    params.push(sinceMs)
    where.push(`(client_ts >= $${params.length} OR (client_ts IS NULL AND server_ts >= to_timestamp($${params.length}/1000.0)))`)
  }

  let sql = `
    SELECT id, event_id, event_name, user_id, anonymous_id, first_entry_source,
           session_id, client_ts, server_ts, page, referrer, chain, app_version,
           device, ua, lang, properties
    FROM ${SOURCE_TABLE}
  `
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY id ASC`
  if (opts.limit) {
    params.push(opts.limit)
    sql += ` LIMIT $${params.length}`
  }

  console.log(`[import] querying ${SOURCE_TABLE}${opts.since ? ` since ${opts.since}` : ''}${opts.limit ? ` limit ${opts.limit}` : ''} ...`)
  const res = await client.query(sql, params)
  console.log(`[import] fetched ${res.rows.length.toLocaleString('en-US')} rows`)

  let imported = 0
  let skippedInvalid = 0
  let minTs = null
  let maxTs = null

  db.exec('BEGIN')
  try {
    for (const row of res.rows) {
      const mapped = mapRow(row)
      if (!mapped) {
        skippedInvalid += 1
        continue
      }
      const result = insert.run(mapped)
      imported += Number(result.changes || 0)
      if (minTs == null || mapped.client_ts < minTs) minTs = mapped.client_ts
      if (maxTs == null || mapped.client_ts > maxTs) maxTs = mapped.client_ts
    }
    upsertEventsMeta(db, {
      source: 'hologres:growth_events',
      imported_at: new Date().toISOString(),
      history_complete: false,
      events_complete_through: maxTs != null ? new Date(maxTs).toISOString() : null,
      min_client_ts: minTs,
      max_client_ts: maxTs,
      fetched_rows: res.rows.length,
      imported_rows: imported,
      skipped_invalid: skippedInvalid,
      since: opts.since,
      limit: opts.limit,
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  const localCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n
  console.log(`[import] done: imported=${imported}, skipped_invalid=${skippedInvalid}, local_events=${localCount}`)
  if (minTs != null) {
    console.log(`[import] client_ts range: ${new Date(minTs).toISOString()} .. ${new Date(maxTs).toISOString()}`)
  }
  return { imported, skippedInvalid, localCount }
}

function rebuildRollups() {
  console.log('[rebuild] running npm run rebuild:rollups ...')
  const result = spawnSync('npm', ['run', 'rebuild:rollups'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DB_PATH },
  })
  if (result.status !== 0) {
    throw new Error(`rebuild:rollups failed with status ${result.status}`)
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(`Usage:
  node src/db/importGrowthEvents.js              # probe/sample
  node src/db/importGrowthEvents.js --import     # full import
  node src/db/importGrowthEvents.js --import --limit=5000
  node src/db/importGrowthEvents.js --import --since=2026-09-01 --rebuild`)
    return
  }

  console.log(`[pg] connecting ${process.env.DATABASE_URL ? '(DATABASE_URL)' : `${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`} as ${process.env.PGUSER || '(url-user)'} ...`)
  const client = await connectPg()
  try {
    const ver = await client.query('SELECT version() AS v')
    console.log(`[pg] server: ${String(ver.rows[0].v).slice(0, 120)}`)

    if (opts.probe || !opts.doImport) {
      await probe(client, opts)
    }
    if (opts.doImport) {
      await importAll(client, opts)
      if (opts.rebuild) rebuildRollups()
      else console.log('[next] run: npm run rebuild:rollups')
    } else {
      console.log('[next] looks good? import with: node src/db/importGrowthEvents.js --import --rebuild')
      console.log('[next] or sample import: node src/db/importGrowthEvents.js --import --limit=5000 --rebuild')
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[importGrowthEvents] failed:', err.message)
  process.exitCode = 1
})
