/**
 * drill.js — paginated user drill + timeline for backend scale mode.
 */
import { getToken, notifyExpiredSession } from '../auth/authClient.js'

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
    notifyExpiredSession(res)
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

export function fetchUserTimeline({ userId, start, end, limit = 200, snapshotId, cacheId }) {
  const id = (snapshotId || cacheId || globalThis.LOGEARN_ANALYTICS_DATA?.meta.storage==='hologres') ? String(userId) : String(userId).replace(/^user:/, '')
  const qs = new URLSearchParams({ user_id: id, limit: String(limit) })
  if (snapshotId) qs.set('snapshot_id', snapshotId)
  if (cacheId) qs.set('cache_id', cacheId)
  if (Number.isFinite(start)) qs.set('start', String(start))
  if (Number.isFinite(end)) qs.set('end', String(end))
  return drillFetch(`/api/drill/timeline?${qs}`)
}

export function materializeAudience(body){return drillFetch('/api/analytics/audience',{method:'POST',body:JSON.stringify(body)})}
