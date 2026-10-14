/**
 * Server-side crowd comparison for aggregated mode.
 * Returns counts + user_id lists for drill — never embeds full user objects.
 */
const db = require('../db/connection')
const { classifyFromFeatures, SEGMENTS } = require('./segmentation')
const { computeFunnel } = require('./funnel')
const { loadNormalizedUsers } = require('./loadUsers')
const { PATH_TYPES } = require('./eventMap')

const DAY = 86400000
const DIMENSIONS = {
  language: '用户语言',
  source: '首次来源',
  telegram: 'Telegram绑定',
  email: '邮箱绑定',
  entry: '首次分析入口',
  segment: '主要分群',
}
const ENTRY_LABELS = {
  callouts: '喊单',
  signals: '信号榜单',
  popular: '热门',
  fomo: 'FOMO热门',
  unknown: '入口未知/其他',
}
const FUNNELS = {
  analysis: { label: '分析漏斗', steps: ['login', 'token', 'chip'] },
  ai: { label: 'AI漏斗', steps: ['token', 'ai', 'chip'] },
  token_visit: { label: '同次Token访问', steps: ['token_click', 'token', 'chip'], association: 'token_visit' },
  strategy_run: { label: '同次策略结果', steps: ['ai', 'strategy_result', 'signal_view'], association: 'strategy_run' },
}

function normalizeLanguage(v) {
  if (v == null || v === '') return null
  const s = String(v).toLowerCase()
  if (s === 'zh' || s === 'zh-cn' || s === 'cn' || s === 'chinese') return 'zh'
  if (s === 'en' || s === 'en-us' || s === 'english') return 'en'
  return null
}

function flag(v) {
  if (v === 1 || v === true) return 'bound'
  if (v === 0 || v === false) return 'unbound'
  return 'unknown'
}

function groupLabel(dimension, key) {
  if (dimension === 'language') return ({ zh: '中文用户', en: '英文用户', unknown: '语言未知/其他' })[key] ?? key
  if (dimension === 'telegram' || dimension === 'email') {
    return ({ bound: '已绑定', unbound: '未绑定', unknown: '状态未知' })[key] ?? key
  }
  if (dimension === 'entry') return ENTRY_LABELS[key] ?? key
  return key
}

function dimensionValue(feature, dimension, asOf) {
  if (dimension === 'language') return normalizeLanguage(feature.preferred_language) ?? 'unknown'
  if (dimension === 'source') return feature.first_source || '未知'
  if (dimension === 'telegram') return flag(feature.telegram_bound)
  if (dimension === 'email') return flag(feature.email_bound)
  if (dimension === 'entry') {
    // Prefer first_analysis_entry_module from logearn_users if present on feature row
    const mod = feature.first_analysis_entry_module
    if (mod && ENTRY_LABELS[mod] && mod !== 'unknown') return mod
    return 'unknown'
  }
  return classifyFromFeatures(feature, asOf)
}

function loadFeatureRows({ sourceFilter, audienceIds }) {
  let sql = `
    SELECT f.*, u.first_analysis_entry_module, u.created_at
    FROM user_features f
    LEFT JOIN logearn_users u ON u.user_id = f.user_id
    WHERE 1=1
  `
  const params = []
  if (sourceFilter && sourceFilter !== 'all') {
    sql += ' AND f.first_source = ?'
    params.push(sourceFilter)
  }
  if (audienceIds) {
    if (!audienceIds.length) return []
    sql += ` AND f.user_id IN (${audienceIds.map(() => '?').join(',')})`
    params.push(...audienceIds)
  }
  return db.prepare(sql).all(...params)
}

function inPool(feature, endAt, asOf) {
  const created = feature.created_at ? Date.parse(feature.created_at) : NaN
  if (Number.isFinite(created)) return created < endAt
  if (feature.first_chip_at != null) return feature.first_chip_at < endAt
  // Unknown history users stay in pool (same as frontend: first===Infinity kept)
  return true
}

