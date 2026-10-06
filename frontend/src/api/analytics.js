/**
 * api/analytics.js
 * Fetches raw data from the real API endpoints.
 *
 * Endpoints expected:
 *   GET /api/analytics/events?start=ISO&end=ISO   → { events: RawGrowthEvent[] }
 *   GET /api/analytics/users                       → { users: RawUser[] }
 *   GET /api/analytics/referrals                   → { referrals: RawReferralRelation[] }
 *   GET /api/analytics/trades?start=ISO&end=ISO    → { trades: RawTrade[] }  (optional)
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

export async function fetchEvents(startAt, endAt) {
  const start = new Date(startAt).toISOString()
  const end = new Date(endAt).toISOString()
  return apiFetch(`/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
}

export async function fetchUsers() {
  return apiFetch('/users')
}

export async function fetchReferrals() {
  return apiFetch('/referrals')
}

export async function fetchTrades(startAt, endAt) {
  const start = new Date(startAt).toISOString()
  const end = new Date(endAt).toISOString()
  return apiFetch(`/trades?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
}

/**
 * Fetches all data needed for the analytics snapshot.
 * Returns null for trades if the endpoint is not available.
 */
export async function fetchAllAnalyticsData(startAt, endAt) {
  const [eventsRes, usersRes, referralsResult, tradesResult] = await Promise.all([
    fetchEvents(startAt,endAt),fetchUsers(),
    fetchReferrals().then(value=>({value}),error=>({error})),
    fetchTrades(startAt,endAt).then(value=>({value}),error=>({error})),
  ])
  if (!Array.isArray(eventsRes.events) || !Array.isArray(usersRes.users)) throw new Error('用户或事件接口返回格式无效')
  return {
    events:eventsRes.events,users:usersRes.users,
    referrals:Array.isArray(referralsResult.value?.referrals)?referralsResult.value.referrals:null,
    trades:Array.isArray(tradesResult.value?.trades)?tradesResult.value.trades:null,
    availability:{
      referrals:referralsResult.error?'error':Array.isArray(referralsResult.value?.referrals)?'available':'missing',
      trades:tradesResult.error?'error':Array.isArray(tradesResult.value?.trades)?'available':'missing',
    },
  }
}
