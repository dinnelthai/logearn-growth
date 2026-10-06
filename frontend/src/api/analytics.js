/**
 * api/analytics.js
 * Fetches raw data from the real API endpoints.
 *
 * Endpoints expected:
 *   GET /api/analytics/logearn_events?start=MS&end=MS  → { logearn_events: RawGrowthEvent[] }
 *   GET /api/analytics/users                            → { users: RawUser[] }
 *   GET /api/analytics/logearn_user                     → { logearn_users: RawLogearnUser[] }
 *   GET /api/analytics/logearn_user_referral            → { logearn_user_referrals: RawUserReferral[] }
 *   GET /api/analytics/trades?start=ISO&end=ISO         → { trades: RawTrade[] }  (optional)
 *
 * Switch between mock and API via:
 *   VITE_ANALYTICS_DATA_SOURCE=api | mock
 *   VITE_ANALYTICS_API_BASE_URL=/api/analytics
 */

const BASE_URL = import.meta.env.VITE_ANALYTICS_API_BASE_URL ?? '/api/analytics'

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new ApiError(`API ${path} failed: ${res.statusText}`, res.status)
  return res.json()
}

export async function fetchLogearnEvents(startAt, endAt) {
  return apiFetch(`/logearn_events?start=${startAt}&end=${endAt}`)
}

export async function fetchUsers() {
  return apiFetch('/users')
}

export async function fetchLogearnUser() {
  return apiFetch('/logearn_user')
}

export async function fetchLogearnUserReferral() {
  return apiFetch('/logearn_user_referral')
}

export async function fetchTrades(startAt, endAt) {
  const start = new Date(startAt).toISOString()
  const end = new Date(endAt).toISOString()
  return apiFetch(`/trades?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
}

/**
 * Fetches all data needed for the analytics snapshot.
 * Returns null for optional endpoints if they fail.
 */
export async function fetchAllAnalyticsData(startAt, endAt) {
  const [eventsRes, usersRes, logearnUserRes, referralResult, tradesResult] = await Promise.all([
    fetchLogearnEvents(startAt, endAt),
    fetchUsers(),
    fetchLogearnUser().then(value=>({value}), error=>({error})),
    fetchLogearnUserReferral().then(value=>({value}), error=>({error})),
    fetchTrades(startAt, endAt).then(value=>({value}), error=>({error})),
  ])
  if (!Array.isArray(eventsRes.logearn_events) || !Array.isArray(usersRes.users)) throw new Error('用户或事件接口返回格式无效')

  // Flatten logearn_user_referral tree → flat referral relations for normalize/computeReferral
  const rawReferrals = referralResult.value?.logearn_user_referrals
  const referrals = Array.isArray(rawReferrals)
    ? rawReferrals.flatMap(r => (r.invitees_l1 ?? []).map(inv => ({
        inviter_user_id: r.user_id,
        invitee_user_id: inv.user_id,
        bound_at: inv.bound_at,
      })))
    : null

  return {
    events: eventsRes.logearn_events,
    users: usersRes.users,
    logearnUsers: logearnUserRes.value?.logearn_users ?? null,
    referrals,
    userReferrals: rawReferrals ?? null,
    trades: Array.isArray(tradesResult.value?.trades) ? tradesResult.value.trades : null,
    availability: {
      referrals: referralResult.error ? 'error' : Array.isArray(rawReferrals) ? 'available' : 'missing',
      trades: tradesResult.error ? 'error' : Array.isArray(tradesResult.value?.trades) ? 'available' : 'missing',
    },
  }
}
