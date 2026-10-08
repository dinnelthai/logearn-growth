/** Referral K-factor from referral_invitees + chip events / user_facts.first_chip_at. */
const db = require('../db/connection')
const DAY_MS = 86400000
const ACTIVATION_WINDOW_MS = 7 * DAY_MS

function computeReferralMetrics({ startAt, endAt, asOf, source = 'all' }) {
  const invitees = db.prepare(`
    SELECT inviter_user_id, invitee_user_id, bound_at, referral_link_id, share_type
    FROM referral_invitees
    WHERE level = 1
  `).all()

  const normalized = invitees.map(r => ({
    ...r,
    bound_at_ms: Date.parse(r.bound_at),
    inviter_key: `user:${r.inviter_user_id}`,
    invitee_key: `user:${r.invitee_user_id}`,
  })).filter(r => Number.isFinite(r.bound_at_ms) && r.inviter_key !== r.invitee_key)
    .sort((a, b) => a.bound_at_ms - b.bound_at_ms)

  const inviteeBound = new Map()
  for (const r of normalized) {
    if (!inviteeBound.has(r.invitee_key)) inviteeBound.set(r.invitee_key, r)
  }

  // Batch source filter
  if (source && source !== 'all') {
    const ids = [...inviteeBound.values()].map(r => r.invitee_user_id)
    const allowed = new Set()
    const CHUNK = 800
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      const ph = slice.map(() => '?').join(',')
      for (const row of db.prepare(`
        SELECT user_id FROM user_facts WHERE first_source = ? AND user_id IN (${ph})
      `).all(source, ...slice)) allowed.add(row.user_id)
    }
    for (const [key, r] of [...inviteeBound.entries()]) {
      if (!allowed.has(r.invitee_user_id)) inviteeBound.delete(key)
    }
  }

  for (const [key, r] of [...inviteeBound.entries()]) {
    if (r.bound_at_ms < startAt || r.bound_at_ms >= endAt || r.bound_at_ms > asOf) {
      inviteeBound.delete(key)
    }
  }

  const advocates = new Set([...inviteeBound.values()].map(r => r.inviter_key))
  let activated = 0
  let pending = 0
  const activatedIds = []
  const boundIds = []

  const inviteeIds = [...inviteeBound.values()].map(r => r.invitee_user_id)
  const inviteeSet = new Set(inviteeIds)
  const firstChipByUser = new Map()
  const chipsByUser = new Map()

  if (inviteeIds.length) {
    const CHUNK = 800
    for (let i = 0; i < inviteeIds.length; i += CHUNK) {
      const slice = inviteeIds.slice(i, i + CHUNK)
      const ph = slice.map(() => '?').join(',')
      for (const row of db.prepare(`
        SELECT user_id, first_chip_at FROM user_facts WHERE user_id IN (${ph})
      `).all(...slice)) {
        firstChipByUser.set(row.user_id, row.first_chip_at)
      }
    }

    // Only chips that could activate someone bound in this period:
    // [startAt, min(endAt + 7d, asOf)]
    const chipStart = startAt
    const chipEnd = Math.min(endAt + ACTIVATION_WINDOW_MS, asOf) + 1
    const chipRows = db.prepare(`
      SELECT user_id, client_ts FROM events
      WHERE event_name = 'chip_analysis_viewed'
        AND client_ts >= ? AND client_ts < ?
        AND user_id IS NOT NULL
    `).all(chipStart, chipEnd)
    for (const row of chipRows) {
      if (!inviteeSet.has(row.user_id)) continue
      if (!chipsByUser.has(row.user_id)) chipsByUser.set(row.user_id, [])
      chipsByUser.get(row.user_id).push(row.client_ts)
    }
  }

  for (const [inviteeKey, r] of inviteeBound) {
    boundIds.push(inviteeKey)
    const windowEnd = r.bound_at_ms + ACTIVATION_WINDOW_MS
    const factChip = firstChipByUser.get(r.invitee_user_id)
    const factOk = factChip != null
      && factChip > r.bound_at_ms
      && factChip <= windowEnd
      && factChip <= asOf
    const chipOk = (chipsByUser.get(r.invitee_user_id) || [])
      .some(ts => ts > r.bound_at_ms && ts <= windowEnd && ts <= asOf)

    if (chipOk || factOk) {
      activated += 1
      activatedIds.push(inviteeKey)
    } else if (windowEnd > asOf) {
      pending += 1
    }
  }

  const bound = inviteeBound.size
  const adv = advocates.size
  const activation_rate = bound ? activated / bound : 0
  const k_factor = adv ? activated / adv : 0

  return {
    data_available: true,
    advocates: adv,
    bound_invitees: bound,
    activated_invitees: activated,
    pending_invitees: pending,
    average_invitees_per_advocate: adv ? bound / adv : 0,
    referral_activation_rate: activation_rate,
    k_factor,
    drill: {
      advocates: { kind: 'referral_advocates', params: { start: startAt, end: endAt, source } },
      bound: { kind: 'referral_bound', params: { start: startAt, end: endAt, source } },
      activated: { kind: 'referral_activated', params: { start: startAt, end: endAt, source } },
    },
    _ids: { advocates: [...advocates], bound: boundIds, activated: activatedIds },
  }
}

module.exports = { computeReferralMetrics }
