/**
 * Internal analytics type ↔ raw event_name mapping.
 * Keep in sync with frontend/src/analytics/eventConfig.js (subset used by metrics).
 */
const RAW_TO_TYPE = {
  app_opened_unauthenticated:'app_open',login_button_clicked:'login_click',wallet_connect_submitted:'wallet_connect_submitted',wallet_connect_succeeded:'wallet_connected',wallet_connect_failed:'wallet_connect_failed',logout:'logout',page_visit_ended:'page_end',page_viewed:'page_view',token_detail_tab_switched:'token_tab',search_performed:'search',holders_analysis_viewed:'holders',invite_page_entered:'invite_page',limit_order_created:'limit_order',strategy_stopped:'strategy_stopped',
  login_succeeded: 'login',
  token_detail_viewed: 'token',
  ranking_token_clicked: 'token_click',
  token_opened: 'token_click',
  callout_card_clicked: 'callout_click',
  strategy_started: 'ai',
  strategy_result_generated: 'strategy_result',
  signal_viewed: 'signal_view',
  strategy_signal_viewed: 'signal_view',
  chip_analysis_viewed: 'chip',
  chip_analysis_drilldown: 'chip',
  trade_submitted: 'trade_submitted',
  trade_succeeded: 'trade',
  trade_failed: 'trade_failed',
  first_visit_captured: 'first_visit',
  share_button_clicked: 'share_click',
  share_completed: 'share_complete',
  invite_link_visited: 'invite_visit',
  module_viewed: 'module', // resolved via properties.module when needed
}

const LOGIN_EVIDENCE_RAWS = require('../../../frontend/src/analytics/loginEvidence.json')
const TYPE_TO_RAWS = {
  login_verified: LOGIN_EVIDENCE_RAWS,
  app_open:['app_opened_unauthenticated'],login_click:['login_button_clicked'],wallet_connect_submitted:['wallet_connect_submitted'],wallet_connected:['wallet_connect_succeeded'],wallet_connect_failed:['wallet_connect_failed'],logout:['logout'],page_end:['page_visit_ended'],page_view:['page_viewed'],token_tab:['token_detail_tab_switched'],search:['search_performed'],holders:['holders_analysis_viewed'],invite_page:['invite_page_entered'],limit_order:['limit_order_created'],strategy_stopped:['strategy_stopped'],
  login: ['login_succeeded'],
  token: ['token_detail_viewed'],
  token_click: ['ranking_token_clicked', 'token_opened'],
  callout_click: ['callout_card_clicked'],
  ai: ['strategy_started'],
  strategy_result: ['strategy_result_generated'],
  signal_view: ['signal_viewed', 'strategy_signal_viewed'],
  chip: ['chip_analysis_viewed', 'chip_analysis_drilldown'],
  chip_drilldown: ['chip_analysis_drilldown'],
  trade_submitted: ['trade_submitted'],
  trade: ['trade_succeeded'],
  trade_failed: ['trade_failed'],
  first_visit: ['first_visit_captured'],
  share_click: ['share_button_clicked'],
  share_complete: ['share_completed'],
  invite_visit: ['invite_link_visited'],
  callouts: ['module_viewed'],
  signals: ['module_viewed'],
  popular: ['module_viewed'],
  fomo: ['module_viewed'],
}

const MODULES = new Set(['callouts', 'signals', 'popular', 'fomo'])

/** Types included in behavior-path analysis (excludes strategy_heartbeat). */
const PATH_TYPES = [
  'app_open','login_click','wallet_connect_submitted','wallet_connected','wallet_connect_failed','logout','page_view','token_tab','search','holders','invite_page','limit_order','strategy_stopped',
  'login', 'token', 'token_click', 'callout_click', 'ai', 'strategy_result', 'signal_view',
  'chip', 'chip_drilldown', 'trade_submitted', 'trade', 'trade_failed',
  'first_visit', 'share_click', 'share_complete', 'invite_visit',
  'callouts', 'signals', 'popular', 'fomo',
]

function rawNamesForTypes(types) {
  const names = new Set()
  for (const t of types) {
    for (const raw of TYPE_TO_RAWS[t] || []) names.add(raw)
    if (MODULES.has(t)) names.add('module_viewed')
  }
  return [...names]
}

function internalType(eventName, properties = {}) {
  if (eventName === 'module_viewed') {
    return MODULES.has(properties.module) ? properties.module : null
  }
  return RAW_TO_TYPE[eventName] || null
}

module.exports = { LOGIN_EVIDENCE_RAWS, RAW_TO_TYPE, TYPE_TO_RAWS, MODULES, PATH_TYPES, rawNamesForTypes, internalType }
