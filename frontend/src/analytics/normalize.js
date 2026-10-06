import { normalizeLanguage } from './language.js'
/**
 * normalize.js
 * Converts raw API events/users into the internal dataStore format:
 *   { meta, users: [{ id, source, strategy, events }], referrals }
 *
 * Raw API field → internal field mapping:
 *   event_name 'login_succeeded'    → type 'login'
 *   event_name 'strategy_started'   → type 'ai'
 *   event_name 'chip_analysis_viewed'→ type 'chip'
 *   occurred_at (ISO string)        → t (ms timestamp)
 *   user_id / anonymous_id          → resolved via resolveKey()
 */

import { RAW_EVENT_TYPES, MODULES } from './events.js'

/**
 * Builds a stable user key from an event.
 * user_id takes precedence; falls back to anonymous_id.
 * Returns null if neither is present (event is unusable).
 */
export function resolveKey(userId, anonymousId) {
  if (userId) return `user:${userId}`
  if (anonymousId) return `anonymous:${anonymousId}`
  return null
}

/**
 * Merges anonymous keys into user keys when a login event provides
 * both user_id and anonymous_id on the same raw event.
 *
 * Returns a Map<anonymousKey, userKey> for identity stitching.
 * If no mapping is available, anonymous and logged-in events stay separate.
 * NOTE: comment this limitation in the snapshot meta.
 */
function buildIdentityMap(rawEvents) {
  const map = new Map()
  for (const e of rawEvents) {
    if (e.user_id && e.anonymous_id) {
      const anonKey = `anonymous:${e.anonymous_id}`
      const userKey = `user:${e.user_id}`
      if (!map.has(anonKey)) map.set(anonKey, userKey)
    }
  }
  return map
}

/**
 * Normalizes raw API response into the internal dataStore shape.
 *
 * @param {object} params
 * @param {RawGrowthEvent[]} params.events
 * @param {RawUser[]} params.users  - user metadata (source, created_at)
 * @param {RawReferralRelation[]} params.referrals
 * @param {RawTrade[]} [params.trades]  - optional; omit if not available
 * @param {string} params.timezone
 * @param {number} params.startAt  - ms timestamp
 * @param {number} params.asOf     - ms timestamp
 * @returns {object}  dataStore compatible with dashboard.js
 */
