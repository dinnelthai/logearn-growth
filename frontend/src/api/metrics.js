/**
 * metrics.js — aggregated metrics client for backend scale mode.
 */
import { getToken } from '../auth/authClient.js'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001'

async function metricsFetch(path, options = {}) {
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

export function fetchNorthStarMetrics({ start, end, source = 'all' }) {
  const qs = new URLSearchParams({ start: String(start), end: String(end) })
  if (source && source !== 'all') qs.set('source', source)
  return metricsFetch(`/api/metrics/north-star?${qs}`)
}

export function fetchChannelMetrics({ start, end, channel = 'all' }) {
  const qs = new URLSearchParams({ start: String(start), end: String(end) })
  if (channel && channel !== 'all') qs.set('channel', channel)
  return metricsFetch(`/api/metrics/channels?${qs}`)
}

export function fetchTradeMetrics({ start, end, source = 'all' }) {
  const qs = new URLSearchParams({ start: String(start), end: String(end) })
  if (source && source !== 'all') qs.set('source', source)
  return metricsFetch(`/api/metrics/trades?${qs}`)
}

export function fetchFunnelMetrics(body) {
  return metricsFetch('/api/metrics/funnel', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchRetentionMetrics(body) {
  return metricsFetch('/api/metrics/retention', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchSegmentsMetrics(body) {
  return metricsFetch('/api/metrics/segments', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchReferralMetrics({ start, end, source = 'all' }) {
  const qs = new URLSearchParams({ start: String(start), end: String(end) })
  if (source && source !== 'all') qs.set('source', source)
  return metricsFetch(`/api/metrics/referral?${qs}`)
}

export function fetchPathsMetrics(body) {
  return metricsFetch('/api/metrics/paths', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchComparisonMetrics(body) {
  return metricsFetch('/api/metrics/comparison', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchComparisonFunnelMetrics(body) {
  return metricsFetch('/api/metrics/comparison/funnel', { method: 'POST', body: JSON.stringify(body) })
}
