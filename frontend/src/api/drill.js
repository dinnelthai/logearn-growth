/**
 * drill.js — paginated user drill + timeline for backend scale mode.
 */
import { getToken } from '../auth/authClient.js'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001'

async function drillFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status, body })
  }
  return body
}

/**
 * @param {{ kind: string, params?: object, offset?: number, limit?: number, q?: string }} query
 */
export function fetchDrillUsers(query) {
  return drillFetch('/api/drill/users', {
    method: 'POST',
    body: JSON.stringify(query),
  })
}

export function fetchUserTimeline({ userId, start, end, limit = 200 }) {
  const id = String(userId).replace(/^user:/, '')
  const qs = new URLSearchParams({ user_id: id, limit: String(limit) })
  if (Number.isFinite(start)) qs.set('start', String(start))
  if (Number.isFinite(end)) qs.set('end', String(end))
  return drillFetch(`/api/drill/timeline?${qs}`)
}
