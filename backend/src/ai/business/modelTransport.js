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
 'absolute','affected','gap','progress','omittedItems',
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
 'exposures','clicked','exposed_users','clicked_users','unmatched_clicks','missing_visit_clicks',
 'visitor_users','clicks','details','successes','day',
 'confidence_interval_low','confidence_interval_high','min','max',
 'week','weekStart','weekEnd','targetValue','effectivenessScore','evidenceCount',
 'observedAt','followers','followerChange','measuredPosts','engagementRate',
 'views','posts','replies','retweets','reposts','engagements',
 'viewCount','postCount','replyCount','retweetCount','repostCount',
 'likeCount','impressionCount','totalViews','totalPosts','medianViews',
 'replyRate','repostRate','likeRate','h24Views','h48Views',
 'registered','bound','inviters','analysis','strategy','used','trade','continued','nearby',
 'stored','next_generation','next_used','new_nearby','reinviters','participation_rate',
 'continuation_rate','output','observed_output','confirmed_new_registration_rate',
 'binding_rate','record_total','flows','success','failed','cancelled','conflict',
 // Channel and mature-retention results are aggregate counts, not row identities.
 'logged','token','submitted','succeeded','analysis_rate','strategy_rate','trade_rate',
 'source_conflicts','first_visit_users','eligible_users','retained_users',
 'pending_users','observed_returned_users','continuous_retained_users',
 'continuous_retention_rate','cohort_size','total_entered','total_converted',
 'requests','terminal_coverage','observed_completion_rate','success_rate',
 'click_users','record_total','currencyCount','receivedEntries','income_entries','roi',
 'measuredProfiles','profilesWithObservedUsers','profilesWithAnalysis',
 'profilesWithTrade','maxObservedUsers','observedAccounts','measuredPosts',
 'measuredImpressions','measuredEngagementRate','sampledPosts',
 'scannedRecords','analyzedRecords','reviewedRecords','records','reviewed','analyzed'
]);
const flags=new Set(['available','historyComplete','history_complete','complete',
 'truncated','mature','known','coverageVerified','platformSync','conversionAttribution',
 'eventsComplete','hasMatureData','isComplete','partial','dataIncomplete',
 'completion_available']);
const categories=new Set(['source','device','version','app_version','user_stage',
 'entry_module','label','key','metric','metricId','unit','status','goal','focusGoal',
 'type','kind','priority','direction','platform','channel','date','timezone',
 'association','family','definitionVersion','ruleVersion','user_pool',
 'scope','qualityStatus','category','name','period','state','browser',
 'coverage','quality','scene',
 'os','event_name','group','metricName','currency','trafficSource',
 'list_type','page_name']);
const notes=new Set(['definition','warnings','warning','reason','error','interpretation',
 'priorityExplanation','scoreExplanation','summary','note','description',
 'notAvailableReason','coverageNote','qualityNote']);
