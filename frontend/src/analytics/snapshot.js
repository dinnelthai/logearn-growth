/**
 * snapshot.js
 * Aggregates all computed analytics into a single AnalyticsSnapshot object
 * that pages consume directly.
 */

import { computeNorthStar } from './northStar.js'
import { computeFunnel } from './funnel.js'
import { computeRetention } from './retention.js'
import { computeSegmentation } from './segmentation.js'
import { computeReferral } from './referral.js'

/**
 * @param {object} dataStore  - normalized dataStore from normalizeApiResponse() or createMockData()
 * @param {object} opts
 * @param {number} opts.startAt
 * @param {number} opts.endAt
 * @param {string} [opts.timezone]
 * @param {string[]} [opts.funnelSteps]
 * @param {number} [opts.funnelWindowMs]
 * @param {string} [opts.sourceFilter]
 * @returns {AnalyticsSnapshot}
 */
export function buildSnapshot(dataStore, {
  startAt,
  endAt,
  timezone = 'Asia/Bangkok',
  funnelSteps = ['login', 'ai', 'chip'],
  funnelWindowMs = 24 * 3600000,
  sourceFilter = 'all',
} = {}) {
  const { users, referrals, meta } = dataStore
  const asOf = meta.asOf

  // North Star
  const north_star = computeNorthStar(users, startAt, endAt, timezone)

  // Funnel
  const funnelResult = computeFunnel(users, {
    steps: funnelSteps,
    startAt,
    endAt,
    conversionWindowMs: funnelWindowMs,
    sourceFilter,
    asOf,
  })
  const STEP_LABELS = {
    login: '登录进入',
    ai: '开启 AI 策略',
    chip: '有效分析（筹码峰）',
  }
  const funnel = funnelResult.steps.map(s => ({
    ...s,
    label: STEP_LABELS[s.key] ?? s.key,
  }))

  // Retention
  const retention = computeRetention(users, {
    startAt,
    endAt,
    asOf,
    initialEvent: 'chip',
    returningEvent: 'chip',
    sourceFilter,
    timezone,
  })

  // Segmentation — build inviter/referred id sets from referral data
  const inviterIds = referrals ? [...new Set(referrals.map(r => `user:${r.inviter_user_id}`))] : []
  const referredIds = referrals ? [...new Set(referrals.map(r => `user:${r.invitee_user_id}`))] : []
  const segResult = computeSegmentation(users, { asOf, inviterIds, referredIds })
  const totalUsers = users.length
  const segments = segResult.segments.map(s => ({
    ...s,
    percentage: totalUsers > 0 ? s.users / totalUsers : 0,
  }))

  // Referral
  const referralResult = computeReferral(users, referrals ?? [], { startAt, endAt })

  return {
    meta: {
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      timezone,
      generated_at: new Date().toISOString(),
      data_source: meta.source === 'mock' ? 'mock' : 'api',
      identity_mapping_available: meta.identityMappingAvailable ?? false,
    },
    north_star,
    funnel,
    retention,
    segments,
    referral: referralResult,
  }
}
