import {validateEvents,resolveIdentities,validateUsers,validateReferrals,validIdentity,eventTimestamp} from './inputQuality.js'
import {attributeVisit,referrerDomain} from '../channels/rules.js'
import {sourceCoverage} from './coverage.js'
import {validateTradeFacts} from './tradeFacts.js'
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
  if (validIdentity(userId)) return `user:${userId}`
  if (validIdentity(anonymousId)) return `anonymous:${anonymousId}`
  return null
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
export function normalizeApiResponse({ events, users, logearnUsers, referrals, trades, timezone, startAt, asOf, availability, channelRules = [], coverage = {}, tradesCoverage = {} }) {
  if(!Number.isFinite(startAt)||!Number.isFinite(asOf)||startAt>asOf)throw new TypeError('Invalid snapshot range')
  const eventInput=validateEvents(events,asOf),dedupedEvents=eventInput.events
  const identities=resolveIdentities(dedupedEvents),identityMap=identities.map
  const identityMappingAvailable=identityMap.size>0
  const userInput=validateUsers(users,asOf),logearnInput=validateUsers(logearnUsers,asOf),referralInput=validateReferrals(referrals,asOf)

  // 3. Resolve each event to a canonical key, filter unknown event types
  const byKey = new Map()
  for (const raw of dedupedEvents) {
    const internalType = raw.event_name === 'module_viewed'
      ? (Object.hasOwn(MODULES, raw.properties?.module) ? raw.properties.module : null)
      : RAW_EVENT_TYPES[raw.event_name]
    const eventTime=eventTimestamp(raw)
    if (!internalType || !Number.isFinite(eventTime) || eventTime > asOf) continue

    const rawKey = resolveKey(raw.user_id, raw.anonymous_id)
    if (!rawKey) continue

    // Apply identity merge: if this anon key has a known user key, use that
    const key = identityMap.get(rawKey) ?? rawKey

    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push({
      type: internalType,
      // Support both client_ts (ms number) and occurred_at (ISO string)
      t: eventTime,
      trade_id: raw.trade_id ?? raw.properties?.trade_id ?? null,
      trade_attempt_id: raw.trade_attempt_id ?? raw.properties?.trade_attempt_id ?? null,
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
      chain: raw.properties?.chain ?? raw.chain ?? null,
      token_visit_id: raw.token_visit_id ?? raw.properties?.token_visit_id ?? null,
      referrer: raw.properties?.first_referrer_url ?? raw.referrer ?? null,
      first_landing_url: raw.properties?.first_landing_url ?? null,
      // first_visit_captured specific fields
      channel_id: raw.properties?.channel_id ?? null,
      channel_version: raw.properties?.channel_version ?? null,
      source_fields: raw.properties?.source_fields ?? null,
      payments: raw.properties?.payments ?? null,
      // trade event fields
      reason: raw.properties?.reason ?? raw.properties?.error ?? null,
      trade_type: raw.properties?.trade_type ?? null,
      op_type: raw.properties?.op_type ?? null,
      _raw_event_id: raw.event_id,
    })
  }

  // 4. Build user metadata lookup
  const userMeta = new Map()
  for (const u of userInput.users) {
    userMeta.set(`user:${u.user_id}`, {
      source: u.first_source ?? '未知',
      created_at: u.created_at,
      first_analysis_at: u.first_analysis_at ?? null,
      preferred_language: normalizeLanguage(u.preferred_language),
      first_analysis_entry_module: u.first_analysis_entry_module ?? null,

      telegram_bound: typeof u.telegram_bound === 'boolean' ? u.telegram_bound : null,
      email_bound: typeof u.email_bound === 'boolean' ? u.email_bound : null,
      is_partner: false,
    })
  }

  // Merge logearn_user fields (telegram_bound, email_bound, is_partner) —
  // logearnUsers is the authoritative source for these binding and partner flags.
  for (const lu of logearnInput.users) {
    const key = `user:${lu.user_id}`
    const existing = userMeta.get(key)
    if (existing) {
      if (typeof lu.telegram_bound === 'boolean') existing.telegram_bound = lu.telegram_bound
      if (typeof lu.email_bound === 'boolean') existing.email_bound = lu.email_bound
      if (typeof lu.is_partner === 'boolean') existing.is_partner = lu.is_partner
      if (lu.first_analysis_at != null) existing.first_analysis_at=lu.first_analysis_at
      if (lu.first_source != null) existing.source = lu.first_source
      if (lu.preferred_language != null) existing.preferred_language = normalizeLanguage(lu.preferred_language)
      if (lu.first_analysis_entry_module != null) existing.first_analysis_entry_module = lu.first_analysis_entry_module
    } else {
      // User exists in logearn_user but not in users list — register a stub.
      userMeta.set(key, {
        source: lu.first_source ?? '未知',
        created_at: lu.created_at ?? null,
        first_analysis_at: lu.first_analysis_at ?? null,
        preferred_language: normalizeLanguage(lu.preferred_language ?? null),
        first_analysis_entry_module: lu.first_analysis_entry_module ?? null,
        telegram_bound: typeof lu.telegram_bound === 'boolean' ? lu.telegram_bound : null,
        email_bound: typeof lu.email_bound === 'boolean' ? lu.email_bound : null,
        is_partner: lu.is_partner === true,
      })
    }
  }

  // 5. Assemble user objects
  const normalizedUsers = []
  for (const [key, evts] of byKey) {
    const sorted = evts.sort((a, b) => a.t - b.t)
    const meta = userMeta.get(key)

    // Determine source: prefer user metadata, fall back to first login entry_source
    const loginEvt = sorted.find(e => e.type === 'login')
    let source = meta?.source ?? loginEvt?.entry_source ?? '未知'

    // Determine strategy: most recent ai event's strategy
    const aiEvts = sorted.filter(e => e.type === 'ai' && e.strategy)
    const strategy = aiEvts.length ? aiEvts[aiEvts.length - 1].strategy : null

    // Extract channel attribution from first_visit event (first_visit_captured)
    // channel_id and related fields are stored as top-level event fields after normalization
    const firstVisit = sorted.find(e => e.type === 'first_visit')
    const attribution = firstVisit ? (firstVisit.channel_id ? {channel_id:firstVisit.channel_id,channel_version:firstVisit.channel_version??1} : attributeVisit({...(firstVisit.source_fields??{}),referrer_url:firstVisit.referrer},channelRules)) : null
    const channelFact = firstVisit ? {
      user_id: key.replace(/^user:|^anonymous:/, ''),
      channel_id: attribution.channel_id,
      channel_version: attribution.channel_version,
      referrer_domain: referrerDomain(firstVisit.referrer),
      first_visit_at: new Date(firstVisit.t).toISOString(),
      source_fields: firstVisit.source_fields ?? {},
      payments: firstVisit.payments ?? null,
      referrer: firstVisit.referrer ?? null,
    } : null

    if(channelFact){
      source=channelRules.find(r=>r.id===channelFact.channel_id)?.name??(channelFact.channel_id==='unknown'?'未知渠道':channelFact.channel_id)
      for(const event of sorted){event.behavior_entry_source=event.entry_source;event.entry_source=source}
    }
    normalizedUsers.push({
      id: key,
      source,
      strategy,
      created_at: meta?.created_at ?? null,
      first_analysis_at: meta?.first_analysis_at ?? null,
      first_analysis_entry_module: meta?.first_analysis_entry_module ?? null,
      preferred_language: meta?.preferred_language ?? null,

      telegram_bound: meta?.telegram_bound ?? null,
      email_bound: meta?.email_bound ?? null,
      is_partner: meta?.is_partner ?? false,
      channelFact,
      events: sorted,
    })
  }

  // Include registered accounts without observed events.
  const present = new Set(normalizedUsers.map(u => u.id))
  for (const [id, meta] of userMeta) if (!present.has(id)) {
    normalizedUsers.push({ id, source: meta.source, strategy: null, events: [], created_at: meta.created_at, first_analysis_at:meta.first_analysis_at, first_analysis_entry_module: meta.first_analysis_entry_module, preferred_language: meta.preferred_language, telegram_bound: meta.telegram_bound, email_bound: meta.email_bound, is_partner: meta.is_partner ?? false })
  }

  // 6. Assemble trade records if available
  const validatedTrades = validateTradeFacts(trades, asOf)
  const normalizedTrades = validatedTrades.trades?.map(t => ({
    ...t, user_id: identityMap.get(`user:${t.user_id}`) ?? `user:${t.user_id}`,
  })) ?? null

  const normalizedUserById=new Map(normalizedUsers.map(u=>[u.id,u]))

  // Confirmed trades can also be selected as funnel/retention events.
  for (const trade of normalizedTrades ?? []) {
    if (trade.status !== 'confirmed' || !Number.isFinite(trade.confirmed_at) || trade.confirmed_at > asOf) continue
    let user=normalizedUserById.get(trade.user_id)
    if (!user) {
      user={id:trade.user_id,source:userMeta.get(trade.user_id)?.source??'未知',strategy:null,events:[]}
      normalizedUsers.push(user)
      normalizedUserById.set(user.id,user)
    }
    const existing=user.events.find(e=>e.type==='trade'&&(e.trade_id===trade.trade_id||(trade.trade_attempt_id&&e.trade_attempt_id===trade.trade_attempt_id)))
    if(existing){existing.trade_id=trade.trade_id;existing.t=trade.confirmed_at;existing.trade_attempt_id??=trade.trade_attempt_id;existing.chain??=trade.chain}
    else user.events.push({type:'trade',t:trade.confirmed_at,entry_source:user.source,trade_id:trade.trade_id,trade_attempt_id:trade.trade_attempt_id,chain:trade.chain,_origin:'trade_fact'})
    user.events.sort((a,b)=>a.t-b.t)
  }

  for(const user of normalizedUsers){
    const seenTrades=new Set();
    user.events=user.events.filter(e=>{
      if(e.type!=='trade'||(!e.trade_id&&!e.trade_attempt_id))return true;
      const key=e.trade_id?`trade:${e.trade_id}`:`attempt:${e.trade_attempt_id}`;
      if(seenTrades.has(key))return false;
      seenTrades.add(key);return true;
    });
  }

  const activityUsers = new Map(normalizedUsers.map(u => [u.id, u]))
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || !validIdentity(raw.user_id)) continue
    const t = eventTimestamp(raw)
    if (!Number.isFinite(t) || t > asOf) continue
    const id = `user:${raw.user_id}`
    let user = activityUsers.get(id)
    if (!user) {
      user = {id, source: raw.first_entry_source ?? '未知', events: []}
      activityUsers.set(id, user)
    }
    user.loggedInVisits ??= []
    user.loggedInVisits.push({type: 'logged_in_visit', t, session_id: raw.session_id ?? null,
      token_visit_id: raw.properties?.token_visit_id ?? null,
      strategy_run_id: raw.properties?.strategy_run_id ?? null,
      token_address: raw.properties?.token_address ?? null,
      chain: raw.properties?.chain ?? raw.chain ?? null})
  }
  for (const user of normalizedUsers) user.events.sort((a, b) => a.t - b.t)
  return {
    meta: {
      version: 'api-v1',
      coverage:{events:sourceCoverage(coverage,'events',asOf,startAt),trades:sourceCoverage(tradesCoverage,'trades',asOf,startAt)},
      historyComplete: coverage.history_complete===true,
      eventsCompleteThrough: coverage.events_complete_through??null,
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
    loggedInVisitUsers: [...activityUsers.values()],
    // Login activity counts every raw event carrying a real user ID, including
    // events not represented in the analysis vocabulary. Anonymous-only events
    // remain excluded even when their identity can be merged after login.
    loginActivity: (Array.isArray(events) ? events : []).filter(raw => raw && validIdentity(raw.user_id))
      .map(raw => ({id: `user:${raw.user_id}`, t: eventTimestamp(raw)}))
      .filter(e => Number.isFinite(e.t) && e.t <= asOf),
    referrals: referralInput.referrals,
    availability: availability ?? {},
    trades: normalizedTrades,
    tradeQuality: validatedTrades.quality,
    inputQuality:{events:eventInput.quality,users:userInput.quality,logearnUsers:logearnInput.quality,referrals:referralInput.quality,identity:identities.quality},
    // channelProfiles and segmentProfiles are not available from API —
    // computed stats in those modules replace hardcoded profile values.
    channelProfiles: null,
    segmentProfiles: null,
  }
}
