/**
 * segmentation.js
 * Computes mutually exclusive user segments based on chip event behavior.
 *
 * Priority order (highest wins):
 *   回流 → 流失 → 流失风险 → 核心 → 成长 → 新激活 → 未激活
 *
 * Non-exclusive tags: used_strategy, multi_strategy_user, referred_user, inviter
 */

const DAY_MS = 86400000

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

  const segmentCounts = {
    回流: 0,
    流失: 0,
    流失风险: 0,
    核心: 0,
    成长: 0,
    新激活: 0,
    未激活: 0,
  }
  const segmentUsers = Object.fromEntries(Object.keys(segmentCounts).map(k => [k, []]))

  for (const u of users) {
    const chips = u.events.filter(e => e.type === 'chip').sort((a, b) => a.t - b.t)
    const hasEverAnalyzed = chips.length > 0

    let segment

    if (!hasEverAnalyzed) {
      segment = '未激活'
    } else {
      const firstChipTs = chips[0].t
      const lastChipTs = chips[chips.length - 1].t

      // Unique active days with chip events in last 28 days
      const window28Start = asOf - 28 * DAY_MS
      const window7Start = asOf - 7 * DAY_MS

      const activeDaysSet28 = new Set(
        chips
          .filter(e => e.t >= window28Start)
          .map(e => Math.floor(e.t / DAY_MS))
      )
      const activeDays28 = activeDaysSet28.size

      // Has analyzed in last 28 days
      const analyzedInLast28 = chips.some(e => e.t >= window28Start)
      // Has analyzed in last 7 days
      const analyzedInLast7 = chips.some(e => e.t >= window7Start)
      // Had a 28+ day gap ending in last 28 days (churned then came back)
      const gapBeforeLast28 = !chips.some(e => e.t >= asOf - 56 * DAY_MS && e.t < window28Start)
      const isReturning = hasEverAnalyzed && analyzedInLast28 && gapBeforeLast28 && asOf - firstChipTs >= 28 * DAY_MS

      if (isReturning) {
        segment = '回流'
      } else if (hasEverAnalyzed && !analyzedInLast28) {
        segment = '流失'
      } else if (hasEverAnalyzed && analyzedInLast28 && !analyzedInLast7) {
        segment = '流失风险'
      } else if (activeDays28 >= 6) {
        segment = '核心'
      } else if (activeDays28 >= 2) {
        segment = '成长'
      } else if (asOf - firstChipTs <= 7 * DAY_MS) {
        segment = '新激活'
      } else {
        // Analyzed before, low recent activity but within windows — treat as 成长 floor
        segment = '成长'
      }
    }

    segmentCounts[segment]++
    segmentUsers[segment].push(u.id)
  }

  const total = users.length

  const segments = Object.entries(segmentCounts).map(([segment, count]) => ({
    segment,
    users: count,
    percentage: total > 0 ? count / total : 0,
  }))

  // Non-exclusive tags
  const tags = {
    used_strategy: users.filter(u => u.events.some(e => e.type === 'ai')).length,
    multi_strategy_user: users.filter(u => {
      const strategies = new Set(u.events.filter(e => e.type === 'ai' && e.strategy).map(e => e.strategy))
      return strategies.size >= 2
    }).length,
    referred_user: referredSet.size,
    inviter: inviterSet.size,
  }

  return { segments, tags, segmentUsers }
}
