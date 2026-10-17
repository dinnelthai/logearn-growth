/** Port of frontend retention/cohorts helpers used by metrics. */
const DAY = 86400000
const TZ_OFFSET = 7 * 3600000

function toDateStr(ts) {
  return new Date(Number(ts) + TZ_OFFSET).toISOString().slice(0, 10)
}

function midnight(t) {
  return Math.floor((t + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET
}

function firstEvent(user, type, asOf = Infinity) {
  const observed = user.events
    .filter(e => e.type === type && Number.isFinite(e.t) && e.t <= asOf)
    .reduce((a, e) => (!a || e.t < a.t ? e : a), null)
  const t = typeof user.first_analysis_at === 'number'
    ? user.first_analysis_at
    : Date.parse(user.first_analysis_at)
  if (type === 'chip' && Number.isFinite(t) && t <= asOf && (!observed || t < observed.t)) {
    return { type, t, entry_source: user.source, entry_module: user.first_analysis_entry_module, historical_fact: true }
  }
  return observed
}

function buildCohorts(users, { startAt, endAt, asOf, initialEvent = 'chip', sourceFilter = 'all' }) {
  const firstDay=midnight(startAt)
  const n = Math.ceil((endAt - firstDay) / DAY)
  const cohorts = Array.from({ length: n }, (_, i) => ({ start: firstDay + i * DAY, users: [] }))
  for (const user of users) {
    const first = firstEvent(user, initialEvent, asOf)
    if (!first || first.t < startAt || first.t >= endAt) continue
    if (sourceFilter !== 'all' && first.entry_source !== sourceFilter && user.source !== sourceFilter) continue
    const index = Math.floor((midnight(first.t) - firstDay) / DAY)
    if (cohorts[index]) cohorts[index].users.push(user)
  }
  return cohorts
}

function retainedUsers(cohort, period, continuous = false, returningEvent = 'chip') {
  const onDay = (user, p) => user.events.some(e =>
    e.type === returningEvent
    && e.t <= cohort.asOf
    && e.t >= cohort.start + p * DAY
    && e.t < cohort.start + (p + 1) * DAY
  )
  return cohort.users.filter(user =>
    continuous
      ? Array.from({ length: period }, (_, i) => i + 1).every(p => onDay(user, p))
      : onDay(user, period)
  )
}

function computeRetentionMatrix(users, {
  startAt,
  endAt,
  asOf,
  initialEvent = 'chip',
  returningEvent = 'chip',
  sourceFilter = 'all',
  maxDailyPeriods = 7,
}) {
  const cohorts = buildCohorts(users, { startAt, endAt, asOf, initialEvent, sourceFilter })
    .map(co => ({ ...co, returningEvent, asOf }))
    .filter(co => co.users.length)

  const daily = cohorts.map(co => {
    const periods = []
    for (let p = 1; p <= maxDailyPeriods; p++) {
      const observed = co.start + p * DAY <= asOf
      const complete = co.start + (p + 1) * DAY <= asOf
      if (!observed) {
        periods.push({ period: p, retained_users: null, retention_rate: null, complete: false })
      } else {
        const n = retainedUsers(co, p, false, returningEvent).length
        periods.push({
          period: p,
          retained_users: n,
          retention_rate: co.users.length ? n / co.users.length : 0,
          complete,
        })
      }
    }
    return {
      cohort_date: toDateStr(co.start),
      cohort_start: co.start,
      cohort_size: co.users.length,
      user_ids: co.users.map(u => u.id),
      periods,
    }
  })

  return { daily }
}

module.exports = {
  computeRetentionMatrix,
  buildCohorts,
  retainedUsers,
  firstEvent,
  toDateStr,
  midnight,
  DAY,
}