function eventUserSet(eventNames, start, end, asOf) {
  const names = Array.isArray(eventNames) ? eventNames : [eventNames]
  const ph = names.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT DISTINCT user_id FROM events
    WHERE event_name IN (${ph})
      AND user_id IS NOT NULL
      AND client_ts >= ? AND client_ts < ? AND client_ts <= ?
  `).all(...names, start, end, asOf)
  return new Set(rows.map(r => r.user_id))
}

function tradeUserSet(start, end, asOf) {
  const rows = db.prepare(`
    SELECT DISTINCT user_id FROM trades
    WHERE status = 'confirmed' AND volume_usd > 0
      AND confirmed_at >= ? AND confirmed_at < ?
  `).all(new Date(start).toISOString(), new Date(Math.min(end, asOf + 1)).toISOString())
  // Filter asOf in JS for safety
  return new Set(
    db.prepare(`
      SELECT user_id, confirmed_at FROM trades
      WHERE status = 'confirmed' AND volume_usd > 0
    `).all()
      .filter(t => {
        const ts = Date.parse(t.confirmed_at)
        return Number.isFinite(ts) && ts >= start && ts < end && ts <= asOf && t.user_id
      })
      .map(t => t.user_id),
  )
}

function inviterSet(start, end, asOf) {
  return new Set(
    db.prepare(`
      SELECT inviter_user_id, invitee_user_id, bound_at FROM referral_invitees WHERE level = 1
    `).all()
      .filter(r => {
        const t = Date.parse(r.bound_at)
        return Number.isFinite(t) && t >= start && t < end && t <= asOf && r.inviter_user_id !== r.invitee_user_id
      })
      .map(r => r.inviter_user_id),
  )
}

/**
 * @returns {{ rows, pool_size, retentionAllowed, lists }}
 * lists keys: `${groupKey}:${metric}` -> user_id[] (with user: prefix)
 */
function computeComparisonOverview({
  startAt,
  endAt,
  asOf,
  dimension = 'language',
  filters = {},
  audience_ids = null,
  cohort_id = null,
  owner = null,
}) {
  if (!Object.hasOwn(DIMENSIONS, dimension)) throw new TypeError('Unknown dimension')

  const { resolveAudienceUserIds } = require('./loadUsers')
  const audienceIds = resolveAudienceUserIds({ audience_ids, cohort_id }, owner)
  let features = loadFeatureRows({ audienceIds })

  // Apply filters (except the grouping dimension itself still applies as filter if set)
  features = features.filter(f => {
    if (!inPool(f, endAt, asOf)) return false
    return Object.entries(filters).every(([dim, value]) => {
      if (!value || value === 'all') return true
      return dimensionValue(f, dim, asOf) === value
    })
  })

  const analyzedSet = eventUserSet('chip_analysis_viewed', startAt, endAt, asOf)
  const aiSet = eventUserSet('strategy_started', startAt, endAt, asOf)
  const tradersSet = tradeUserSet(startAt, endAt, asOf)
  const inviterset = inviterSet(startAt, endAt, asOf)

  const groups = new Map()
  for (const f of features) {
    const key = dimensionValue(f, dimension, asOf)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }

  const lists = {}
  const rows = [...groups.entries()].map(([key, people]) => {
    const ids = people.map(p => p.user_id)
    const analyzed = ids.filter(id => analyzedSet.has(id))
    const fresh = people
      .filter(p => p.first_chip_at != null && p.first_chip_at >= startAt && p.first_chip_at < endAt)
      .map(p => p.user_id)
    const ai = ids.filter(id => aiSet.has(id))
    const core = people
      .filter(p => classifyFromFeatures(p, asOf) === '高频核心')
      .map(p => p.user_id)
    const traders = ids.filter(id => tradersSet.has(id))
    const inviters = ids.filter(id => inviterset.has(id))

    const prefix = (metric, arr) => {
      lists[`${key}:${metric}`] = arr.map(id => `user:${id}`)
    }
    prefix('people', ids)
    prefix('analyzed', analyzed)
    prefix('fresh', fresh)
    prefix('ai', ai)
    prefix('core', core)
    prefix('traders', traders)
    prefix('inviters', inviters)

    return {
      key,
      label: groupLabel(dimension, key),
      people: ids.length,
      analyzed: analyzed.length,
      fresh: fresh.length,
      ai: ai.length,
      core: core.length,
      traders: traders.length,
      inviters: inviters.length,
    }
  }).sort((a, b) => b.people - a.people || String(a.key).localeCompare(String(b.key)))

  const retentionAllowed = ['language', 'source', 'entry'].includes(dimension)
    && !Object.keys(filters).some(k => ['segment', 'telegram', 'email'].includes(k) && filters[k] && filters[k] !== 'all')

  return {
    pool_size: features.length,
    rows,
    retentionAllowed,
    lists,
  }
}

/**
 * Funnel comparison: load events for pool users, run computeFunnel per group.
 */
function computeComparisonFunnels({
  startAt,
  endAt,
  asOf,
  dimension = 'language',
  filters = {},
  preset = 'analysis',
  hours = 24,
  association,
  audience_ids = null,
  cohort_id = null,
  owner = null,
}) {
  const funnelDef = FUNNELS[preset] || FUNNELS.analysis
  const steps = funnelDef.steps
  const assoc = association || funnelDef.association || 'user'
  const overview = computeComparisonOverview({
    startAt, endAt, asOf, dimension, filters, audience_ids, cohort_id, owner,
  })

  // Build audience = all pool user ids
  const allIds = overview.lists
    ? Object.entries(overview.lists)
      .filter(([k]) => k.endsWith(':people'))
      .flatMap(([, ids]) => ids)
    : []
  const uniqueIds = [...new Set(allIds)]

  const loaded = loadNormalizedUsers({
    types: [...new Set(steps)],
    start: startAt,
    end: endAt,
    asOf,
    audience_ids: uniqueIds,
    endExtraMs: Math.max(1, Number(hours) || 24) * 3600000,
  })
  const byId = new Map(loaded.users.map(u => [u.id, u]))

  const lists = { ...overview.lists }
  const groups = overview.rows.map(row => {
    const peopleIds = overview.lists[`${row.key}:people`] || []
    const users = peopleIds.map(id => byId.get(id)).filter(Boolean)
    // Attach source from features already encoded in user.source
    const result = computeFunnel(users, {
      steps,
      startAt,
      endAt,
      asOf,
      conversionWindowMs: Math.max(1, Number(hours) || 24) * 3600000,
      association: assoc,
    })
    const stages = steps.map((key, i) => {
      const reached = result.rows.filter(r => r.times.length > i).map(r => r.userId)
      const lost = i === steps.length - 1
        ? []
        : result.rows.filter(r => r.times.length === i + 1 && !r.pending && !r.dataIncomplete).map(r => r.userId)
      const pending = i === steps.length - 1
        ? []
        : result.rows.filter(r => r.times.length === i + 1 && r.pending).map(r => r.userId)
      lists[`${row.key}:funnel_reached_${i}`] = reached
      lists[`${row.key}:funnel_lost_${i}`] = lost
      lists[`${row.key}:funnel_pending_${i}`] = pending
      return {
        key,
        reached: reached.length,
        lost: lost.length,
        pending: pending.length,
      }
    })
    lists[`${row.key}:funnel_missing_start`] = result.quality.missingStartUserIds
    lists[`${row.key}:funnel_incomplete`] = result.quality.incompleteUserIds
    return {
      key: row.key,
      label: row.label,
      entered: result.total_entered,
      pending: result.pending_count,
      missing_start: result.quality.missingStartUserIds.length,
      incomplete: result.quality.incompleteUserIds.length,
      stages,
    }
  })

  return {
    preset,
    association: assoc,
    hours: Number(hours) || 24,
    steps,
    groups,
    pool_size: overview.pool_size,
    lists,
  }
}

module.exports = {
  DIMENSIONS,
  ENTRY_LABELS,
  FUNNELS,
  SEGMENTS,
  computeComparisonOverview,
  computeComparisonFunnels,
  groupLabel,
  dimensionValue,
}
