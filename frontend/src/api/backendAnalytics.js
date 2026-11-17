/**
 * backendAnalytics.js — fetch analytics facts from the local Express/SQLite backend.
 * Auth uses the same Bearer token as authClient.
 */
import { getToken, notifyExpiredSession } from '../auth/authClient.js'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001'

async function backendFetch(path,options={}) {
  const token = getToken()
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    notifyExpiredSession(res)
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status })
  }
  return body
}

export async function fetchBackendEvents(startAt, endAt) {
  const qs = new URLSearchParams()
  if (Number.isFinite(startAt)) qs.set('start', String(startAt))
  if (Number.isFinite(endAt)) qs.set('end', String(endAt))
  const body = await backendFetch(`/api/analytics/logearn_events?${qs}`)
  const events = Array.isArray(body.logearn_events)
    ? body.logearn_events
    : Array.isArray(body.events)
      ? body.events
      : null
  if (!Array.isArray(events)) throw new Error('事件接口返回格式无效')
  return { logearn_events: events, events, meta: body.meta ?? {} }
}

export async function fetchBackendUsers() {
  const body = await backendFetch('/api/analytics/logearn_user')
  const users = Array.isArray(body.logearn_users)
    ? body.logearn_users
    : Array.isArray(body.users)
      ? body.users
      : null
  if (!Array.isArray(users)) throw new Error('用户接口返回格式无效')
  return { logearn_users: users, users }
}

export async function fetchBackendReferrals() {
  const body = await backendFetch('/api/analytics/logearn_user_referral')
  const referrals = Array.isArray(body.logearn_user_referrals) ? body.logearn_user_referrals : null
  if (!Array.isArray(referrals)) throw new Error('推荐关系接口返回格式无效')
  return { logearn_user_referrals: referrals }
}

export async function fetchBackendTrades(startAt, endAt) {
  const qs = new URLSearchParams()
  if (Number.isFinite(startAt)) qs.set('start', new Date(startAt).toISOString())
  if (Number.isFinite(endAt)) qs.set('end', new Date(endAt).toISOString())
  const body = await backendFetch(`/api/analytics/trades?${qs}`)
  if (!Array.isArray(body.trades)) throw new Error('交易接口返回格式无效')
  return { trades: body.trades, meta: body.meta ?? {} }
}

/** Lightweight bootstrap — no raw events. Prefer this for large SQLite datasets. */
export async function fetchBackendMeta({refresh=false}={}) {
  return refresh?backendFetch('/api/analytics/refresh',{method:'POST'}):backendFetch('/api/analytics/meta')
}

/**
 * Loads all analytics facts needed by the dashboard from the backend.
 * Rejects with status 413 when the server refuses oversized dumps.
 */
export async function fetchAllBackendAnalytics() {
  const [eventsRes, usersRes, referralRes, tradesRes] = await Promise.all([
    fetchBackendEvents(),
    fetchBackendUsers(),
    fetchBackendReferrals(),
    fetchBackendTrades(),
  ])

  const flatReferrals = referralRes.logearn_user_referrals.flatMap(r =>
    (r.invitees_l1 ?? []).map(inv => ({
      inviter_user_id: r.user_id,
      invitee_user_id: inv.user_id,
      bound_at: inv.bound_at,
      referral_link_id: inv.referral_link_id ?? null,
      share_type: inv.share_type ?? null,
    }))
  )

  return {
    events: eventsRes.logearn_events,
    coverage: eventsRes.meta ?? {},
    logearnUsers: usersRes.logearn_users,
    referrals: flatReferrals,
    userReferrals: referralRes.logearn_user_referrals,
    trades: tradesRes.trades,
    tradesCoverage: tradesRes.meta ?? {},
  }
}