export function normalizeApiResponse({ events, users, referrals, trades, timezone, startAt, asOf, availability }) {
  // 1. Deduplicate events by event_id
  const seen = new Set()
  const dedupedEvents = []
  for (const e of events) {
    if (e.event_id && seen.has(e.event_id)) continue
    if (e.event_id) seen.add(e.event_id)
    dedupedEvents.push(e)
  }

  // 2. Build identity map (anonymous_id → user_id)
  const identityMap = buildIdentityMap(dedupedEvents)
  let identityMappingAvailable = identityMap.size > 0

  // 3. Resolve each event to a canonical key, filter unknown event types
  const byKey = new Map()
  for (const raw of dedupedEvents) {
    const internalType = raw.event_name === 'module_viewed'
      ? (Object.hasOwn(MODULES, raw.properties?.module) ? raw.properties.module : null)
      : RAW_EVENT_TYPES[raw.event_name]
    if (!internalType) continue

    const rawKey = resolveKey(raw.user_id, raw.anonymous_id)
    if (!rawKey) continue

    // Apply identity merge: if this anon key has a known user key, use that
    const key = identityMap.get(rawKey) ?? rawKey

    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push({
      type: internalType,
      // Support both client_ts (ms number) and occurred_at (ISO string)
      t: raw.client_ts ?? Date.parse(raw.occurred_at),
      // first_entry_source may be top-level or inside properties
      entry_source: raw.first_entry_source ?? raw.properties?.first_entry_source ?? null,
      strategy: raw.properties?.strategy_type ?? null,
      strategy_run_id: raw.properties?.strategy_run_id ?? null,
      result_id: raw.properties?.result_id ?? null,
      referral_link_id: raw.properties?.referral_link_id ?? null,
      inviter_user_id: raw.properties?.inviter_user_id ?? null,
      share_type: raw.properties?.share_type ?? null,
      share_method: raw.properties?.share_method ?? null,
      content_id: raw.properties?.content_id ?? null,
      entry_module: raw.properties?.entry_module ?? null,
      module: raw.properties?.module ?? null,
      item_id: raw.properties?.item_id ?? null,
      position: raw.properties?.position ?? null,
      session_id: raw.session_id ?? raw.properties?.session_id ?? null,
      token_address: raw.token_address ?? raw.properties?.token_address ?? null,
      chain: raw.chain ?? raw.properties?.chain ?? null,
      token_visit_id: raw.token_visit_id ?? raw.properties?.token_visit_id ?? null,
      _raw_event_id: raw.event_id,
    })
  }

  // 4. Build user metadata lookup
  const userMeta = new Map()
  for (const u of (users ?? [])) {
    userMeta.set(`user:${u.user_id}`, {
      source: u.first_source ?? '未知',
      created_at: u.created_at,
      preferred_language: normalizeLanguage(u.preferred_language),
      notification_preferences: { telegram: u.notification_preferences?.telegram === true, email: u.notification_preferences?.email === true },
      telegram_bound: typeof u.telegram_bound === 'boolean' ? u.telegram_bound : null,
      email_bound: typeof u.email_bound === 'boolean' ? u.email_bound : null,
    })
  }

  // 5. Assemble user objects
  const normalizedUsers = []
  for (const [key, evts] of byKey) {
    const sorted = evts.sort((a, b) => a.t - b.t)
    const meta = userMeta.get(key)

    // Determine source: prefer user metadata, fall back to first login entry_source
    const loginEvt = sorted.find(e => e.type === 'login')
    const source = meta?.source ?? loginEvt?.entry_source ?? '未知'

    // Determine strategy: most recent ai event's strategy
    const aiEvts = sorted.filter(e => e.type === 'ai' && e.strategy)
    const strategy = aiEvts.length ? aiEvts[aiEvts.length - 1].strategy : null

    normalizedUsers.push({
      id: key,
      source,
      strategy,
      preferred_language: meta?.preferred_language ?? null,
      notification_preferences: meta?.notification_preferences ?? {},
      telegram_bound: meta?.telegram_bound ?? null,
      email_bound: meta?.email_bound ?? null,
      events: sorted,
    })
  }

  // Include registered accounts without observed events.
  const present = new Set(normalizedUsers.map(u => u.id))
  for (const [id, meta] of userMeta) if (!present.has(id)) {
    normalizedUsers.push({ id, source: meta.source, strategy: null, events: [], preferred_language: meta.preferred_language, notification_preferences: meta.notification_preferences, telegram_bound: meta.telegram_bound, email_bound: meta.email_bound })
  }

  // 6. Assemble trade records if available
  const normalizedTrades = trades
    ? trades.map(t => ({
        trade_id: t.trade_id,
        user_id: identityMap.get(`user:${t.user_id}`) ?? `user:${t.user_id}`,
        confirmed_at: Date.parse(t.confirmed_at),
        volume_usd: t.volume_usd,
        status: t.status,
      }))
    : null

  // Confirmed trades can also be selected as funnel/retention events.
  for (const trade of normalizedTrades ?? []) {
    if (trade.status !== 'confirmed' || !Number.isFinite(trade.confirmed_at)) continue
    let user=normalizedUsers.find(u=>u.id===trade.user_id)
    if (!user) {
      user={id:trade.user_id,source:userMeta.get(trade.user_id)?.source??'未知',strategy:null,events:[]}
      normalizedUsers.push(user)
    }
    user.events.push({type:'trade',t:trade.confirmed_at,entry_source:user.source})
    user.events.sort((a,b)=>a.t-b.t)
  }

  return {
    meta: {
      version: 'api-v1',
      startAt,
      asOf,
      timezone,
      source: 'api',
      identityMappingAvailable,
      // DATA LIMITATION: if identityMappingAvailable is false, anonymous users
      // and post-login users are tracked separately — cross-session retention
      // and funnel numbers will be understated. Backend needs to provide
      // both user_id and anonymous_id on login events to enable merging.
    },
    users: normalizedUsers,
    referrals: referrals ?? null,
    availability: availability ?? {},
    trades: normalizedTrades,
    // channelProfiles and segmentProfiles are not available from API —
    // computed stats in those modules replace hardcoded profile values.
    channelProfiles: null,
    segmentProfiles: null,
  }
}
