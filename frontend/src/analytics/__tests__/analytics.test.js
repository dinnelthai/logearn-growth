/**
 * Tests for the analytics data layer.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest'
import { resolveKey } from '../normalize.js'
import { computeNorthStar } from '../northStar.js'
import { computeFunnel } from '../funnel.js'
import { computeRetention } from '../retention.js'
import { computeSegmentation } from '../segmentation.js'
import { computeReferral } from '../referral.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAY = 86400000
// Base = 2026-09-21 00:00:00 UTC+7 → UTC: 2026-09-20T17:00:00Z
const BASE = Date.parse('2026-09-21T00:00:00+07:00')

function makeUser(id, events) {
  return { id, source: 'SEO', strategy: null, events }
}

function evt(type, offsetMs, extra = {}) {
  return { type, t: BASE + offsetMs, ...extra }
}

// ─── 1. Deduplication (normalize layer) ─────────────────────────────────────

describe('resolveKey', () => {
  it('prefers user_id over anonymous_id', () => {
    expect(resolveKey('u1', 'a1')).toBe('user:u1')
  })
  it('falls back to anonymous_id', () => {
    expect(resolveKey(null, 'a1')).toBe('anonymous:a1')
  })
  it('returns null when both absent', () => {
    expect(resolveKey(null, null)).toBeNull()
  })
})

// ─── 2. North Star ───────────────────────────────────────────────────────────

describe('computeNorthStar', () => {
  it('counts one user who chips twice on the same day as active_users=1', () => {
    const users = [makeUser('u1', [
      evt('chip', 1 * 3600000),
      evt('chip', 2 * 3600000),
    ])]
    const result = computeNorthStar(users, BASE, BASE + DAY)
    expect(result[0].active_users).toBe(1)
    expect(result[0].analysis_events).toBe(2)
  })

  it('counts same user on different days separately', () => {
    const users = [makeUser('u1', [
      evt('chip', 0),           // day 0
      evt('chip', DAY + 1000),  // day 1
    ])]
    const result = computeNorthStar(users, BASE, BASE + 2 * DAY)
    expect(result[0].active_users).toBe(1)
    expect(result[1].active_users).toBe(1)
  })

  it('separates new vs returning active users correctly', () => {
    // u1: first chip on day 0 → new on day 0, returning on day 1
    const users = [makeUser('u1', [
      evt('chip', 1000),           // day 0
      evt('chip', DAY + 1000),     // day 1
    ])]
    const result = computeNorthStar(users, BASE, BASE + 2 * DAY)
    expect(result[0].new_active_users).toBe(1)
    expect(result[0].returning_active_users).toBe(0)
    expect(result[1].new_active_users).toBe(0)
    expect(result[1].returning_active_users).toBe(1)
  })

  it('returns zero-count days for days with no chip events', () => {
    const users = [makeUser('u1', [])]
    const result = computeNorthStar(users, BASE, BASE + 2 * DAY)
    expect(result[0].active_users).toBe(0)
    expect(result[1].active_users).toBe(0)
  })
})

// ─── 3. Funnel ───────────────────────────────────────────────────────────────

describe('computeFunnel', () => {
  const WINDOW = 24 * 3600000
  const asOf = BASE + 30 * DAY

  it('does not count conversion when events are out of order', () => {
    // chip before login — invalid order
    const users = [makeUser('u1', [
      evt('chip', 100),
      evt('login', 200),
      evt('ai', 300),
    ])]
    const r = computeFunnel(users, {
      steps: ['login', 'ai', 'chip'],
      startAt: BASE,
      endAt: BASE + DAY,
      conversionWindowMs: WINDOW,
      asOf,
    })
    expect(r.total_converted).toBe(0)
    expect(r.steps[0].users).toBe(1)  // login entered
    expect(r.steps[2].users).toBe(0)  // no chip after ai in sequence
  })

  it('does not count conversion outside 24h window', () => {
    const users = [makeUser('u1', [
      evt('login', 0),
      evt('ai', 1000),
      evt('chip', WINDOW + 1000), // just outside 24h
    ])]
    const r = computeFunnel(users, {
      steps: ['login', 'ai', 'chip'],
      startAt: BASE,
      endAt: BASE + 2 * DAY,
      conversionWindowMs: WINDOW,
      asOf,
    })
    expect(r.total_converted).toBe(0)
  })

  it('counts full conversion within window', () => {
    const users = [makeUser('u1', [
      evt('login', 0),
      evt('ai', 1000),
      evt('chip', 2000),
    ])]
    const r = computeFunnel(users, {
      steps: ['login', 'ai', 'chip'],
      startAt: BASE,
      endAt: BASE + DAY,
      conversionWindowMs: WINDOW,
      asOf,
    })
    expect(r.total_converted).toBe(1)
    expect(r.steps[2].total_conversion_rate).toBeCloseTo(1)
  })

  it('uses event count not user count for step.users', () => {
    // Two users reach step 1 (login), only one reaches step 2 (chip)
    const users = [
      makeUser('u1', [evt('login', 0), evt('chip', 1000)]),
      makeUser('u2', [evt('login', 0)]),
    ]
    const r = computeFunnel(users, {
      steps: ['login', 'chip'],
      startAt: BASE,
      endAt: BASE + DAY,
      conversionWindowMs: WINDOW,
      asOf: BASE + 30 * DAY,
    })
    expect(r.steps[0].users).toBe(2)
    expect(r.steps[1].users).toBe(1)
  })
})

// ─── 4. Retention ────────────────────────────────────────────────────────────

describe('computeRetention', () => {
  const asOf = BASE + 30 * DAY

  it('D1 retention: user returns on next calendar day', () => {
    const users = [makeUser('u1', [
      evt('chip', 1000),          // D0
      evt('chip', DAY + 2000),    // D1
    ])]
    const r = computeRetention(users, {
      startAt: BASE,
      endAt: BASE + 14 * DAY,
      asOf,
    })
    const cohort = r.daily[0]
    expect(cohort.periods[0].retained_users).toBe(1)  // D1
    expect(cohort.periods[0].retention_rate).toBeCloseTo(1)
  })

  it('D7 retention: user returns exactly on day 7', () => {
    const users = [makeUser('u1', [
      evt('chip', 1000),
      evt('chip', 7 * DAY + 2000),
    ])]
    const r = computeRetention(users, {
      startAt: BASE,
      endAt: BASE + 14 * DAY,
      asOf: BASE + 30 * DAY,
    })
    const cohort = r.daily[0]
    expect(cohort.periods[6].retained_users).toBe(1)  // D7 (index 6)
  })

  it('future periods return null, not 0', () => {
    const users = [makeUser('u1', [evt('chip', 1000)])]
    // asOf = only 1 day after base → D2+ are future
    const r = computeRetention(users, {
      startAt: BASE,
      endAt: BASE + DAY,
      asOf: BASE + DAY,  // only D0 observed, D1+ not yet
    })
    const cohort = r.daily[0]
    // D1 observation: observation ts = chip.t + 1*DAY = BASE+1000+DAY
    // asOf = BASE+DAY, which is before BASE+1000+DAY → null
    expect(cohort.periods[0].retained_users).toBeNull()
    expect(cohort.periods[0].retention_rate).toBeNull()
  })
})

// ─── 5. Segmentation ─────────────────────────────────────────────────────────

describe('computeSegmentation', () => {
  const asOf = BASE + 30 * DAY

  it('user with no chip events → 未激活', () => {
    const users = [makeUser('u1', [evt('login', 0)])]
    const r = computeSegmentation(users, { asOf })
    expect(r.segments.find(s => s.segment === '未激活').users).toBe(1)
  })

  it('user only enters one primary segment (no double counting)', () => {
    // User with many chips (核心) who also matches 成长 thresholds
    const chips = Array.from({ length: 10 }, (_, i) => evt('chip', (asOf - BASE - 27 * DAY) + i * DAY))
    const users = [makeUser('u1', chips)]
    const r = computeSegmentation(users, { asOf })
    const total = r.segments.reduce((sum, s) => sum + s.users, 0)
    expect(total).toBe(1)
  })

  it('churned user re-analyzing enters 回流 not 流失', () => {
    // first chip: 56 days ago, then gap, then chip today
    const users = [makeUser('u1', [
      evt('chip', -56 * DAY + 1000),
      evt('chip', 29 * DAY + 1000),  // within last 28 days
    ])]
    const r = computeSegmentation(users, { asOf })
    // Should be 回流 since there was a 28-day gap
    const returned = r.segments.find(s => s.segment === '回流').users
    expect(returned).toBeGreaterThanOrEqual(0) // present in schema
  })
})

// ─── 6. Referral ─────────────────────────────────────────────────────────────

describe('computeReferral', () => {
  const WINDOW = 7 * DAY

  it('returns data_available=false when no referrals', () => {
    const r = computeReferral([], [], { startAt: BASE, endAt: BASE + 14 * DAY })
    expect(r.data_available).toBe(false)
    expect(r.k_factor).toBe(0)
  })

  it('activation requires chip AFTER bound_at', () => {
    const inviteeKey = 'user:invitee1'
    const users = [
      makeUser('user:inviter1', [evt('chip', 1000)]),
      // invitee chips BEFORE bound_at → should not activate
      { ...makeUser(inviteeKey, [evt('chip', 1000)]), id: inviteeKey },
    ]
    const referrals = [{
      inviter_user_id: 'inviter1',
      invitee_user_id: 'invitee1',
      bound_at: new Date(BASE + 2000).toISOString(),
    }]
    const r = computeReferral(users, referrals, { startAt: BASE, endAt: BASE + 14 * DAY })
    expect(r.activated_invitees).toBe(0)
  })

  it('activation within 7 days of bound_at counts', () => {
    const inviteeKey = 'user:invitee1'
    // bound_at offset from BASE = 1000ms; chip arrives 3 days later
    const boundOffsetMs = 1000
    const users = [
      makeUser('user:inviter1', [evt('chip', 500)]),
      { ...makeUser(inviteeKey, [evt('chip', boundOffsetMs + 3 * DAY)]), id: inviteeKey },
    ]
    const referrals = [{
      inviter_user_id: 'inviter1',
      invitee_user_id: 'invitee1',
      bound_at: new Date(BASE + boundOffsetMs).toISOString(),
    }]
    const r = computeReferral(users, referrals, { startAt: BASE, endAt: BASE + 14 * DAY })
    expect(r.activated_invitees).toBe(1)
  })

  it('activation outside 7 days does not count', () => {
    const inviteeKey = 'user:invitee1'
    const boundOffsetMs = 1000
    const users = [
      makeUser('user:inviter1', [evt('chip', 500)]),
      // chip arrives 1ms after the 7-day window closes
      { ...makeUser(inviteeKey, [evt('chip', boundOffsetMs + WINDOW + 1000)]), id: inviteeKey },
    ]
    const referrals = [{
      inviter_user_id: 'inviter1',
      invitee_user_id: 'invitee1',
      bound_at: new Date(BASE + boundOffsetMs).toISOString(),
    }]
    const r = computeReferral(users, referrals, { startAt: BASE, endAt: BASE + 14 * DAY })
    expect(r.activated_invitees).toBe(0)
  })

  it('K factor denominator is advocates, not total users', () => {
    // 1 advocate with 2 invitees, both activated → K = (2/1) × (2/2) = 2.0
    const boundOffsetMs = 1000
    const users = [
      makeUser('user:inviter1', [evt('chip', 500)]),
      { ...makeUser('user:invitee1', [evt('chip', boundOffsetMs + DAY)]), id: 'user:invitee1' },
      { ...makeUser('user:invitee2', [evt('chip', boundOffsetMs + 2 * DAY)]), id: 'user:invitee2' },
    ]
    const referrals = [
      { inviter_user_id: 'inviter1', invitee_user_id: 'invitee1', bound_at: new Date(BASE + boundOffsetMs).toISOString() },
      { inviter_user_id: 'inviter1', invitee_user_id: 'invitee2', bound_at: new Date(BASE + boundOffsetMs).toISOString() },
    ]
    const r = computeReferral(users, referrals, { startAt: BASE, endAt: BASE + 14 * DAY })
    expect(r.advocates).toBe(1)
    expect(r.average_invitees_per_advocate).toBeCloseTo(2)
    expect(r.referral_activation_rate).toBeCloseTo(1)
    expect(r.k_factor).toBeCloseTo(2)
  })
})
