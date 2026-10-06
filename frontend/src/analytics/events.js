/** Shared event vocabulary for ingestion, paths and saved configurations.
 *  Source of truth: src/analytics/eventConfig.js
 *  This file re-exports the derived maps for backward compatibility.
 */
export { RAW_EVENT_TYPES, EVENT_LABELS, EVENT_META } from './eventConfig.js'
export const MODULES = { callouts: '喊单', signals: '信号榜单', popular: '热门', fomo: 'FOMO 热门' }
