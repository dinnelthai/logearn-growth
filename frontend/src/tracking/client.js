import { MODULES, RAW_EVENT_TYPES } from '../analytics/events.js'
import { SHARE_TYPES } from '../analytics/sharing.js'
const IDLE_MS = 30 * 60 * 1000
/** Product-side tracker. Supply the actual ingestion transport; no endpoint is assumed. */
export function createTracker({ send, storage = globalThis.sessionStorage, now = Date.now, uuid = () => globalThis.crypto.randomUUID() }) {
  if (typeof send !== 'function') throw new TypeError('send transport is required')
  let identity = {}, state
  try { state = JSON.parse(storage.getItem('logearn.tracking.v1')) } catch {}
  if (!state?.anonymous_id) state = { anonymous_id: uuid(), session_id: uuid(), last_at: null }
  const persist = () => { try { storage.setItem('logearn.tracking.v1', JSON.stringify(state)) } catch {} }
  persist()
  return {
    identify(userId) { identity = userId ? { user_id: userId } : {} },
    async track(eventName, properties = {}) {
      if (!Object.hasOwn(RAW_EVENT_TYPES, eventName)) throw new TypeError('Unknown event name')
      if (eventName === 'module_viewed' && !Object.hasOwn(MODULES, properties.module)) throw new TypeError('Unknown module')
      if (eventName === 'token_opened' && (!Object.hasOwn(MODULES, properties.entry_module) || !properties.token_address || !properties.chain || !properties.token_visit_id)) throw new TypeError('Token click requires module, token, chain and visit ID')
      if (['share_button_clicked','share_completed','invite_link_visited'].includes(eventName) && (!properties.referral_link_id || !properties.inviter_user_id || !Object.hasOwn(SHARE_TYPES, properties.share_type))) throw new TypeError('Share events require link ID, inviter and share type')
      if (['strategy_result_generated','strategy_signal_viewed'].includes(eventName) && (!properties.strategy_run_id || !properties.result_id)) throw new TypeError('Strategy result events require run and result IDs')
      const t = now()
      if (state.last_at !== null && t - state.last_at >= IDLE_MS) state.session_id = uuid()
      state.last_at = t; persist()
      const event = { event_id: uuid(), event_name: eventName, occurred_at: new Date(t).toISOString(), ...identity, anonymous_id: state.anonymous_id, session_id: state.session_id, properties: { ...properties } }
      await send(event)
      return event
    },
  }
}
