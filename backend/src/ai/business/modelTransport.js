'use strict';
// Positive, business-statistics-only transport for ALL model-bound evidence.
// Raw business data and immutable evidence are retained in existing stores;
// this projection is exclusively for outbound model messages.
const MAX_TEXT=260, MAX_GROUPS=12, MAX_DEPTH=7;
const numeric=new Set([
 'active_users','new_users','returning_users','registered_users','users','visits',
 'total','count','counts','events','sessions','transactions','traders','trades',
 'current','previous','fresh','resumed','continuing','absent','delta','change',
 'rate','score','eligible','activated','returned','pending','unobserved','unknown',
 'unknown_users','unmatched','converted','entered','total_entered','total_converted',
 'pending_count','drop_off_users','visitors','median_ms','p90_ms','window_ms',
 'median_conversion_ms','lag_ms','sampleSize','numerator','denominator','value',
 'first_at','latest_at','firstAt','latestAt','start','end','previousStart','previousEnd',
 'requested_end','previous_start','previous_end','as_of','asOf','generatedAt',
 'missing_id_events','linked_events','missing_source_events','started_events',
 'finished_events','source_rate','linked_rate','d7_users','chip_events',
 'login_users','volume_usd','cost_usd','volume','missing_values','excluded_trades',
 'users_current','users_previous','sessions_count','visits_count','total_users',
 'candidate_count','candidateCount','groups_count','mature','mature_users',
 'conversion_rate','previous_conversion_rate','total_conversion_rate',
 'activation_rate','activation_interval','median_age_days','retention_rate',
 'registeredUsers','clicks','impressions','ctr','position','likes','shares','comments',
 'duration_ms','value_usd','daily_count','day_count','sample_size','size',
 'periodStart','periodEnd','baseline','observed','target','changePct','percentage',
 'started','finished','missing_visit_context','missing_session','manual_requests',
 'requests_missing_visit','trade_unknown_visits','trade_records','trade_events',
 'trades_missing_visit','trade_records_missing_token','versioned_detail_events',
 'detail_events','available_count','unavailable_count','maturityDays','days',
 'inputTokens','outputTokens','totalTokens','knownCostUsd',
 'confidence_interval_low','confidence_interval_high','min','max',
 'week','weekStart','weekEnd','targetValue','effectivenessScore','evidenceCount'
]);
const flags=new Set(['available','historyComplete','history_complete','complete',
 'truncated','mature','known','coverageVerified','platformSync','conversionAttribution',
 'eventsComplete','hasMatureData','isComplete','partial','dataIncomplete']);
const categories=new Set(['source','device','version','app_version','user_stage',
 'entry_module','label','key','metric','metricId','unit','status','goal','focusGoal',
 'type','kind','priority','direction','platform','channel','date','timezone',
 'association','family','definitionVersion','ruleVersion','user_pool',
 'scope','qualityStatus','category','name','period','state','browser',
 'os','event_name','group','metricName','currency','trafficSource']);
const notes=new Set(['definition','warnings','warning','reason','error','interpretation',
 'priorityExplanation','scoreExplanation','summary','note','description',
 'notAvailableReason','coverageNote','qualityNote']);
const groups=new Set(['totals','days','growth','change','dimensions','channels','associations',
 'groups','cohorts','families','quality','coverage','diagnostic_coverage',
 'activation_interval','retention_interval','interval','stages','steps','drops',
 'product_chain','first_value','trade','d7','d30','registration','attribution',
 'funnels','paths','summary','sample','byCurrency','trends','rates','counts',
 'metrics','series','distribution','sources','bySource','period','filters',
 'sourceVersions','watermarks','goal','current','previous','weekly','northStar',
 'candidate','candidates','result','data','snapshots','snapshot']);
const ids=new Set(['snapshot_id','snapshotId','as_of','eventsCompleteThrough',
 'events_complete_through','cutoff','asOf','queryFingerprint']);
const privacy=/\b(?:user|session|wallet|account|token_visit|strategy_run|user_id|session_id|cookie|email|phone)[:=][^\s,;]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|\b0x[a-fA-F0-9]{35,}\b|\b(?:[0-9a-fA-F]{8}-){4}[0-9a-fA-F]{12}\b|https?:\/\/\S+|\b(?:\d[\s-]?){12,}\b/gi;
const safeText=(x,max=MAX_TEXT)=>typeof x==='string'
 ? x.slice(0,max).replace(privacy,'[detail withheld]') : null;