const groups=new Set(['totals','days','growth','change','dimensions','channels','associations',
 'groups','cohorts','families','versions','quality','coverage','diagnostic_coverage',
 'activation_interval','retention_interval','interval','stages','steps','drops',
 'product_chain','first_value','trade','d7','d30','registration','attribution',
 'exposure','entrance','entrance_breakdown','page_clicks_summary','retention_summary',
 'funnels','paths','pages','summary','sample','byCurrency','trends','rates','counts',
 'humanOperations','channelObservations','aiActions','timeline','warnings','samplePosts',
 'linkedKols','linkedActivityIds','costTotals','revenueTotals','evaluation','review',
 'metrics','series','distribution','sources','bySource','period','filters',
 'sourceVersions','watermarks','goal','current','previous','weekly','northStar',
 'contentSignals',
 'referral','conversion','global','window','retention',
 'candidate','candidates','result','data','snapshots','snapshot',
 'manual','official','economics']);
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
  const view=value.slice(0,maxRows).map(item=>typeof item==='string'?
   safeText(item):statView(item,{depth:depth+1,maxRows})).filter(x=>x!==undefined);
  return view.length<value.length?{items:view,omittedItems:value.length-view.length}:view;
 }
 if(!value||typeof value!=='object')return value;
 const result={};let hidden=0;
 for(const [key,v] of Object.entries(value)){
  if(key==='rows'||key==='lists'||key==='members'||key==='userIds'||
    key==='user_ids'||key==='events'||key==='raw'||key==='payload'||
    key==='list_key'||key==='usersById'||key==='user_key'||
    (key==='events'&&v&&typeof v==='object')){
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
  // A dimension bucket's textual category is meaningful business metadata,
  // but it is never an arbitrary row identity or account string.
  if(key==='value'&&typeof v==='string'&&
   (typeof value.current==='number'||typeof value.previous==='number'||
    typeof value.users==='number'||typeof value.visits==='number'||
    typeof value.exposures==='number')){
   result.value=safeText(v,80);
   continue;
  }
  const safe=primitive(v,key);
  if(safe===undefined){hidden++;continue}
  result[key]=safe;
 }
 if(hidden)result.omittedNonStatisticalFields=hidden;
 return result;
}
const numericFact=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function attachBusinessBrain(context,raw){
 const brain=require('./businessBrain');
 context.transportVersion='aggregated-business-v5';
 context.businessBrain=brain.buildBusinessBrainContext({
  focusGoal:raw.focusGoal||raw.business?.focusGoal||'activation'
 });
 context.operatingMemory=brain.projectOperatingMemory(
  Array.isArray(raw.memory)?raw.memory:[],{safeText,limit:3}
 );
 context.omissions.businessBrain='businessBrain 是版本化经营知识，不是数值证据；operatingMemory 仅覆盖已有AI建议与复盘记录，不代表全部运营活动。';
 const bytes=Buffer.byteLength(JSON.stringify(context),'utf8');
 if(bytes>22000)throw Error('Business Brain 与经营上下文合计超过22000字节预算；尚未调用付费模型');
 return context;
}

function externalModelEvidence(row){
 const raw=row.value&&typeof row.value==='object'?row.value:{};
 const entries=Array.isArray(raw.rankings)?raw.rankings:[];
 const rankings=entries.slice(0,12).map(x=>({
  keyword:safeText(x?.keyword||'',100),
  rank:Number.isSafeInteger(x?.rank)&&x.rank>0?x.rank:null,
  device:['desktop','mobile'].includes(x?.device)?x.device:null,
  status:['ranked','not_found','not_checked'].includes(x?.status)?x.status:'unknown',
  checkedAt:safeText(x?.checkedAt||'',80)
 }));
 return {id:row.id,metricId:'external_rank_snapshot',unit:'rank',
  external:{provider:safeText(row.external.provider,60),
   capabilityId:safeText(row.external.capabilityId,90),
   version:safeText(row.external.version,30),
   sourceType:safeText(row.external.sourceType,50),
   acquiredAt:safeText(row.external.acquiredAt,80),
   checkedAt:safeText(row.external.checkedAt||'',80),
   costStatus:safeText(row.external.costStatus||'unknown',40),
   truncated:row.external.truncated===true||entries.length>12},
  value:{status:safeText(raw.status||'unknown',40),
   checkedAt:safeText(raw.checkedAt||'',80),rankings,
   omittedRankings:Math.max(0,entries.length-rankings.length)},
  period:statView(row.period||{}),
  coverage:{status:safeText(row.coverage?.status||'unknown',40)},
  warnings:(row.warnings||[]).slice(0,6).map(s=>safeText(s))};
}

