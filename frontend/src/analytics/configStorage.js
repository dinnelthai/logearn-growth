import {ASSOCIATIONS} from './funnel.js'
import { EVENT_LABELS } from './events.js'
const KEY = 'logearn.analytics.config.v1'
const MODES = ['north','channels','funnel','retention','referral','segments','value','paths','trade-monitor']
const EVENTS = Object.keys(EVENT_LABELS)
const RANGES={north:[7,14,30],funnel:[1,7,14],paths:[1,3,7],channels:[1,7,14,30],'trade-monitor':[1,7,14,30],retention:[7,14],segments:[7,14],referral:[7,14],value:[7,14]}
const identifier=v=>typeof v==='string'&&v.trim().length>0&&v.length<=256
export function validConfig(c) {
  return !!c && (c.schemaVersion===undefined||c.schemaVersion===2) && !c.audienceIds && !c.cohortId && !c.snapshotId && (c.association===undefined||Object.hasOwn(ASSOCIATIONS,c.association)) && MODES.includes(c.mode) && Array.isArray(c.steps) && c.steps.length >= 2 && c.steps.length <= 5 && c.steps.every(e=>EVENTS.includes(e)) && (RANGES[c.mode]?.includes(c.range)||(c.mode==='north'&&c.period==='all'&&Number.isInteger(c.range)&&c.range>0)) && [1,24,72].includes(c.hours) && identifier(c.source) && identifier(c.strategy) && EVENTS.includes(c.initial) && EVENTS.includes(c.returning) && (c.pathStart===undefined||['all',...EVENTS].includes(c.pathStart)) && (c.pathDepth===undefined||[3,5,7].includes(c.pathDepth))
}
export function loadConfig(storage) {
  try { const value=JSON.parse(storage.getItem(KEY)); if(!validConfig(value))return null;const {schemaVersion,...config}=value;return config } catch { return null }
}
export function saveConfig(storage, config) {
  if (!validConfig(config)) throw new Error('配置无效')
  storage.setItem(KEY, JSON.stringify({...config,schemaVersion:2}))
}
