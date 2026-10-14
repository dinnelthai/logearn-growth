/**
 * metrics.js — aggregated metrics client for backend scale mode.
 */
import { getToken } from '../auth/authClient.js'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? 'http://localhost:3001'

async function metricsFetch(path, options = {}, deadline = Date.now()+45000) {
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
  if(res.status===202 && body.job_id){
    if(Date.now()>deadline)throw new Error('分析等待超时，请稍后重试')
    await new Promise(resolve=>setTimeout(resolve,750))
    return metricsFetch('/api/analytics/jobs/'+encodeURIComponent(body.job_id),{},deadline)
  }
  return body
}

export function fetchNorthStarMetrics({ start, end, source = 'all',snapshot_id }) {
  const qs = new URLSearchParams({ start: String(start), end: String(end) })
  if(snapshot_id)qs.set('snapshot_id',snapshot_id)
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

export function fetchReferralInsights(body) {
  return metricsFetch('/api/metrics/referral', {method:'POST',body:JSON.stringify(body)})
}

export function fetchOnlineTradeMetrics(body) {return metricsFetch('/api/metrics/trade-monitor',{method:'POST',body:JSON.stringify(body)})}

export function fetchChannelInsights(body){return metricsFetch('/api/metrics/channels',{method:'POST',body:JSON.stringify(body)})}

export function fetchTradeVolumeMetrics({start,end,snapshot_id}){const qs=new URLSearchParams({start:String(start),end:String(end)});if(snapshot_id)qs.set('snapshot_id',snapshot_id);return metricsFetch('/api/metrics/trade-volume?'+qs)}

export function fetchMyMonitorMetrics({start,end,snapshot_id}) {
 const qs=new URLSearchParams({start:String(start),end:String(end)})
 if(snapshot_id)qs.set('snapshot_id',snapshot_id)
 return metricsFetch('/api/metrics/my-monitor?'+qs)
}