function modelEvidence(row){
 if(!row||typeof row!=='object')return {value:null,warnings:['缺少证据结构']};
 if(row.external)return externalModelEvidence(row);
 return {
  id:typeof row.id==='string'?row.id:null,
  metricId:typeof row.metricId==='string'?row.metricId:null,
  definitionVersion:typeof row.definitionVersion==='string'?safeText(row.definitionVersion,60):null,
  unit:typeof row.unit==='string'?safeText(row.unit,60):null,
  value:typeof row.value==='number'||row.value==null?row.value??null:
   row.value&&typeof row.value==='object'?statView(row.value):{omitted:'non-numeric-value'},
  numerator:numericFact(row.numerator),denominator:numericFact(row.denominator),
  sampleSize:numericFact(row.sampleSize),
  period:statView(row.period||{}),
  filters:{source:safeText(row.filters?.scope?.source||row.filters?.source||'all',120)},
  sourceVersions:{events:safeText(row.sourceVersions?.events||'',120),
   searchConsole:safeText(row.sourceVersions?.searchConsole||'',120),
   operatorRecords:safeText(row.sourceVersions?.operatorRecords||'',120)},
  watermarks:{events:safeText(row.watermarks?.events||'',120),
   eventsCompleteThrough:safeText(row.watermarks?.eventsCompleteThrough||'',120),
   trades:safeText(row.watermarks?.trades||'',120),
   registrations:safeText(row.watermarks?.registrations||'',120)},
  coverage:statView(row.coverage||{status:'unknown'}),
  warnings:(row.warnings||[]).slice(0,6).map(s=>safeText(s))
 };
}
function modelQuery(query,{extended=false}={}){
 const input=query?.input||{};
 const result={tool:typeof query?.tool==='string'?safeText(query.tool,90):null,
  ...(query?.kind?{kind:safeText(query.kind,40)}:{}),
  input:{
   ...(Number.isSafeInteger(input.start)?{start:input.start}:{}),
   ...(Number.isSafeInteger(input.end)?{end:input.end}:{}),
   ...(Number.isSafeInteger(input.hours)?{hours:input.hours}:{}),
   ...(Array.isArray(input.metrics)?{metrics:input.metrics.slice(0,10).map(x=>safeText(x,80))}:{}),
   ...(Array.isArray(input.steps)?{steps:input.steps.slice(0,8).map(x=>safeText(x,80))}:{}),
   ...(extended&&Array.isArray(input.dimensions)?{dimensions:input.dimensions.slice(0,8).map(x=>safeText(x,80))}:{}),
   ...(extended&&typeof input.initial==='string'?{initial:safeText(input.initial,80)}:{}),
   ...(extended&&typeof input.returning==='string'?{returning:safeText(input.returning,80)}:{}),
   ...(extended&&Number.isSafeInteger(input.limit)?{limit:input.limit}:{}),
   ...(input.scope?.source?{scope:{source:safeText(input.scope.source,120)}}:{})
  }};
 if(extended&&extended!=='legacy'){
  if(input.filters&&typeof input.filters==='object'&&!Array.isArray(input.filters)){
   const filters={};
   if(typeof input.filters.source==='string')filters.source=safeText(input.filters.source,120);
   if(Object.keys(filters).length)result.input.filters=filters;
  }
  const represented=new Set(Object.keys(result.input));
  const omitted=Object.keys(input).filter(key=>!represented.has(key)).sort();
  if(input.scope&&typeof input.scope==='object')for(const key of Object.keys(input.scope))
   if(key!=='source')omitted.push('scope.'+key);
  if(input.filters&&typeof input.filters==='object')for(const key of Object.keys(input.filters))
   if(key!=='source')omitted.push('filters.'+key);
  if(omitted.length)result.input.omittedFields=omitted.map(key=>safeText(key,80)).slice(0,30);
 }
 return result;
}
// Identity is computed from the original query, never its lossy display view.
function investigationKey(query){
 const normalize=value=>Array.isArray(value)?value.map(normalize):
  value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort()
   .map(key=>[key,normalize(value[key])])):value;
 return JSON.stringify(normalize(query));
}
// Model-only transport v2. Full evidence and input schemas remain in the
// immutable context/registry. A reference to shared provenance is explicit.
function compactCapabilities(capabilities){
 return capabilities.map(cap=>{
  const props=cap.inputSchema?.properties||{};
  return {
   id:cap.id,description:safeText(cap.description||'',110),
   supportedScopes:cap.supportedScopes,
   required:cap.inputSchema?.required||[],
   input:Object.fromEntries(Object.entries(props).slice(0,18).map(([key,field])=>[
    key,{type:field.type||'unknown',
     ...(Array.isArray(field.enum)?{values:field.enum.slice(0,16)}:{}),
     ...(Number.isFinite(field.minimum)?{min:field.minimum}:{}),
     ...(Number.isFinite(field.maximum)?{max:field.maximum}:{})}
   ]))
  };
 });
}
function shareEvidenceProvenance(context){
 const shared={};
 for(const key of ['period','sourceVersions','watermarks','coverage']){
  const counts=new Map();
  for(const e of context.evidence){
   if(e[key]==null)continue;
   const encoded=JSON.stringify(e[key]);
   const count=counts.get(encoded)||{value:e[key],count:0};
   count.count++;counts.set(encoded,count);
  }
  const popular=[...counts.values()].sort((a,b)=>b.count-a.count)[0];
  if(!popular||popular.count<3||Buffer.byteLength(JSON.stringify(popular.value),'utf8')<20)continue;
  shared[key]=popular.value;
  for(const e of context.evidence){
   if(JSON.stringify(e[key])!==JSON.stringify(popular.value))continue;
   delete e[key];
   e.shared??=[];e.shared.push(key);
  }
 }
 if(Object.keys(shared).length)context.sharedEvidence=shared;
}
// Weekly growth v3 can expose 12 skills and more than 16 read-only tools.
// Prefer compressing duplicated schemas and narrative over deleting observations.
// All fields in this projection have already passed the modelEvidence allowlist.
// Full source values and authorized schemas stay in the immutable backend journal.
function compactWeeklyValue(value){
 if(value===null||typeof value==='number')return value;
 if(!value||typeof value!=='object')return null;
 const result={};
 const allowed=['metrics','totals','summary','counts','global','conversion',
  'retention','trade','product_chain'];
 const extract=(object,limit)=>{
  if(!object||typeof object!=='object'||Array.isArray(object))return null;
  const entries=Object.entries(object).filter(([_,v])=>
   typeof v==='number'&&Number.isFinite(v)).slice(0,limit);
  return entries.length?Object.fromEntries(entries):null;
 };
 for(const name of allowed){
  const numbers=extract(value[name],name==='metrics'?10:6);
  if(numbers)result[name]=numbers;
 }
 const own=extract(value,8);
 if(own)Object.assign(result,own);
 if(typeof value.available==='boolean')result.available=value.available;
 if(typeof value.status==='string')result.status=safeText(value.status,30);
 if(!Object.keys(result).length)return {detailOmitted:true};
 return result;
}
function compactWeeklyEvidence(e,{briefValue=false}={}){
 const out={id:e.id,metricId:e.metricId,unit:e.unit,value:briefValue?
  compactWeeklyValue(e.value):e.value,
  numerator:e.numerator,denominator:e.denominator,sampleSize:e.sampleSize,
  period:e.period,coverage:e.coverage,
  ...(e.sourceVersions?{sourceVersions:e.sourceVersions}:{}),
  ...(e.watermarks?{watermarks:e.watermarks}:{})};
 if(e.warnings?.length)out.warnings=e.warnings.slice(0,1);
 // Keep explicit unknown measurement values; prune only missing metadata.
 return Object.fromEntries(Object.entries(out).filter(([k,v])=>
  k==='value'||v!==null&&v!==undefined&&
  !(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length)));
}
function fitWeeklyModelContext(context,raw,limit=22000){
 const size=()=>Buffer.byteLength(JSON.stringify(context),'utf8');
 if(size()<=limit)return;
 const originalBytes=size();
 // Non-executing skills are already covered by weeklyCoverage. Their reasons
 // and repeated tool descriptions are redundant to the model.
 context.growthPlan=context.growthPlan?{steps:context.growthPlan.steps.map(s=>({
  id:s.id,tools:s.tools.slice(0,3)
 }))}:null;
 context.capabilities=context.capabilities.map(x=>({
  id:x.id,description:safeText(x.description||'',55),
  required:x.required,input:x.input,
  ...(x.supportedScopes?.length?{supportedScopes:x.supportedScopes}: {})
 }));
 if(context.weeklyCoverage)context.weeklyCoverage=context.weeklyCoverage.map(x=>({
  id:x.id,status:x.status,evidenceIds:x.evidenceIds,
  ...(x.reason?{reason:safeText(x.reason,60)}:{})
 }));
 context.definitions=Object.fromEntries(Object.entries(context.definitions||{})
  .sort(([a],[b])=>{
   const order=['active_users','new_users','returning_users'];
   const rank=id=>order.includes(id)?order.indexOf(id):order.length;
   return rank(a)-rank(b);
  })
  .slice(0,8).map(([k,v])=>[k,safeText(v,110)]));
 context.candidates=[];context.candidatesMeta.shown=0;
 context.growth={change:context.growth.change||{},
  channels:Array.isArray(context.growth.channels)?
   context.growth.channels.slice(0,4):[],
  coverage:context.growth.coverage||{status:'unknown'}};
 context.warnings=context.warnings.slice(0,3);
 context.omissions.weeklyCompression='旧报告的原始统计、工具模式和证据仍保留在只读归档；未传入模型的内容未知，不是0';
 // Select first owner-scoped evidence by reference and KPI importance, not
 // ingestion order, which otherwise pushes earlier-week and SEO facts out.
 const original=Array.isArray(raw.evidence)?raw.evidence:[];
 const moduleRows=raw.weeklyCoverage?.modules||[];
 const firstModuleIds=moduleRows.map(x=>x.evidenceIds?.[0]).filter(Boolean);
 const extraModuleIds=new Set(moduleRows.flatMap(x=>
  (x.evidenceIds||[]).slice(1,2)));
 const evidenceById=new Map(original.map(x=>[x.id,x]));
 const kpi=['active_users','new_users','returning_users'];
 // At most two period-identified observations per KPI. Otherwise a
 // long series of active_users points can crowd SEO and other modules out.
 const kpiRows=[];
 for(const metric of kpi){
  for(const [start,end] of [[raw.period?.start,raw.period?.end],
    [raw.period?.previousStart,raw.period?.previousEnd]]){
   if(!Number.isFinite(start)||!Number.isFinite(end))continue;
   const target=start===raw.period.start&&end===raw.period.end?
    raw.current?.totals?.[metric]:raw.previous?.totals?.[metric];
   const match=x=>x.metricId===metric&&
    x.period?.start===start&&x.period?.end===end;
   const found=original.find(x=>match(x)&&
    typeof x.value==='number'&&Number.isFinite(x.value)&&
    (typeof target==='number'?x.value===target:true))||
    original.find(x=>match(x)&&typeof x.value==='number'&&Number.isFinite(x.value));
   if(found)kpiRows.push(found);
  }
 }
 const order=[
  ...kpiRows,
  ...firstModuleIds.map(id=>evidenceById.get(id)).filter(Boolean),
  ...original.filter(x=>x.metricId==='seo_search'),
  ...original.filter(x=>extraModuleIds.has(x.id)),
  ...original.filter(x=>kpi.includes(x.metricId)),
  ...original
 ];
 const seen=new Set();
 const priority=[];
 for(const row of order){
  if(typeof row?.id!=='string'||seen.has(row.id))continue;
  seen.add(row.id);priority.push(row);
  if(priority.length>=24)break;
 }
 const project=(max,brief)=>{
  context.evidence=priority.slice(0,max).map(row=>
   compactWeeklyEvidence(modelEvidence(row),{briefValue:brief}));
  delete context.sharedEvidence;
  shareEvidenceProvenance(context);
  context.evidenceMeta.shown=context.evidence.length;
 };
 project(18,false);
 if(size()>limit)project(18,true);
 if(size()>limit){
  // Provenance remains in archived evidence. Keep each module's observed
  // numbers, evidence ID, weekly period and coverage, but fold repeated
  // watermarks/version strings instead of dropping whole modules first.
  context.evidence=context.evidence.map(e=>Object.fromEntries(Object.entries({
   id:e.id,metricId:e.metricId,unit:e.unit,value:e.value,
   numerator:e.numerator,denominator:e.denominator,sampleSize:e.sampleSize,
   period:e.period,shared:e.shared,
   coverage:e.coverage?{status:e.coverage.status,
    periodMatched:e.coverage.periodMatched}:undefined,
   warnings:e.warnings?.slice(0,1).map(w=>safeText(w,85))
  }).filter(([_,v])=>v!==undefined&&v!==null)));
  context.omissions.weeklyProvenance='重复版本号及水位明细留存在证据档案；本次模型仅使用已展示的日期、覆盖和数值，未知不能按0处理';
 }
 if(size()>limit){
  // Query authorization is enforced by the registry, not by repeated scopes
  // in every model-visible tool description. Keep callable input fields.
  context.capabilities=context.capabilities.map(x=>({
   id:x.id,description:safeText(x.description||'',26),
   required:x.required,input:x.input
  }));
 }
 if(size()>limit){
  context.current={totals:context.current.totals||{},
   coverage:context.current.coverage||{status:'unknown'}};
  context.previous={totals:context.previous.totals||{},
   coverage:context.previous.coverage||{status:'unknown'}};
  context.weekly={};
  context.growth={coverage:context.growth.coverage||{status:'unknown'}};
  project(14,true);
 }
 // Evidence size is variable: remove from the tail while keeping the weekly
 // module directory, source labels, tool inputs and core KPI aggregates.
 while(size()>limit&&context.evidence.length>0){
  context.evidence.pop();
  context.evidenceMeta.shown=context.evidence.length;
 }
 if(size()>limit){
  context.capabilities=context.capabilities.map(x=>({
   id:x.id,required:x.required,
   input:Object.fromEntries(Object.entries(x.input||{})
    .filter(([key])=>['start','end','scope','limit','metrics','steps','hours'].includes(key))
    .map(([key,v])=>[key,{type:v.type}]))
  }));
  context.weeklyCoverage=context.weeklyCoverage?.map(x=>({
   id:x.id,status:x.status,evidenceIds:x.evidenceIds?.slice(0,1)
  }));
 }
 if(size()>limit){
  context.definitions={};
  context.warnings=[];
  context.growthPlan={steps:context.growthPlan?.steps.map(x=>({id:x.id}))||[]};
 }
 context.omissions.weeklyModelInput={
  originalBytes,shownEvidence:context.evidence.length,
  availableEvidence:original.length,
  note:'为满足22KB传输上限压缩了重复工具说明和部分统计维度；未展示的来源不代表值为零'
 };
 // The metadata itself consumes bytes; trim further safely if necessary.
 while(size()>limit&&context.evidence.length>0){
  context.evidence.pop();context.evidenceMeta.shown=context.evidence.length;
  context.omissions.weeklyModelInput.shownEvidence=context.evidence.length;
 }
}
function modelContext(raw,{transportVersion='v1',reviewRevision=0,reserveBytes=0}={}){
 if(!['v1','v2','v3','v4','v5'].includes(transportVersion))throw Error('不支持的模型上下文版本');
 if(!Number.isSafeInteger(reserveBytes)||reserveBytes<0||reserveBytes>12000)throw Error('上下文预留预算无效');
 if(transportVersion==='v5'){
  const memoryRows=Array.isArray(raw.memory)?Math.min(3,raw.memory.length):0;
  const reserve=reserveBytes||7000+memoryRows*900;
  const base=raw.weeklyCoverage?.version==='weekly-coverage-v1'?
   require('./weeklyContextV4').buildWeeklyContextV4(raw,{
    modelEvidence,compactCapabilities,safeText,reviewRevision,reserveBytes:reserve
   }):
   modelContext(raw,{transportVersion:'v3',reviewRevision,reserveBytes:reserve});
  return attachBusinessBrain(base,raw);
 }
 if(transportVersion==='v4')return require('./weeklyContextV4').buildWeeklyContextV4(
  raw,{modelEvidence,compactCapabilities,safeText,reviewRevision});
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
  definitions:Object.fromEntries(Object.entries(raw.definitions||{}).slice(0,20)
   .filter(([id,text])=>/^[a-z][a-z0-9_]{1,70}$/.test(id)&&typeof text==='string')
   .map(([id,text])=>[id,safeText(text,240)])),
  current:statView(raw.current||{}),
  previous:statView(raw.previous||{}),
  growth:statView(raw.growth||{}),
  weekly:statView(raw.weekly||{}),
  weeklyCoverage:raw.weeklyCoverage?.version==='weekly-coverage-v1'?
   require('../growth/weeklyCoverage').modelCoverage(raw.weeklyCoverage):null,
  weeklySources:raw.weeklySources?{
    seo:{status:safeText(raw.weeklySources.seo?.status||'unavailable',32),
      periodMatched:raw.weeklySources.seo?.periodMatched===true,
      evidenceIds:(raw.weeklySources.seo?.evidenceIds||[]).slice(0,4).filter(id=>typeof id==='string'),
      range:raw.weeklySources.seo?.range||null},
    note:'GSC 来源可能使用 PT 日期，与曼谷业务周不同时只能参考趋势'
  }:null,
  weeklyOperations:raw.weeklyOperations&&typeof raw.weeklyOperations==='object'?{
   source:'saved-workspace-aggregate',
   observedAt:Number.isSafeInteger(raw.weeklyOperations.observedAt)?raw.weeklyOperations.observedAt:null,
   ...Object.fromEntries(['goalsCount','newProblemCount','unresolvedCount','dataQualityCount',
    'newActionCount','executedActionCount','reviewedActionCount','pendingActionCount']
    .map(key=>[key,Number.isSafeInteger(raw.weeklyOperations[key])&&raw.weeklyOperations[key]>=0?
      raw.weeklyOperations[key]:null])),
   limitations:'仅已保存的工作台聚合记录，无法证明全部运营动作或全站转化；未解决/待办为生成时状态'
  }:null,
  candidates:candidates.slice(0,12).map(x=>statView(x)),
  candidatesMeta:{total:candidates.length,shown:Math.min(candidates.length,12)},
  evidence:evidence.slice(0,40).map(modelEvidence),
  evidenceMeta:{total:evidence.length,shown:Math.min(evidence.length,40)},
  warnings:(raw.warnings||[]).slice(0,12).map(x=>safeText(x)),
  goal:raw.goal?{id:safeText(raw.goal.id||'',120),
   value:Number.isFinite(raw.goal.value)?raw.goal.value:null,
   deadline:raw.goal.deadline||null,priority:raw.goal.priority||null,
   version:raw.goal.version||null}:null,
  capabilities:capabilities.slice(0,raw.weeklyCoverage?.version==='weekly-coverage-v1'?28:18).map(x=>({
   id:x.id,description:safeText(x.description||'',150),
   inputSchema:x.inputSchema,
   supportedScopes:x.supportedScopes
  })),
  growthPlan:Array.isArray(raw.growthPlan?.steps)?
   {steps:raw.growthPlan.steps.slice(0,raw.weeklyCoverage?.version==='weekly-coverage-v1'?12:8).map(step=>({
    id:safeText(raw.weeklyCoverage?.version==='weekly-coverage-v1'?
     (step.skillId||step.id||''):(step.id||''),120),
    tools:Array.isArray(step.tools)?step.tools.slice(0,8)
      .map(tool=>safeText(tool,100)):[],
    reason:safeText(step.reason||'',160)
   }))}:null,
  omissions:{
   rawMembersOmitted:true,rawEventsOmitted:true,
   memoryAndManualActionsOmitted:true,
   note:'原始用户/事件明细及操作记录仅保存在业务库；模型仅接收聚合统计与可追溯证据ID，未知值不是零'
  }
 };
 if(raw.reviewContextVersion===1){
  context.review={
   suggestion:Object.fromEntries(['problem','hypothesis','action','expectedImpact'].map(k=>[k,safeText(raw.suggestion?.[k]||'',260)])),
   scope:{source:safeText(raw.suggestion?.scope?.source||'all',120)},
   periods:raw.periods,
   metricChanges:raw.metricChanges,
   baseline:statView(raw.baseline||{}),effect:statView(raw.effect||{}),
   note:'执行前后观察不证明因果；缺失指标保持未知。'
  };
 }
 if([1,2].includes(raw.reviewLessonsVersion)&&raw.focusGoal==='activation'){
  context.reviewLessons=(raw.growthPlan?.experienceFeedback||[]).slice(0,8).map(({metric,effectiveReviews,ineffectiveReviews})=>({metric,observedImproved:effectiveReviews,observedNotImproved:ineffectiveReviews}));
  context.omissions.reviewLessons='仅为同范围历史复盘汇总；观察结果不证明因果。未改善时检验新假设，不能直接重复旧行动。';
 }
 if(raw.reviewLessonsVersion===2&&raw.focusGoal==='activation'&&context.growthPlan){
  context.growthPlan.steps=context.growthPlan.steps.map((step,i)=>({ ...step,
   id:safeText(raw.growthPlan.steps[i].skillId||step.id,120),
   investigation:safeText(raw.growthPlan.steps[i].investigation||'',260)
  }));
 }
 if(transportVersion==='v2'||transportVersion==='v3'){
  context.transportVersion='aggregated-business-'+transportVersion;
  // Do not discard metric values, provenance or authorized tools. Compress
  // repeated safe metadata, never raw business rows or mutable credentials.
  context.capabilities=compactCapabilities(context.capabilities);
  shareEvidenceProvenance(context);
  context.omissions.sharedEvidenceSemantics='证据项 shared 引用 sharedEvidence 同名字段；缺省且未引用表示来源未提供，不得按零或已验证处理';
  if(transportVersion==='v3'){
   // Transport-only optimization: prune null/empty provenance containers.
   // Explicit metric values (including unknown nulls) and all provenance
   // supplied by the source remain intact, with shared references preserved.
   const prune=o=>{
    if(Array.isArray(o))return o.map(prune);
    if(o==null||typeof o!=='object')return o;
    return Object.fromEntries(Object.entries(o).filter(([key,value])=>
     key==='value'||(value!==null&&value!==''&&
       !(typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value).length)))
     .map(([key,value])=>[key,prune(value)]));
   };
   context.evidence=context.evidence.map(prune);
   context.omissions.emptyEvidenceMetadata='省略空元数据不表示观察为零；未提供的值一律未知';
  }
 }
 const limit=22000-reserveBytes;
 if(transportVersion==='v3'&&raw.weeklyCoverage?.version==='weekly-coverage-v1')
  fitWeeklyModelContext(context,raw,limit);
 // Strict transport byte cap for the first model message, independent of
 // the multilingual token preflight. Do not hide unknown data as zeros.
 const fits=()=>Buffer.byteLength(JSON.stringify(context),'utf8')<=limit;
 if(!fits()){
  context.evidence=context.evidence.slice(0,18);
  if(transportVersion!=='v1')shareEvidenceProvenance(context);
  context.evidenceMeta.shown=context.evidence.length;
  context.candidates=context.candidates.slice(0,6);
  context.candidatesMeta.shown=context.candidates.length;
  context.growth={change:context.growth.change||{},
   channels:Array.isArray(context.growth.channels)?
    context.growth.channels.slice(0,6):[],
   quality:context.growth.quality||{},
   coverage:context.growth.coverage||{status:'unknown'}};
  context.warnings=context.warnings.slice(0,6);
  context.omissions.additionalAggregatesOmitted=true;
 }
 if(!fits()){
  context.evidence=context.evidence.slice(0,10).map(e=>({
   id:e.id,metricId:e.metricId,definitionVersion:e.definitionVersion,
   unit:e.unit,value:typeof e.value==='number'||e.value==null?e.value:null,
   numerator:e.numerator,denominator:e.denominator,
   sampleSize:e.sampleSize,period:e.period,shared:e.shared,
   coverage:e.coverage,watermarks:e.watermarks,
   warnings:['统计维度已缩略，原始证据保存在业务系统']}));
  context.evidenceMeta.shown=context.evidence.length;
  context.capabilities=context.capabilities.map(x=>transportVersion!=='v1'?
   {id:x.id,description:x.description,input:x.input,required:x.required,
    supportedScopes:x.supportedScopes}:
   {id:x.id,description:x.description,inputSchema:x.inputSchema});
  context.current={totals:context.current.totals||{}};
  context.previous={totals:context.previous.totals||{}};
  context.warnings=context.warnings.slice(0,4);
 }
 if(!fits())throw Error('聚合模型上下文仍超出22000字节预算；需要缩小业务期间或来源');
 return context;
}
module.exports={statView,modelEvidence,modelContext,modelQuery,investigationKey,safeText,compactCapabilities};
