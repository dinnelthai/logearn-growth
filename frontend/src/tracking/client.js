import { MODULES, RAW_EVENT_TYPES } from '../analytics/events.js'
import { SHARE_TYPES } from '../analytics/sharing.js'
import {cleanEntryUrl, isInternalReferrer, browserStorage, readState, writeState} from './firstVisit.js'
const IDLE_MS = 30 * 60 * 1000
/** Product-side tracker. Supply the actual ingestion transport; no endpoint is assumed. */
export function createTracker({ send, storage = browserStorage('sessionStorage'), persistentStorage = browserStorage('localStorage'), ownHosts = [], subdomainRoots = [], now = Date.now, uuid = () => globalThis.crypto.randomUUID() }) {
  if (typeof send !== 'function') throw new TypeError('send transport is required')
  let identity = {}, inFlight = null
  const sessionKey = 'logearn.tracking.v1', lifetimeKey = 'logearn.tracking.lifetime.v1'
  let state = readState(storage, sessionKey)
  let lifetime = readState(persistentStorage, lifetimeKey)
  if (!lifetime?.anonymous_id) lifetime = { anonymous_id: state?.anonymous_id || uuid(), first_visit: null }
  if (!state?.session_id) state = { session_id: uuid(), last_at: null }
  state.anonymous_id = lifetime.anonymous_id
  const persist = () => writeState(storage, sessionKey, state)
  const persistLifetime = () => writeState(persistentStorage, lifetimeKey, lifetime)
  persist(); persistLifetime()
  const createEvent = (eventName, properties) => {
    const t = now()
    if (state.last_at !== null && t - state.last_at >= IDLE_MS) state.session_id = uuid()
    state.last_at = t; persist()
    return { event_id: uuid(), event_name: eventName, occurred_at: new Date(t).toISOString(), ...identity, anonymous_id: lifetime.anonymous_id, session_id: state.session_id, properties: { ...properties } }
  }
  return {
    /** Call once on document entry, never on every SPA route change.
     * A failed send retains the exact event for retry; a successful send returns
     * null on later calls. Empty referrer is a real unknown first entry.
     */
    captureFirstVisit({ referrer = globalThis.document?.referrer, landingUrl = globalThis.location?.href } = {}) {
      if (inFlight) return inFlight
      // Re-read shared persisted state before recording a new entry.
      const saved = readState(persistentStorage, lifetimeKey)
      if (saved?.anonymous_id === lifetime.anonymous_id && saved.first_visit) lifetime = saved
      if (lifetime.first_visit?.sent) return Promise.resolve(null)
      if (!lifetime.first_visit) {
        const landing = cleanEntryUrl(landingUrl), external = cleanEntryUrl(referrer)
        if (!landing) return Promise.reject(new TypeError('First visit requires an HTTP(S) landing URL'))
        if (isInternalReferrer(external, landing, ownHosts, subdomainRoots)) return Promise.resolve(null)
        const event = createEvent('first_visit_captured', { first_referrer_url: external, first_landing_url: landing })
        event.properties.first_visit_at = event.occurred_at
        lifetime.first_visit = { event, sent: false }
        persistLifetime()
      }
      const event = lifetime.first_visit.event
      // Defer transport invocation so concurrent calls share the same promise.
      inFlight = Promise.resolve().then(() => send(structuredClone(event))).then(() => {
        lifetime.first_visit.sent = true; persistLifetime()
        return structuredClone(event)
      }).finally(() => { inFlight = null })
      return inFlight
    },
    identify(userId) { identity = userId ? { user_id: userId } : {} },
    async track(eventName, properties = {}) {
      if (!Object.hasOwn(RAW_EVENT_TYPES, eventName)) throw new TypeError('Unknown event name')
      if (eventName === 'module_viewed' && !Object.hasOwn(MODULES, properties.module)) throw new TypeError('Unknown module')
      if (['token_opened','ranking_token_clicked'].includes(eventName) && (!Object.hasOwn(MODULES, properties.entry_module) || !properties.token_address || !properties.chain || !properties.token_visit_id)) throw new TypeError('Token click requires module, token, chain and visit ID')
      if (['share_button_clicked','share_completed','invite_link_visited'].includes(eventName) && (!properties.referral_link_id || !properties.inviter_user_id || !Object.hasOwn(SHARE_TYPES, properties.share_type))) throw new TypeError('Share events require link ID, inviter and share type')
      if (['strategy_result_generated','strategy_signal_viewed','signal_viewed'].includes(eventName) && (!properties.strategy_run_id || !properties.result_id)) throw new TypeError('Strategy result events require run and result IDs')
      if (['trade_submitted','trade_succeeded','trade_failed'].includes(eventName) && !properties.trade_attempt_id && !properties.trade_id) throw new TypeError('Trade events require attempt ID or trade ID')
      const event = createEvent(eventName, properties)
      await send(event)
      return event
    },
  }
}
