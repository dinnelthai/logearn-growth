/**
 * 批量分析查询客户端
 * 单次请求获取多个指标，减少网络往返延迟
 */

import { getApiUrl, getAuthHeaders } from './backendAnalytics.js'

/**
 * 批量执行多个分析查询
 * @param {Array} queries - 查询列表 [{ type, params }, ...]
 * @param {string} snapshotId - 快照 ID (可选)
 * @returns {Promise<Object>} { snapshot_id, as_of, results: [] }
 *
 * @example
 * const result = await batchQuery([
 *   { type: 'home-overview', params: { start, end } },
 *   { type: 'growth-insights', params: { start, end, source: 'all' } },
 *   { type: 'channels', params: { start, end } }
 * ])
 *
 * result.results.forEach(r => {
 *   if (r.status === 'fulfilled') {
 *     console.log(r.type, r.data)
 *   } else {
 *     console.error(r.type, r.error)
 *   }
 * })
 */
export async function batchQuery(queries, snapshotId = null) {
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('queries 必须是非空数组')
  }

  if (queries.length > 10) {
    throw new Error('单次批量查询不能超过 10 个')
  }

  const url = `${getApiUrl()}/batch-analytics`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snapshot_id: snapshotId,
      queries,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw Object.assign(new Error(error.error || '批量查询失败'), { status: response.status })
  }

  return response.json()
}

/**
 * 预设批量查询 - 首页看板 (总览 + 增长诊断 + 来源质量)
 */
export async function fetchHomeDashboard(start, end, source = 'all', snapshotId = null) {
  const result = await batchQuery([
    { type: 'home-overview', params: { start, end, source } },
    { type: 'growth-insights', params: { start, end, source } },
    { type: 'channels', params: { start, end, source } },
  ], snapshotId)

  return {
    snapshot_id: result.snapshot_id,
    as_of: result.as_of,
    overview: result.results[0].status === 'fulfilled' ? result.results[0].data : null,
    growthInsights: result.results[1].status === 'fulfilled' ? result.results[1].data : null,
    channels: result.results[2].status === 'fulfilled' ? result.results[2].data : null,
    errors: result.results
      .filter(r => r.status === 'rejected')
      .map(r => ({ type: r.type, error: r.error })),
  }
}

/**
 * 预设批量查询 - 获客看板 (来源质量 + 推荐贡献)
 */
export async function fetchAcquisitionDashboard(start, end, source = 'all', snapshotId = null) {
  const result = await batchQuery([
    { type: 'channels', params: { start, end, source } },
    { type: 'referral', params: { start, end, source, scope: 'all', quality: 'all' } },
  ], snapshotId)

  return {
    snapshot_id: result.snapshot_id,
    as_of: result.as_of,
    channels: result.results[0].status === 'fulfilled' ? result.results[0].data : null,
    referral: result.results[1].status === 'fulfilled' ? result.results[1].data : null,
    errors: result.results
      .filter(r => r.status === 'rejected')
      .map(r => ({ type: r.type, error: r.error })),
  }
}

/**
 * 预设批量查询 - 转化看板 (漏斗 + 留存)
 */
export async function fetchConversionDashboard(params, snapshotId = null) {
  const { start, end, source = 'all', funnelSteps, retentionInitial, retentionReturning } = params

  const queries = []

  if (funnelSteps && funnelSteps.length >= 2) {
    queries.push({
      type: 'funnel',
      params: { start, end, source, steps: funnelSteps, hours: 24, association: 'user' }
    })
  }

  if (retentionInitial && retentionReturning) {
    queries.push({
      type: 'retention',
      params: { start, end, source, initial: retentionInitial, returning: retentionReturning }
    })
  }

  if (queries.length === 0) {
    throw new Error('至少需要提供漏斗或留存参数')
  }

  const result = await batchQuery(queries, snapshotId)

  return {
    snapshot_id: result.snapshot_id,
    as_of: result.as_of,
    funnel: result.results.find(r => r.type === 'funnel')?.data || null,
    retention: result.results.find(r => r.type === 'retention')?.data || null,
    errors: result.results
      .filter(r => r.status === 'rejected')
      .map(r => ({ type: r.type, error: r.error })),
  }
}
