/**
 * referral.js
 * Computes referral/growth loop metrics from backend referral relation data.
 *
 * Activation definition: an invitee who triggers chip_analysis_viewed
 * within 7 days of bound_at, and after bound_at.
 *
 * K = (bound_invitees / advocates) × activation_rate
 */

const DAY_MS = 86400000
const ACTIVATION_WINDOW_MS = 7 * DAY_MS

/**
 * @param {object[]} users             - normalized user array
 * @param {object[]} referrals         - raw referral relations
 * @param {number}   referrals[].inviter_user_id
 * @param {number}   referrals[].invitee_user_id
 * @param {number}   referrals[].bound_at  - ISO string or ms timestamp
 * @param {number}   startAt           - range start ms
 * @param {number}   endAt             - range end ms
 * @returns {ReferralResult}
 */
export function computeReferral(users, referrals, { startAt, endAt, asOf = endAt, sourceFilter = 'all' }) {
  if (!referrals || referrals.length === 0) {
    return {
      advocates: 0,
      bound_invitees: 0,
      activated_invitees: 0,
      average_invitees_per_advocate: 0,
      referral_activation_rate: 0,
      k_factor: 0,
      referral_active_user_contribution: 0,
      data_available: false,
    }
  }

  // Build user event lookup by id
  const userById = new Map(users.map(u => [u.id, u]))

  // Normalize bound_at to ms
  const normalizedReferrals = referrals.map(r => ({
    ...r,
    bound_at_ms: typeof r.bound_at === 'number' ? r.bound_at : Date.parse(r.bound_at),
    inviter_key: `user:${r.inviter_user_id}`,
    invitee_key: `user:${r.invitee_user_id}`,
  })).filter(r=>Number.isFinite(r.bound_at_ms) && r.inviter_key !== r.invitee_key).sort((a,b)=>a.bound_at_ms-b.bound_at_ms)

  // One invitee can only have one valid inviter (first bound relationship wins)
  const inviteeBound = new Map()
  for (const r of normalizedReferrals) {
    if (!inviteeBound.has(r.invitee_key)) {
      inviteeBound.set(r.invitee_key, r)
    }
  }

  for (const [key,r] of inviteeBound) {
    const invitee=userById.get(key)
    if (r.bound_at_ms < startAt || r.bound_at_ms >= endAt || r.bound_at_ms > asOf || (sourceFilter !== 'all' && invitee?.source !== sourceFilter)) inviteeBound.delete(key)
  }
  let pendingInvitees=0
  const boundInvitees = inviteeBound.size

  // Find advocates (inviters with at least one bound invitee)
  const advocateSet = new Set()
  for (const r of inviteeBound.values()) {
    advocateSet.add(r.inviter_key)
  }
  const advocates = advocateSet.size

  // Activated invitees: chip event after bound_at and within 7 days
  let activatedCount = 0
  const activatedInviteeIds = new Set()

  for (const [inviteeKey, r] of inviteeBound) {
    const invitee = userById.get(inviteeKey)
    if (!invitee) { if(r.bound_at_ms+ACTIVATION_WINDOW_MS>asOf)pendingInvitees++; continue }
    const windowStart = r.bound_at_ms
    const windowEnd = r.bound_at_ms + ACTIVATION_WINDOW_MS
    const activated = invitee.events.some(
      e => e.type === 'chip' && e.t > windowStart && e.t <= windowEnd && e.t <= asOf
    )
    if (!activated && windowEnd>asOf) pendingInvitees++
    if (activated) {
      activatedCount++
      activatedInviteeIds.add(inviteeKey)
    }
  }

  const avgInviteesPerAdvocate = advocates > 0 ? boundInvitees / advocates : 0
  const activationRate = boundInvitees > 0 ? activatedCount / boundInvitees : 0
  const kFactor = avgInviteesPerAdvocate * activationRate

  // Referral contribution: activated invitees / all chip users in range
  const allChipUsersInRange = new Set(
    users.filter(u => u.events.some(e => e.type === 'chip' && e.t >= startAt && e.t < endAt))
      .map(u => u.id)
  )
  const referralChipUsers = [...activatedInviteeIds].filter(id => allChipUsersInRange.has(id)).length
  const referralContribution = allChipUsersInRange.size > 0
    ? referralChipUsers / allChipUsersInRange.size
    : 0

  return {
    advocates,
    pending_invitees: pendingInvitees,
    bound_invitees: boundInvitees,
    activated_invitees: activatedCount,
    average_invitees_per_advocate: avgInviteesPerAdvocate,
    referral_activation_rate: activationRate,
    k_factor: kFactor,
    referral_active_user_contribution: referralContribution,
    data_available: true,
  }
}
