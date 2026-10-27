/** Port of frontend/src/analytics/funnel.js (CommonJS). Keep口径 aligned. */
const ASSOCIATIONS = { user: '用户顺序', token_visit: '同一次 Token 访问', strategy_run: '同一次策略运行' }
const ID_FIELDS = { token_visit: 'token_visit_id', strategy_run: 'strategy_run_id' }
const validId = v => typeof v === 'string' && v.trim().length > 0

function computeFunnel(users, {
  steps,
  startAt,
  endAt,
  conversionWindowMs = 24 * 3600000,
  sourceFilter = 'all',
  strategyFilter = 'all',
  asOf,
  association = 'user',
}) {
  if (!Object.hasOwn(ASSOCIATIONS, association)) throw new TypeError('Unknown funnel association')
  const field = ID_FIELDS[association]
  const quality = { missingStartUserIds: [], incompleteUserIds: [] }
  const matchesStrategy = (e) =>
    e.type !== 'ai' || strategyFilter === 'all' || e.strategy === strategyFilter

  const rows = []
  for (const u of users) {
    if (sourceFilter !== 'all' && u.source !== sourceFilter) continue
    const events = u.events.filter(e => Number.isFinite(e.t)).slice().sort((a, b) => a.t - b.t)
    const step0 = events.find(
      e => e.type === steps[0] && matchesStrategy(e) && e.t >= startAt && e.t < endAt && e.t <= (asOf ?? Infinity)
    )
    if (!step0) continue
    if (field && !validId(step0[field])) { quality.missingStartUserIds.push(u.id); continue }
    const matchesAssociation = e => !field || (
      validId(e[field]) && e[field] === step0[field]
      && (association !== 'token_visit' || (
        (!step0.token_address || !e.token_address || step0.token_address === e.token_address)
        && (!step0.chain || !e.chain || step0.chain === e.chain)
      ))
    )
    let dataIncomplete = false
    const times = [step0.t]
    let lastT = step0.t
    const windowEnd = step0.t + conversionWindowMs
    for (let i = 1; i < steps.length; i++) {
      const candidates = events.filter(e =>
        e.type === steps[i] && matchesStrategy(e) && (['daily_visit','logged_in_visit','login_verified'].includes(steps[i - 1]) ? e.t >= lastT : e.t > lastT) && e.t <= windowEnd && e.t <= (asOf ?? Infinity)
      )
      const next = candidates.find(matchesAssociation)
      if (!next) {
        dataIncomplete = !!field && candidates.some(e => !validId(e[field]))
        break
      }
      times.push(next.t)
      lastT = next.t
    }
    if (dataIncomplete) quality.incompleteUserIds.push(u.id)
    rows.push({
      userId: u.id,
      source: u.source,
      association_id: field ? step0[field] : null,
      dataIncomplete,
      times,
      pending: times.length < steps.length && windowEnd > (asOf ?? Date.now()),
    })
  }

  const stepCounts = steps.map((_, i) => rows.filter(r => r.times.length > i).length)
  const dropOffs = steps.slice(1).map((_, i) =>
    rows.filter(r => r.times.length === i + 1 && !r.pending && !r.dataIncomplete).length
  )
  const funnelSteps = steps.map((key, i) => ({
    key,
    users: stepCounts[i],
    previous_conversion_rate: i === 0 ? 1 : stepCounts[i - 1] > 0 ? stepCounts[i] / stepCounts[i - 1] : 0,
    total_conversion_rate: stepCounts[0] > 0 ? stepCounts[i] / stepCounts[0] : 0,
    drop_off_users: i < steps.length - 1 ? dropOffs[i] : 0,
  }))
  const complete = rows.filter(r => r.times.length === steps.length)
  const conversionTimes = complete.map(r => r.times[r.times.length - 1] - r.times[0])

  return {
    association,
    quality,
    steps: funnelSteps,
    rows,
    total_entered: rows.length,
    total_converted: complete.length,
    pending_count: rows.filter(r => r.pending).length,
    median_conversion_ms: medianMs(conversionTimes),
  }
}

function medianMs(arr) {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const n = sorted.length
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

module.exports = { computeFunnel, ASSOCIATIONS }
