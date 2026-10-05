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
  const [eventsRes, usersRes, referralsRes] = await Promise.all([
    fetchEvents(startAt, endAt),
    fetchUsers(),
    fetchReferrals(),
  ])

  // Trades are optional — don't fail the whole request if missing
  let tradesRes = null
  try {
    tradesRes = await fetchTrades(startAt, endAt)
  } catch (err) {
    console.warn('[analytics] Trades endpoint unavailable:', err.message)
  }

  return {
    events: eventsRes.events ?? [],
    users: usersRes.users ?? [],
    referrals: referralsRes.referrals ?? [],
    trades: tradesRes?.trades ?? null,
  }
}
