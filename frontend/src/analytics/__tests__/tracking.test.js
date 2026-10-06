import { describe, it, expect } from 'vitest'
import { createTracker } from '../../tracking/client.js'
import { normalizeApiResponse } from '../normalize.js'
import { computePaths } from '../paths.js'
describe('module tracking', () => {
  it('stitches module visits and token handoff to logged-in analysis', async () => {
    const events = []; let t = 1000000, id = 0
    const tracker = createTracker({ send: e => events.push(e), storage: { getItem: () => null, setItem() {} }, now: () => t++, uuid: () => String(++id) })
    for (const module of ['callouts', 'signals', 'popular', 'fomo']) await tracker.track('module_viewed', { module })
    const fields = { entry_module: 'fomo', token_address: 'token-1', chain: 'solana', token_visit_id: 'visit-1', position: 3 }
    await tracker.track('token_opened', fields)
    tracker.identify('123')
    await tracker.track('login_succeeded')
    await tracker.track('token_detail_viewed', fields)
    await tracker.track('chip_analysis_viewed', fields)
    const store = normalizeApiResponse({ events, users: [], referrals: [], timezone: 'Asia/Bangkok', startAt: 0, asOf: t })
    expect(store.users).toHaveLength(1)
    expect(store.users[0].id).toBe('user:123')
    expect(store.users[0].events[4]).toMatchObject({ type: 'token_click', entry_module: 'fomo', position: 3, token_visit_id: 'visit-1' })
    const result = computePaths(store.users, { startAt: 0, endAt: t, asOf: t, maxSteps: 10 })
    expect(result.sessions).toBe(1)
    expect(result.paths[0].types).toEqual(['callouts', 'signals', 'popular', 'fomo', 'token_click', 'login', 'token', 'chip'])
  })
  it('rotates session at inactivity boundary and propagates transport failure', async () => {
    let t = 1000, id = 0
    const tracker = createTracker({ send: () => {}, storage: { getItem: () => null, setItem() {} }, now: () => t, uuid: () => String(++id) })
    const first = await tracker.track('module_viewed', { module: 'popular' })
    t += 30 * 60000
    const next = await tracker.track('module_viewed', { module: 'fomo' })
    expect(first.session_id).not.toBe(next.session_id)
    expect(first.anonymous_id).toBe(next.anonymous_id)
    const broken = createTracker({ send: () => { throw new Error('offline') }, storage: { getItem: () => null, setItem() {} }, uuid: () => 'id' })
    await expect(broken.track('module_viewed', { module: 'signals' })).rejects.toThrow('offline')
    await expect(tracker.track('module_viewed', { module: 'unknown' })).rejects.toThrow('Unknown module')
  })
})
