/** Read-only database-side audit. Never sends collector events or writes facts. */
const path = require('node:path')
const { requestDiagnostics } = require('../backend/src/analytics/requestDiagnostics')
const { contract, contractIssues } = require('../backend/src/analytics/trackingAudit')
const DAY = 86400000
const EXTRA_EVENTS = ['login_stage_started','login_stage_finished','invite_validation_finished','invite_binding_finished','free_trial_started']

async function auditTracking(remote, { days = 7 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 31) throw Error('days must be an integer from 1 to 31')
  const s = await remote.status(), asOf = Date.parse(s.as_of), cutoff = Date.parse(s.snapshot_cutoff)
  if (!Number.isFinite(asOf) || !Number.isFinite(cutoff)) throw Error('Invalid snapshot timestamps')
  const end = asOf + 1, start = Math.max(0, end - days * DAY)
  const events = Object.keys(contract.events)
  // Include earlier starts for people observed in the window, just like the report loader.
  const rows = await remote.query(`${remote.eventsCte()}, candidates AS (
    SELECT DISTINCT user_key FROM e WHERE client_ts >= $2 AND client_ts < $3 AND event_name=ANY($4::text[])
  ) SELECT user_key,event_id,event_name,client_ts,properties FROM e
    WHERE user_key IN (SELECT user_key FROM candidates) AND client_ts <= $5 AND event_name=ANY($4::text[])
    ORDER BY user_key,client_ts,event_id LIMIT 5001`, [s.snapshot_cutoff,start,end,events,asOf])
  if (rows.length > 5000 || Buffer.byteLength(JSON.stringify(rows)) > 8 * 1024 * 1024)
    throw Error('Diagnostic context exceeds audit budget; reduce --days or use the scoped dashboard audit')
  const users = new Map(), issues = {}, inWindow = rows.filter(r => Number(r.client_ts) >= start && Number(r.client_ts) < end)
  for (const row of rows) {
    if (!users.has(row.user_key)) users.set(row.user_key, { id: row.user_key, source: 'audit', events: [] })
    users.get(row.user_key).events.push({ raw_name: row.event_name, t: Number(row.client_ts), properties: row.properties || {} })
  }
  let invalid = 0
  for (const row of inWindow) {
    // Use the exact whitelist used by the dashboard; unrelated numeric properties are not contract violations.
    const properties = Object.fromEntries(contract.properties.filter(k => Object.hasOwn(row.properties || {}, k)).map(k => [k,row.properties[k]]))
    const checked = contractIssues({ ...row, properties })
    if (checked.issues.length) invalid++
    for (const issue of checked.issues) issues[issue] = (issues[issue] || 0) + 1
  }
  const diagnostics = requestDiagnostics([...users.values()], { start, end, asOf }).payload.families
  const inventory = await remote.query(`${remote.eventsCte()} SELECT event_name,COUNT(*) AS events FROM e
    WHERE event_name=ANY($2::text[]) GROUP BY event_name ORDER BY event_name`, [s.snapshot_cutoff,[...events,...EXTRA_EVENTS]])
  const observed = new Map(inventory.map(r => [r.event_name,Number(r.events)]))
  const { trackingAuditFacts } = require('../backend/src/data/trackingAudit')
  const { summary } = await trackingAuditFacts(s, { start: cutoff-days*DAY, end: cutoff+1 })
  return {
    generated_at: new Date().toISOString(), snapshot_id: s.snapshot_id, as_of: s.as_of, snapshot_cutoff: s.snapshot_cutoff,
    behavior_window: { start, end, days }, arrival_window: { start: cutoff-days*DAY, end: cutoff+1 },
    arrivals: summary, schema: { checked_events: inWindow.length, invalid_events: invalid, issues },
    families: Object.fromEntries(Object.entries(diagnostics).map(([name,f]) => [name,{
      available:f.available, requests:f.requests, users:f.users, counts:f.counts, quality:f.quality,
      terminal_coverage:f.terminal_coverage, latency:f.latency,
    }])),
    missing_fact_events: [...events,...EXTRA_EVENTS].filter(name => !observed.has(name)),
    continuous_coverage_confirmed: false, end_to_end_verified: false,
    definition: 'Database-side aggregate evidence only. Families use starts in the behavior window and earlier context; arrivals use server timestamps. No user IDs, event IDs, raw properties or browser/collector proof are exported.',
  }
}

if (require.main === module) {
  ;(async () => {
    let remote
    try {
      const args = process.argv.slice(2)
      if (args.length && (args.length !== 2 || args[0] !== '--days')) throw Error('Usage: npm run audit:tracking -- --days 7')
      const days = args.length ? Number(args[1]) : 7
      if (!Number.isInteger(days) || days < 1 || days > 31) throw Error('days must be an integer from 1 to 31')
      const backendRequire = require('node:module').createRequire(path.join(__dirname,'../backend/package.json'))
      backendRequire('dotenv').config({ path: path.join(__dirname,'../backend/.env'), quiet: true })
      remote = require('../backend/src/data/hologres')
      process.stdout.write(JSON.stringify(await auditTracking(remote,{days}),null,2)+'\n')
    } catch (error) { console.error('Tracking audit failed:',error.message); process.exitCode = 1 }
    finally { if (remote) await remote.close() }
  })()
}
module.exports = { auditTracking }
