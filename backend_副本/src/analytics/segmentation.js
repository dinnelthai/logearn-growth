/** Port of frontend classifyUser / computeSegmentation using either events or user_features. */
const DAY_MS = 86400000
const TZ_OFFSET = 7 * 3600000
const SEGMENTS = ['回流', '已流失', '流失风险', '高频核心', '策略型', '新激活', '分析型', '未激活']

function toDateStr(ts) {
  return new Date(Number(ts) + TZ_OFFSET).toISOString().slice(0, 10)
}

function firstChipTs(user, asOf) {
  const fromEvents = user.events
    ?.filter(e => e.type === 'chip' && e.t <= asOf)
    .reduce((a, e) => (!a || e.t < a ? e.t : a), null)
  const fact = typeof user.first_analysis_at === 'number'
    ? user.first_analysis_at
    : Date.parse(user.first_analysis_at)
  const candidates = [fromEvents, Number.isFinite(fact) && fact <= asOf ? fact : null].filter(v => v != null)
  return candidates.length ? Math.min(...candidates) : null
}

function classifyUser(user, asOf) {
  const chips = (user.events || [])
    .filter(e => e.type === 'chip' && e.t <= asOf)
    .sort((a, b) => a.t - b.t)
  if (!chips.length && !firstChipTs(user, asOf)) return '未激活'
  if (!chips.length) {
    // Only historical first_chip_at — treat as inactive unless within windows via fact
    const first = firstChipTs(user, asOf)
    if (first == null) return '未激活'
    if (asOf - first <= 7 * DAY_MS) return '新激活'
    if (first < asOf - 28 * DAY_MS) return '已流失'
    if (first < asOf - 7 * DAY_MS) return '流失风险'
    return '分析型'
  }
  const recent28 = asOf - 28 * DAY_MS
  const last = chips.at(-1).t
  const returned = chips.some((e, i) => i > 0 && e.t >= recent28 && e.t - chips[i - 1].t >= 28 * DAY_MS)
  if (returned) return '回流'
  if (last < recent28) return '已流失'
  if (last < asOf - 7 * DAY_MS) return '流失风险'
  const days = new Set(chips.filter(e => e.t >= recent28).map(e => toDateStr(e.t)))
  if (days.size >= 6) return '高频核心'
  const strategies = new Set(
    (user.events || [])
      .filter(e => e.type === 'ai' && e.t <= asOf && e.strategy)
      .map(e => e.strategy)
  )
  if (strategies.size >= 2) return '策略型'
  const first = firstChipTs(user, asOf)
  if (first != null && asOf - first <= 7 * DAY_MS) return '新激活'
  return '分析型'
}

/** Classify from precomputed user_features row (preferred at scale). */
function classifyFromFeatures(f, asOf) {
  if (!f || f.first_chip_at == null) return '未激活'
  const recent28 = asOf - 28 * DAY_MS
  if (f.returned_28) return '回流'
  if (f.last_chip_at < recent28) return '已流失'
  if (f.last_chip_at < asOf - 7 * DAY_MS) return '流失风险'
  if ((f.chip_days_28 || 0) >= 6) return '高频核心'
  if ((f.ai_strategies_28 || 0) >= 2) return '策略型'
  if (asOf - f.first_chip_at <= 7 * DAY_MS) return '新激活'
  return '分析型'
}

function computeSegmentationFromFeatures(featureRows, { asOf, inviterIds = [], referredIds = [] }) {
  const inviterSet = new Set(inviterIds)
  const referredSet = new Set(referredIds)
  const segmentCounts = Object.fromEntries(SEGMENTS.map(k => [k, 0]))
  const segmentUsers = Object.fromEntries(SEGMENTS.map(k => [k, []]))

  let telegram_bound = 0
  let email_bound = 0
  let telegram_unknown = 0
  let email_unknown = 0
  let used_strategy = 0
  let multi_strategy_user = 0

  for (const f of featureRows) {
    const segment = classifyFromFeatures(f, asOf)
    segmentCounts[segment]++
    segmentUsers[segment].push(f.user_key || `user:${f.user_id}`)
    if (f.telegram_bound === 1) telegram_bound++
    else if (f.telegram_bound == null) telegram_unknown++
    if (f.email_bound === 1) email_bound++
    else if (f.email_bound == null) email_unknown++
    if (f.used_strategy) used_strategy++
    if ((f.ai_strategies_all || 0) >= 2 || (f.ai_strategies_28 || 0) >= 2) multi_strategy_user++
  }

  const total = featureRows.length
  return {
    segments: Object.entries(segmentCounts).map(([segment, count]) => ({
      segment,
      users: count,
      percentage: total > 0 ? count / total : 0,
    })),
    tags: {
      telegram_bound,
      email_bound,
      telegram_binding_unknown: telegram_unknown,
      email_binding_unknown: email_unknown,
      used_strategy,
      multi_strategy_user,
      referred_user: referredSet.size,
      inviter: inviterSet.size,
    },
    segmentUsers,
    total,
  }
}

module.exports = {
  SEGMENTS,
  classifyUser,
  classifyFromFeatures,
  computeSegmentationFromFeatures,
}
