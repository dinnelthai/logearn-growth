import {firstEvent} from './cohorts.js'
import { bindingGroups } from './bindings.js'
/**
 * segmentation.js
 * Computes mutually exclusive user segments based on chip event behavior.
 *
 * Priority order (highest wins):
 *   回流 → 已流失 → 流失风险 → 高频核心 → 策略型 → 新激活 → 分析型 → 未激活
 *
 * Non-exclusive tags: used_strategy, multi_strategy_user, referred_user, inviter
 */

import { toDateStr } from './utils.js'

const DAY_MS = 86400000
const DEFAULT_TIMEZONE = 'Asia/Bangkok'

/** Shared classification using only events observed by asOf. */
export function classifyUser(user, asOf) {
  const chips = user.events.filter(e => e.type === 'chip' && e.t <= asOf).sort((a,b) => a.t-b.t)
  if (!chips.length) return '未激活'
  const recent28 = asOf - 28 * DAY_MS
  const last = chips.at(-1).t
  const returned = chips.some((e,i) => i > 0 && e.t >= recent28 && e.t - chips[i-1].t >= 28 * DAY_MS)
  if (returned) return '回流'
  if (last < recent28) return '已流失'
  if (last < asOf - 7 * DAY_MS) return '流失风险'
  const days = new Set(chips.filter(e => e.t >= recent28).map(e => toDateStr(e.t)))
  if (days.size >= 6) return '高频核心'
  const strategies = new Set(user.events.filter(e => e.type === 'ai' && e.t <= asOf && e.t <= asOf && e.strategy).map(e => e.strategy))
  if (strategies.size >= 2) return '策略型'
  if (asOf - firstEvent(user,'chip',asOf).t <= 7 * DAY_MS) return '新激活'
  return '分析型'
}

/**
 * @param {object[]} users
 * @param {object}   opts
 * @param {number}   opts.asOf        - current timestamp ms
 * @param {string[]} [opts.inviterIds]   - user ids who have successfully invited someone
 * @param {string[]} [opts.referredIds]  - user ids who were invited
 * @returns {SegmentationResult}
 */
export function computeSegmentation(users, { asOf, inviterIds = [], referredIds = [] }) {
  const inviterSet = new Set(inviterIds)
  const referredSet = new Set(referredIds)

  const segmentCounts = Object.fromEntries(['回流','已流失','流失风险','高频核心','策略型','新激活','分析型','未激活'].map(k=>[k,0]))
  const segmentUsers = Object.fromEntries(Object.keys(segmentCounts).map(k=>[k,[]]))
  for (const user of users) {
    const segment=classifyUser(user,asOf)
    segmentCounts[segment]++
    segmentUsers[segment].push(user.id)
  }

  const total = users.length

  const segments = Object.entries(segmentCounts).map(([segment, count]) => ({
    segment,
    users: count,
    percentage: total > 0 ? count / total : 0,
  }))

  // Non-exclusive tags
  const bindings = bindingGroups(users)
  const tags = {
    telegram_bound: bindings.telegram_bound.users.length,
    email_bound: bindings.email_bound.users.length,
    telegram_binding_unknown: bindings.telegram_bound.unknown,
    email_binding_unknown: bindings.email_bound.unknown,
    used_strategy: users.filter(u => u.events.some(e => e.type === 'ai' && e.t <= asOf)).length,
    multi_strategy_user: users.filter(u => {
      const strategies = new Set(u.events.filter(e => e.type === 'ai' && e.t <= asOf && e.strategy).map(e => e.strategy))
      return strategies.size >= 2
    }).length,
    referred_user: referredSet.size,
    inviter: inviterSet.size,
  }

  return { segments, tags, segmentUsers }
}
