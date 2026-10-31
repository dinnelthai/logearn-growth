'use strict';
// Immutable, bounded provenance labels for metric evidence. A source timestamp
// is never proof of complete ingestion, account linkage or current freshness.
// Reuse the audited tool contracts instead of a second analytics registry.
const {SOURCE_CONTRACTS}=require('./tools/sourceContracts');
const EVENT_METRICS=new Set(['active_users','new_users','returning_users',
 'activation_rate','d7','weekly_core']);
const REGISTRATION_METRICS=new Set(['registered_users']);
const REGISTRATION_EVENT_METRICS=new Set(['registration_activation_rate']);
const COMPOUND_METRICS=new Set(['registered_trade_conversion_rate','registered_user_journey']);
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?
 new Date(v).toISOString():null;
function metricContract(metricId,tool){
 if(tool!=='query_metrics'){
  const contract=SOURCE_CONTRACTS[tool];
  return contract?{sourceType:contract.sourceType,clock:contract.clock}:{
   sourceType:'unknown',clock:'unknown'};
 }
 if(EVENT_METRICS.has(metricId))
  return {sourceType:'hologres_observed_events',clock:'event_snapshot'};
 if(REGISTRATION_METRICS.has(metricId))
  return {sourceType:'account_creation',clock:'independent_registration'};
 if(REGISTRATION_EVENT_METRICS.has(metricId))
  return {sourceType:'registration_and_events',clock:'independent_registration_and_events'};
 if(COMPOUND_METRICS.has(metricId))
  return {sourceType:'registration_events_and_trades',clock:'independent_source_clocks'};
 return {sourceType:'unknown',clock:'unknown'};
}
function buildSourceMetadata({metricId,query,watermarks,coverage,scope}={}){
 const tool=query?.tool||null;
 const contract=metricContract(metricId,tool);
 const clocks=watermarks&&typeof watermarks==='object'?watermarks:{};
 const selected=tool==='get_seo_performance'?'searchConsole':
  tool==='get_content_growth'?'x':
  tool==='get_follower_quality'?'followerScan':
  tool==='get_kol_performance'?'kol':
  EVENT_METRICS.has(metricId)||['get_funnel','get_paths','get_retention',
   'get_channels','get_segments','check_data_quality'].includes(tool)?
    'events':null;
 // These are *reference* timestamps. GSC importedAt is not a Google
 // complete-through date, and an event snapshot as_of is not ingestion SLA.
 const referenceAt=selected?validTime(clocks[selected]):null;
 const reportedCompleteThrough=selected==='events'?
  validTime(clocks.eventsCompleteThrough):null;
 const source=scope&&typeof scope==='object'?scope:{source:'all'};
 return {
  sourceType:contract.sourceType,
  clock:contract.clock,
  scope:source.activityId||source.cohortId?'fixed_audience':
   source.source&&source.source!=='all'?'observed_source':'all',
  freshness:{
   status:'unverified',
   referenceAt,
   reportedCompleteThrough
  },
  coverageStatus:typeof coverage?.status==='string'&&
   /^[a-z][a-z0-9_-]{0,39}$/i.test(coverage.status)?
   coverage.status:'unknown'
 };
}
module.exports={buildSourceMetadata,metricContract};
