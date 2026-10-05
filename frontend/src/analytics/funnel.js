/**
 * funnel.js
 * Computes sequential funnel conversion within a time window.
 *
 * Rules:
 * - Events must occur in order: steps[0] → steps[1] → ... → steps[N]
 * - Each subsequent event must have t > previous event t
 * - All events must fall within conversionWindowMs of the first step
 * - A user only enters the funnel from their first qualifying step-0 event
 *   in the date range; they do not re-enter on subsequent step-0 events
 */

/**
 * @param {object[]} users
 * @param {object}   opts
 * @param {string[]} opts.steps          - event types in order, e.g. ['login','ai','chip']
 * @param {number}   opts.startAt        - range start ms (inclusive)
 * @param {number}   opts.endAt          - range end ms (exclusive)
 * @param {number}   opts.conversionWindowMs  - default 24h
 * @param {string}   [opts.sourceFilter] - 'all' or specific source string
 * @param {string}   [opts.strategyFilter] - 'all' or specific strategy
 * @param {number}   opts.asOf           - current timestamp (for pending detection)
 * @returns {FunnelResult}
 */
export function computeFunnel(users, {
  steps,
  startAt,
  endAt,
  conversionWindowMs = 24 * 3600000,
  sourceFilter = 'all',
  strategyFilter = 'all',
  asOf,
}) {
  const matchesStrategy = (e) =>
    e.type !== 'ai' || strategyFilter === 'all' || e.strategy === strategyFilter

  const rows = []

  for (const u of users) {
    if (sourceFilter !== 'all' && u.source !== sourceFilter) continue

    // Find first qualifying step-0 event in range
    const step0 = u.events.find(
      e => e.type === steps[0] && matchesStrategy(e) && e.t >= startAt && e.t < endAt
    )
    if (!step0) continue

    const times = [step0.t]
    let lastT = step0.t
    const windowEnd = step0.t + conversionWindowMs

    for (let i = 1; i < steps.length; i++) {
      const next = u.events.find(
        e => e.type === steps[i] && matchesStrategy(e) && e.t > lastT && e.t <= windowEnd
      )
      if (!next) break
      times.push(next.t)
      lastT = next.t
    }

    rows.push({
      userId: u.id,
      source: u.source,
      times,
      // pending: window hasn't closed yet AND user hasn't fully converted
      pending: times.length < steps.length && windowEnd > (asOf ?? Date.now()),
    })
  }

  // Compute per-step reach counts
  const stepCounts = steps.map((_, i) => rows.filter(r => r.times.length > i).length)

  // Confirmed drop-offs at each step (not pending)
  const dropOffs = steps.slice(1).map((_, i) =>
    rows.filter(r => r.times.length === i + 1 && !r.pending).length
  )

  // Build FunnelStep result array
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
