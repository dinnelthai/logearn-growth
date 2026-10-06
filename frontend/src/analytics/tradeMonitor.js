/**
 * tradeMonitor.js
 * Computes trade success-rate metrics from logearn_events.
 * Source events: trade_submitted → type 'trade_submitted'
 *               trade_succeeded → type 'trade'
 *               trade_failed    → type 'trade_failed'
 */

const DAY = 86400000

/**
 * @param {object} params
 * @param {object[]} params.users       - normalised user array from dataStore
 * @param {number}   params.startAt     - ms timestamp, range start (inclusive)
 * @param {number}   params.endAt       - ms timestamp, range end (exclusive)
 * @param {number}   params.asOf        - ms timestamp, observation ceiling
 * @param {string}   [params.source]    - 'all' or a specific entry_source
 */
export function computeTradeMonitor({ users, startAt, endAt, asOf, source = 'all' }) {
  const inRange = e => e.t >= startAt && e.t < endAt && e.t <= asOf
  const matchSource = u => source === 'all' || u.source === source

  // Collect all raw trade events in range
  const submitted = [], succeeded = [], failed = []
  for (const u of users) {
    if (!matchSource(u)) continue
    for (const e of u.events) {
      if (!inRange(e)) continue
      if (e.type === 'trade_submitted') submitted.push({ ...e, userId: u.id })
      else if (e.type === 'trade')       succeeded.push({ ...e, userId: u.id })
      else if (e.type === 'trade_failed') failed.push({ ...e, userId: u.id })
    }
  }

  const totalSubmitted = submitted.length
  const totalSucceeded = succeeded.length
  const totalFailed    = failed.length
  const successRate    = totalSubmitted ? totalSucceeded / totalSubmitted : null
  const failureRate    = totalSubmitted ? totalFailed / totalSubmitted : null

  // Failure reason breakdown (from event properties.reason or properties.error)
  const reasonMap = new Map()
  for (const e of failed) {
    const reason = e.reason ?? '未知原因'
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
  }
  const failureReasons = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count, pct: totalFailed ? count / totalFailed : 0 }))
    .sort((a, b) => b.count - a.count)

  // Daily breakdown
  const dayCount = Math.ceil((endAt - startAt) / DAY)
  const days = Array.from({ length: dayCount }, (_, i) => {
    const t = startAt + i * DAY
    const dayEnd = t + DAY
    const s  = submitted.filter(e => e.t >= t && e.t < dayEnd).length
    const ok = succeeded.filter(e => e.t >= t && e.t < dayEnd).length
    const ko = failed.filter(e => e.t >= t && e.t < dayEnd).length
    return { t, submitted: s, succeeded: ok, failed: ko, rate: s ? ok / s : null }
  })

  // Unique users per bucket
  const uniqueSubmitters = new Set(submitted.map(e => e.userId)).size
  const uniqueTraders    = new Set(succeeded.map(e => e.userId)).size

  // Chain breakdown
  const chainIds = [...new Set([...submitted, ...succeeded, ...failed].map(e => e.chain ?? '未知'))]
  const byChain = chainIds.map(chain => {
    const s  = submitted.filter(e => (e.chain ?? '未知') === chain)
    const ok = succeeded.filter(e => (e.chain ?? '未知') === chain)
    const ko = failed.filter(e => (e.chain ?? '未知') === chain)
    return {
      chain,
      submitted: s.length,
      succeeded: ok.length,
      failed: ko.length,
      successRate: s.length ? ok.length / s.length : null,
    }
  }).sort((a, b) => b.submitted - a.submitted)

  return {
    totalSubmitted, totalSucceeded, totalFailed,
    successRate, failureRate,
    uniqueSubmitters, uniqueTraders,
    failureReasons,
    byChain,
    days,
  }
}