function primitive(v,key){
 if(v==null)return null; // unknown stays unknown, never becomes 0
 if(typeof v==='number')return Number.isFinite(v)&& (numeric.has(key)||key==='value')?v:undefined;
 if(typeof v==='boolean')return flags.has(key)?v:undefined;
 if(typeof v==='string'){
  if(notes.has(key))return safeText(v);
  if(categories.has(key)||ids.has(key))
   return v.length<=120?safeText(v,120):'[label omitted]';
  return undefined;
 }
 return undefined;
}
function statView(value,{depth=0,maxRows=MAX_GROUPS}={}){
 if(depth>MAX_DEPTH)return {omitted:'nested-depth'};
 if(Array.isArray(value)){
  const view=value.slice(0,maxRows).map(item=>statView(item,{depth:depth+1,maxRows})).filter(x=>x!==undefined);
  return view.length<value.length?{items:view,omittedItems:value.length-view.length}:view;
 }
 if(!value||typeof value!=='object')return value;
 const result={};let hidden=0;
 for(const [key,v] of Object.entries(value)){
  if(key==='rows'||key==='lists'||key==='members'||key==='userIds'||
    key==='user_ids'||key==='events'||key==='raw'||key==='payload'||
    key==='list_key'||key==='usersById'||key==='user_key'){
   hidden++;continue;
  }
  if(Array.isArray(v)){
   if(!groups.has(key)){hidden++;continue}
   result[key]=statView(v,{depth:depth+1,maxRows});continue;
  }
  if(v&&typeof v==='object'){
   if(!groups.has(key)){hidden++;continue}
   result[key]=statView(v,{depth:depth+1,maxRows});continue;
  }
  const safe=primitive(v,key);
  if(safe===undefined){hidden++;continue}
  result[key]=safe;
 }
 if(hidden)result.omittedNonStatisticalFields=hidden;
 return result;
}
function modelEvidence(row){
 if(!row||typeof row!=='object')return {value:null,warnings:['缺少证据结构']};
 return {
  id:typeof row.id==='string'?row.id:null,
  metricId:typeof row.metricId==='string'?row.metricId:null,
  definitionVersion:row.definitionVersion??null,
  unit:row.unit??null,
  value:typeof row.value==='number'||row.value==null?row.value??null:
   statView(row.value),
  numerator:row.numerator??null,denominator:row.denominator??null,
  sampleSize:row.sampleSize??null,
  period:statView(row.period||{}),
  filters:{source:safeText(row.filters?.scope?.source||row.filters?.source||'all',120)},
  sourceVersions:statView(row.sourceVersions||{}),
  watermarks:statView(row.watermarks||{}),
  coverage:statView(row.coverage||{status:'unknown'}),
  warnings:(row.warnings||[]).slice(0,6).map(s=>safeText(s))
 };
}
function modelContext(raw){
 const scope=raw.business?.scope||{};
 const evidence=Array.isArray(raw.evidence)?raw.evidence:[];
 const candidates=Array.isArray(raw.candidates)?raw.candidates:[];
 const capabilities=Array.isArray(raw.capabilities)?raw.capabilities:[];
 const context={
  transportVersion:'aggregated-business-v1',
  business:{
   product:'LogEarn',focusGoal:raw.focusGoal||raw.business?.focusGoal||null,
   scope:{source:safeText(scope.source||'all',120),
    fixedAudience:!!(scope.activityId||scope.cohortId)},
   question:safeText(raw.business?.question||'',400)
  },
  period:statView(raw.period||{}),
  snapshot:{
   id:typeof raw.snapshot?.id==='string'?safeText(raw.snapshot.id,120):null,
   asOf:raw.snapshot?.asOf||null,
   cutoff:raw.snapshot?.cutoff||null,
   historyComplete:raw.snapshot?.historyComplete===true,
   eventsCompleteThrough:raw.snapshot?.eventsCompleteThrough||null
  },
  definitions:statView(raw.definitions||{}),
  current:statView(raw.current||{}),
  previous:statView(raw.previous||{}),
  growth:statView(raw.growth||{}),
  weekly:statView(raw.weekly||{}),
  candidates:candidates.slice(0,12).map(x=>statView(x)),
  candidatesMeta:{total:candidates.length,shown:Math.min(candidates.length,12)},
  evidence:evidence.slice(0,40).map(modelEvidence),
  evidenceMeta:{total:evidence.length,shown:Math.min(evidence.length,40)},
  warnings:(raw.warnings||[]).slice(0,12).map(x=>safeText(x)),
  goal:raw.goal?{id:safeText(raw.goal.id||'',120),
   value:Number.isFinite(raw.goal.value)?raw.goal.value:null,
   deadline:raw.goal.deadline||null,priority:raw.goal.priority||null,
   version:raw.goal.version||null}:null,
  capabilities:capabilities.slice(0,18).map(x=>({
   id:x.id,description:safeText(x.description||'',150),
   inputSchema:x.inputSchema,
   supportedScopes:x.supportedScopes
  })),
  growthPlan:raw.growthPlan?statView(raw.growthPlan):null,
  omissions:{
   rawMembersOmitted:true,rawEventsOmitted:true,
   memoryAndManualActionsOmitted:true,
   note:'原始用户/事件明细及操作记录仅保存在业务库；模型仅接收聚合统计与可追溯证据ID，未知值不是零'
  }
 };
 return context;
}
module.exports={statView,modelEvidence,modelContext,safeText};
