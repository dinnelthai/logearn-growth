import { EVENT_LABELS } from './events.js'
const KEY = 'logearn.analytics.config.v1'
const MODES = ['north','channels','funnel','retention','referral','segments','value','paths']
const EVENTS = Object.keys(EVENT_LABELS)
const SOURCES = ['all','SEO','直接访问','Bot','社群','邀请','KOL/合作']
export function validConfig(c) {
  return !!c && MODES.includes(c.mode) && Array.isArray(c.steps) && c.steps.length >= 2 && c.steps.length <= 5 && c.steps.every(e=>EVENTS.includes(e)) && [7,14].includes(c.range) && [1,24,72].includes(c.hours) && SOURCES.includes(c.source) && ['all','1.5段','日内2段'].includes(c.strategy) && EVENTS.includes(c.initial) && EVENTS.includes(c.returning) && (c.pathStart===undefined||['all',...EVENTS].includes(c.pathStart)) && (c.pathDepth===undefined||[3,5,7].includes(c.pathDepth))
}
export function loadConfig(storage) {
  try { const value=JSON.parse(storage.getItem(KEY)); return validConfig(value)?value:null } catch { return null }
}
export function saveConfig(storage, config) {
  if (!validConfig(config)) throw new Error('配置无效')
  storage.setItem(KEY, JSON.stringify(config))
}
