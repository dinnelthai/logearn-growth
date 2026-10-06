/**
 * northStar.js
 * Computes daily active analysis users (DAA) — the north star metric.
 *
 * Definition: on a given day, the count of distinct users who triggered
 * at least one chip_analysis_viewed (type='chip') event.
 * - One user triggering chip multiple times in a day counts once.
 * - New vs returning is determined by whether the user's earliest-ever
 *   chip event is on that day (new) or before it (returning).
 */

import { toDateStr, dayNum } from './utils.js'

/**
 * @param {object[]} users   - normalized user array
 * @param {number}   startAt - range start ms (inclusive)
 * @param {number}   endAt   - range end ms (exclusive)
 * @param {string}   timezone
 * @returns {NorthStarResult[]}
 */
export function computeNorthStar(users, startAt, endAt, timezone = 'Asia/Bangkok') {
  const day = 86400000

  // Build per-day buckets: Map<dateStr, {activeUsers, newUsers, returningUsers, eventCount}>
  const buckets = new Map()
  const numDays = Math.ceil((endAt - startAt) / day)
  for (let i = 0; i < numDays; i++) {
    const dateStr = toDateStr(startAt + i * day, timezone)
    buckets.set(dateStr, { active: new Set(), allTimeFirst: new Map(), events: 0 })
  }

  // First pass: find each user's all-time first chip timestamp
  const firstChipTs = new Map()
  for (const u of users) {
    const first = u.events.find(e => e.type === 'chip')
    if (first) firstChipTs.set(u.id, first.t)
  }

  // Second pass: for events in range, populate buckets
  for (const u of users) {
    const chipEventsInRange = u.events.filter(
      e => e.type === 'chip' && e.t >= startAt && e.t < endAt
    )
    for (const e of chipEventsInRange) {
      const dateStr = toDateStr(e.t, timezone)
      const bucket = buckets.get(dateStr)
      if (!bucket) continue
      bucket.events++
      bucket.active.add(u.id)
      // Track whether this user's all-time first chip is on this date
      const userFirstTs = firstChipTs.get(u.id)
      if (userFirstTs !== undefined) {
        const isNewToday = toDateStr(userFirstTs, timezone) === dateStr
        bucket.allTimeFirst.set(u.id, isNewToday)
      }
    }
  }

  // Assemble results
  const results = []
  for (const [dateStr, bucket] of buckets) {
    let newCount = 0
    let returningCount = 0
    let loggedInCount = 0
    let anonymousCount = 0
    for (const uid of bucket.active) {
      uid.startsWith('user:') ? loggedInCount++ : anonymousCount++
    }
    for (const [uid, isNew] of bucket.allTimeFirst) {
      if (bucket.active.has(uid)) {
        isNew ? newCount++ : returningCount++
      }
    }
    results.push({
      date: dateStr,
      active_users: bucket.active.size,
      active_user_ids: [...bucket.active],
      new_user_ids: [...bucket.active].filter(id=>bucket.allTimeFirst.get(id)),
      returning_user_ids: [...bucket.active].filter(id=>!bucket.allTimeFirst.get(id)),
      analysis_events: bucket.events,
      new_active_users: newCount,
      returning_active_users: returningCount,
      logged_in_users: loggedInCount,
      anonymous_users: anonymousCount,
    })
  }

  return results
}
