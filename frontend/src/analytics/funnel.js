export const ASSOCIATIONS={user:'用户顺序',token_visit:'同一次 Token 访问',strategy_run:'同一次策略运行'}
const ID_FIELDS={token_visit:'token_visit_id',strategy_run:'strategy_run_id'}
const validId=v=>typeof v==='string'&&v.trim().length>0
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
  association = 'user',
}) {
  if(!Object.hasOwn(ASSOCIATIONS,association))throw new TypeError('Unknown funnel association')
  const field=ID_FIELDS[association],quality={missingStartUserIds:[],incompleteUserIds:[]};
  const matchesStrategy = (e) =>
    e.type !== 'ai' || strategyFilter === 'all' || e.strategy === strategyFilter

  const rows = []

  for (const u of users) {
    if (sourceFilter !== 'all' && u.source !== sourceFilter) continue

    // Find first qualifying step-0 event in range
    const events=u.events.filter(e=>Number.isFinite(e.t)).slice().sort((a,b)=>a.t-b.t)
    const step0 = events.find(
      e => e.type === steps[0] && matchesStrategy(e) && e.t >= startAt && e.t < endAt && e.t <= (asOf ?? Infinity)
    )
    if (!step0) continue
    // The earliest start cannot be replaced by a later better-instrumented visit.
    if(field&&!validId(step0[field])){quality.missingStartUserIds.push(u.id);continue}
    const matchesAssociation=e=>!field||(validId(e[field])&&e[field]===step0[field]&&(association!=='token_visit'||(!step0.token_address||!e.token_address||step0.token_address===e.token_address)&&(!step0.chain||!e.chain||step0.chain===e.chain)))
    let dataIncomplete=false

    const times = [step0.t]
    let lastT = step0.t
    const windowEnd = step0.t + conversionWindowMs

    for (let i = 1; i < steps.length; i++) {
      const candidates=events.filter(e=>e.type===steps[i]&&matchesStrategy(e)&&e.t>lastT&&e.t<=windowEnd&&e.t<=(asOf??Infinity))
      const next=candidates.find(matchesAssociation)
      if (!next) {
        // An observed candidate without an ID cannot be classified as dropout.
        dataIncomplete=!!field&&candidates.some(e=>!validId(e[field]))
        break
      }
      times.push(next.t)
      lastT = next.t
    }

    if(dataIncomplete)quality.incompleteUserIds.push(u.id)
    rows.push({
      userId: u.id,
      source: u.source,
      association_id:field?step0[field]:null,
      dataIncomplete,
      times,
      // pending: window hasn't closed yet AND user hasn't fully converted
      pending: times.length < steps.length && windowEnd > (asOf ?? Date.now()),
    })
  }

  // Compute per-step reach counts
  const stepCounts = steps.map((_, i) => rows.filter(r => r.times.length > i).length)

  // Confirmed drop-offs at each step (not pending)
  const dropOffs = steps.slice(1).map((_, i) =>
    rows.filter(r => r.times.length === i + 1 && !r.pending && !r.dataIncomplete).length
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
