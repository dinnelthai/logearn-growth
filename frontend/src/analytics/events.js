/** Shared event vocabulary for ingestion, paths and saved configurations.
 *  Source of truth: src/analytics/eventConfig.js
 *  This file re-exports the derived maps for backward compatibility.
 */
import {EVENT_LABELS as BASE_LABELS} from './eventConfig.js'
export { RAW_EVENT_TYPES, EVENT_META } from './eventConfig.js'
export const MODULES = { callouts: '喊单', signals: '信号榜单', popular: '热门', fomo: 'FOMO 热门' }

export const EVENT_LABELS = {logged_in_visit:'已登录访问',...Object.fromEntries(Object.entries(BASE_LABELS).filter(([key])=>key!=='module')),...MODULES}
