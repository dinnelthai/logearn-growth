/**
 * retention.js
 * Computes cohort retention: daily (D0–D7) and weekly (W0–W8).
 *
 * D0 = date of user's first qualifying "initial" event (default: chip).
 * Dn = user triggers at least one "returning" event exactly n calendar days
 *      after D0 (based on Asia/Bangkok date boundaries).
 * Wn = user triggers at least one returning event within the nth 7-day window
 *      after D0 (days [n*7, (n+1)*7) relative to D0).
 *
 * Periods that have not yet arrived return null, not 0.
 */

import { toDateStr, dayNum } from './utils.js'
import { buildCohorts, retainedUsers, periodObserved, periodComplete, firstEvent } from './cohorts.js'

const DAY_MS = 86400000

/**
 * @param {object[]} users
 * @param {object}   opts
 * @param {number}   opts.startAt     - cohort window start ms
 * @param {number}   opts.endAt       - cohort window end ms
 * @param {number}   opts.asOf        - current time ms (for null vs 0 decision)
 * @param {string}   [opts.initialEvent]   - default 'chip'
 * @param {string}   [opts.returningEvent] - default 'chip'
 * @param {string}   [opts.sourceFilter]   - 'all' or specific source
 * @param {string}   [opts.timezone]       - default 'Asia/Bangkok'
 * @param {number}   [opts.maxDailyPeriods]  - default 7
 * @param {number}   [opts.maxWeeklyPeriods] - default 8
 * @returns {{ daily: RetentionCohort[], weekly: RetentionCohort[] }}
 */
export function computeRetention(users, {
  startAt,
  endAt,
  asOf,
  initialEvent = 'chip',
  returningEvent = 'chip',
  sourceFilter = 'all',
  timezone = 'Asia/Bangkok',
  maxDailyPeriods = 7,
  maxWeeklyPeriods = 8,
}) {
  // Build daily cohorts indexed by D0 date string
  const dailyCohortMap = new Map()
  const weeklyCohortMap = new Map()

  for (const u of users) {


    // Find first qualifying initial event in range
    const initEvt = firstEvent(u,initialEvent,asOf)
    if (!initEvt || initEvt.t < startAt || initEvt.t >= endAt || (sourceFilter !== 'all' && initEvt.entry_source !== sourceFilter)) continue

    const d0DateStr = toDateStr(initEvt.t, timezone)
    const d0Num = dayNum(initEvt.t, startAt)
    const d0MidnightTs = startAt + d0Num * DAY_MS

    // Collect all returning event dates (as day offsets from d0)
    const returningDays = new Set()
    const returningWeeks = new Set()
    for (const e of u.events) {
      if (e.type !== returningEvent || e.t > asOf) continue
      if (e.t <= initEvt.t) continue // must be strictly after D0 event
      const offset = dayNum(e.t, d0MidnightTs)
      if (offset > 0) returningDays.add(offset)
      const wk = Math.floor(offset / 7)
      if (wk > 0) returningWeeks.add(wk)
    }

    // Daily cohort
    if (!dailyCohortMap.has(d0DateStr)) {
      dailyCohortMap.set(d0DateStr, { cohort_date: d0DateStr, d0Ts: initEvt.t, users: [] })
    }
    dailyCohortMap.get(d0DateStr).users.push({ returningDays })

    // Weekly cohort (key = week of D0 relative to startAt)
    const d0Week = Math.floor(d0Num / 7)
    const wkKey = toDateStr(startAt + d0Week * 7 * DAY_MS, timezone)
    if (!weeklyCohortMap.has(wkKey)) {
      weeklyCohortMap.set(wkKey, { cohort_date: wkKey, d0Ts: startAt + d0Week * 7 * DAY_MS, users: [] })
    }
    weeklyCohortMap.get(wkKey).users.push({ returningWeeks })
  }

  const buildWeeklyCohort = ({ cohort_date, d0Ts, users }) => {
    const n = users.length
    const periods = []
    for (let p = 1; p <= maxWeeklyPeriods; p++) {
      const windowEndTs = d0Ts + (p + 1) * 7 * DAY_MS
      if (windowEndTs > asOf) {
        periods.push({ period: p, retained_users: null, retention_rate: null })
      } else {
        const retained = users.filter(u => u.returningWeeks.has(p)).length
        periods.push({ period: p, retained_users: retained, retention_rate: n > 0 ? retained / n : 0 })
      }
    }
    return { cohort_date, cohort_size: n, periods }
  }

  const daily = buildCohorts(users,{startAt,endAt,asOf,initialEvent,returningEvent,sourceFilter})
    .filter(co=>co.users.length).map(co=>({
      cohort_date:toDateStr(co.start,timezone),cohort_size:co.users.length,
      periods:Array.from({length:maxDailyPeriods},(_,i)=>{
        const p=i+1,observed=periodObserved(co,p),complete=periodComplete(co,p)
        const n=observed?retainedUsers(co,p).length:null
        return {period:p,retained_users:n,retention_rate:n===null?null:n/co.users.length,complete}
      })
    }))

  const weekly = [...weeklyCohortMap.values()]
    .sort((a, b) => a.cohort_date.localeCompare(b.cohort_date))
    .map(buildWeeklyCohort)

  return { daily, weekly }
}
