const {randomUUID,createHash}=require('node:crypto');
const {resolveScope,owner}=require('../scope'),{describeMetric,listMetrics}=require('../metricRegistry');
const {makeEvidence,fingerprint}=require('../evidence');
const {validateRange}=require('../../../analytics/businessPriorities');
const {statView}=require('../modelTransport');
const {createCapabilityCatalog}=require('./capabilityCatalog');
const {loginSummary,economicsSummary,kolSummary,contentSummary,followerSummary}=require('./weeklyModuleSummaries');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const definitions={
 query_metrics:{metric:'active_users',adapter:'metrics',scopes:['source'],description:'现有北极星、增长、周核心指标'},
 get_funnel:{metric:'funnel',adapter:'funnel',description:'顺序漏斗；仅支持 token、chip、drill、ai、trade、logged_in_visit、login、visit 步骤；来源过滤使用 scope.source 而不是 filters.source；区分成熟、待成熟与缺失关联'},
 get_paths:{metric:'paths',adapter:'paths',description:'行为路径与观测限制'},
 get_product_chain:{metric:'product_chain',adapter:'value-diagnostics',description:'详情、分析成功与数据库真实交易链'},
 get_retention:{metric:'retention',adapter:'retention',description:'成熟留存队列，未成熟保持未知'},
 get_channels:{metric:'channels',adapter:'channels',description:'来源渠道分解'},
 get_segments:{metric:'segments',adapter:'segments',description:'固定人群的现有分群分析'},
 get_activity:{metric:'activities',adapter:'activities',description:'活动固定名单和既有成员事实'},
 get_operations_timeline:{metric:'activities',adapter:'operations-timeline',scopes:['source'],description:'只读汇总人工活动、KOL合作、手工内容、任务、X/GSC/KOL观察与AI建议；不同来源分层，不建立平行CRM'},
 get_channel_economics:{metric:'collaboration_economics',adapter:'economics',scopes:['source'],description:'仅owner CRM/KOL合作账本收支，按币种列示；不是平台交易手续费或全平台收入，未记录金额保持未知'},
 check_data_quality:{metric:'quality',adapter:'tracking-audit',scopes:['source'],description:'埋点覆盖诊断，不将水位ID解释成强一致快照'},
 get_seo_performance:{metric:'seo_search',adapter:'seo-performance',scopes:['source'],description:'只读读取已同步的 Search Console 最终聚合快照或有限手动导入；日期可能不匹配、查询覆盖不完整'},
 get_kol_performance:{metric:'kol_performance',adapter:'kol-performance',scopes:['source'],description:'复用已有 KOL CRM 归组和真实观察行为；不等于因果归因'},
 get_content_growth:{metric:'content_growth',adapter:'content-growth',scopes:['source'],description:'只读已采集的LogEarn双账号X内容：近30天有界公开浏览、回复/转发/点赞率、快照和覆盖；人工登记独立，非推荐分及转化归因'},
 get_follower_quality:{metric:'follower_quality',adapter:'follower-quality',scopes:['source'],description:'只读粉丝采集分类汇总，无个人资料外传，数据覆盖可能不足'},
 get_referral:{metric:'referral',adapter:'referral',scopes:['source'],description:'累计推荐绑定关系与成熟观察；默认全量截至快照，不代表当前报告期间；推荐绑定不等于新增获客'},
 get_login_conversion:{metric:'login_conversion',adapter:'login-conversion',scopes:['source'],description:'已有登录转化聚合，待确认与异常单列'},
 get_invite_conversion:{metric:'invite_conversion',adapter:'invite-conversion',scopes:['source'],description:'已有邀请链接转化与注册关系事实；不推断因果'}
};
const fields=['scope','start','end','metrics','dimensions','filters','steps','hours','initial','returning','limit','cursor','siteUrl'];
const inputSchema={type:'object',additionalProperties:false,properties:Object.fromEntries(fields.map(k=>[k,{type:['start','end','hours','limit'].includes(k)?'integer':['metrics','dimensions','steps'].includes(k)?'array':['scope','filters'].includes(k)?'object':'string'}]))};
function productChainSummary(payload){
 const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj?.[k]!==undefined).map(k=>[k,obj[k]]));
 const chain=payload.product_chain||{};
 return {product_chain:{...pick(chain,['visits','users','pending','quality','window_ms','coverage','definition']),
  stages:(chain.stages||[]).slice(0,10).map(row=>pick(row,['label','visits','users'])),
  drops:(chain.drops||[]).slice(0,10).map(row=>pick(row,['from','to','unknown','unknown_users','eligible','visits','users','rate']))},
  first_value:pick(payload.first_value,['available','entered','eligible','converted','pending','unobserved','rate','median_ms','p90_ms','window_ms']),
  // Add small, meaningful adjacent aggregate evidence. Individual entrance
  // visits, token addresses and the unlimited dimensions remain private.
  exposure:pick(payload.exposure,['available','exposures','clicked','exposed_users',
    'clicked_users','unmatched_clicks','rate']),
  entrance:pick(payload.entrance,['missing_visit_clicks','completion_available']),
  entrance_breakdown:(payload.entrance?.rows||[]).slice(0,6)
    .map(row=>pick(row,['value','visits','details','successes','pending','rate'])),
  page_clicks_summary:(payload.page_clicks?.rows||[]).slice(0,6)
    .map(row=>pick(row,['list_type','page_name','visitor_users','clicked_users',
      'clicks','unmatched_clicks','rate'])),
  retention_summary:(payload.retention||[]).slice(0,3)
    .map(row=>pick(row,['day','eligible','returned','pending','rate'])),
  coverage:payload.coverage,definition:payload.definition,
  warnings:['产品链路仅提供总体统计；维度和用户级明细未发送给模型']};
}
function operationsTimelineSummary(payload){
 const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row?.[k]!==undefined).map(k=>[k,row[k]]));
 const opaqueRef=value=>'record:'+createHash('sha256').update(String(value)).digest('hex').slice(0,16);
 const human=(payload.humanOperations||[]).slice(0,30).map(row=>{
  const relatedActivityRefs=Array.isArray(row.linkedActivityIds)?
   row.linkedActivityIds.slice(0,8).map(id=>opaqueRef('activity:'+String(id).slice(0,100))):[];
  return {...pick(row,[
   'kind','layer','source','title','channel','topic','kol','startAt','endAt','eventAt',
   'status','goal','targetMetric','targetValue','assignee','dueAt','createdAt','updatedAt',
   'completedAt','settledAt','linkedKols','metrics','evaluation',
   'memberCount','plannedMemberCount','assignments','scheduleChanges','outcome',
   'financeSource','costTotals','revenueTotals','collection'
  ]),...(row.id?{recordRef:opaqueRef(row.id)}:{ }),
   ...(row.kolRef?{kolRef:opaqueRef(row.kolRef)}:{}),
   ...(relatedActivityRefs.length?{relatedRecordRefs:relatedActivityRefs,
    relationshipType:'explicit-crm-activity-link'}:{})};
 });
 const observations=(payload.channelObservations||[]).slice(0,20).map(row=>{
  const base=pick(row,[
   'kind','layer','source','title','startAt','endAt','startDate','endDate','observedAt',
   'metrics','samplePosts','coverage','scope','dateTimezone','attribution','warnings','relationshipType'
  ]);
  const kolSummaries=(row.kolSummaries||[]).slice(0,8).map(k=>({
   kolRef:opaqueRef(k.kolRef),label:k.label,stage:k.stage,metrics:k.metrics,
   linkedCollaborationRefs:(k.linkedCollaborationRefs||[]).slice(0,4).map(opaqueRef)
  }));
  return {...base,...(kolSummaries.length?{kolSummaries}:{})};
 });
 const ai=(payload.aiActions||[]).slice(0,20).map(row=>pick(row,[
  'kind','layer','source','title','reportTitle','priority','status','createdAt',
  'updatedAt','executedAt','review','firstSeenAt','lastSeenAt','occurrences','sourceKind'
 ]));
 return {period:payload.period,humanOperations:human,channelObservations:observations,
  aiActions:ai,counts:{human_operations_shown:human.length,channel_observations_shown:observations.length,
   ai_actions_shown:ai.length,total_records_shown:human.length+observations.length+ai.length},
  coverage:payload.coverage||{},asOf:payload.asOf,
  warnings:payload.warnings||['各来源独立记录，未提供的数据保持未知']};
}
function referralSummary(payload){
 const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
 const scope=payload.scope||'all',periodMatched=scope==='period';
 return {
  scope,asOf:payload.as_of||null,factsAsOf:payload.facts_as_of||null,periodMatched,
  referral:{
   summary:pick(payload.summary,['users','inviters','analysis','strategy','used','trade','continued',
    'nearby','stored','next_generation','next_used']),
   global:pick(payload.global,['registered','inviters','bound','reinviters','next_generation',
    'participation_rate','continuation_rate','output']),
   window:pick(payload.window,['days','users','next_generation','new_nearby','pending',
    'observed_output','confirmed_new_registration_rate','coverage'])},
  coverage:{status:'partial',periodMatched,
   reason:periodMatched?'推荐关系按邀请绑定期间筛选；下游行为仍受各自来源水位限制':
    '当前返回累计全量推荐关系截至快照，不与请求报告期间匹配，不用于周环比或期间增长归因'},
  warnings:[...(periodMatched?[]:['推荐数据为累计全量快照，不是当前报告期间数据']),
   '推荐绑定不等于新注册；历史首次/绑定顺序可能缺失；交易量不是收入；用户级关系和排名明细不发送给模型']
 };
}
// The retention engine also returns cohort member stores. Only export
// fully mature, all-selected aggregate D1/D7 points; a partial period is
// unknown, not a 0% cohort. No daily user rows or membership sets survive.
function retentionSummary(payload){
 const overall=(payload?.curve_groups?.all||[]).find(x=>x?.id==='all:selected');
 const days=[1,7].map(day=>{
  const point=(overall?.periods||[]).find(x=>x?.period===day);
  if(point?.complete!==true||
   !Number.isFinite(point.eligible_users)||
   !Number.isFinite(point.retained_users)||
   !Number.isFinite(point.retention_rate))return null;
  return {day,eligible:point.eligible_users,returned:point.retained_users,
   rate:point.retention_rate,pending:point.pending_users??null};
 }).filter(Boolean);
 return {retention:{available:days.length>0,days},
  coverage:{status:days.length?'partial':'not-mature',
   historyComplete:payload?.history_complete===true},
  warnings:['仅输出完整成熟的全选队列 D1/D7 聚合；未成熟和历史覆盖未知不可作为0留存']};
}
function conversionSummary(payload){
 const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
 const compactStages=(payload.steps||payload.stages?.rows||[]).slice(0,12)
  .map(s=>pick(s,['key','label','available','flows','users','started','success','failed',
   'cancelled','pending','unknown','conflict','success_rate','median_ms','p90_ms']));
 return {conversion:{scene:payload.scene,available:payload.available??payload.stages?.available??null,
   users:payload.users??null,pending:payload.pending??null,
   binding_rate:payload.binding_rate??null,record_total:payload.record_total??null,
   stages:compactStages,
   retention:(payload.retention||[]).slice(0,4).map(r=>pick(r,['day','eligible','returned','pending','rate'])),
   registration:pick(payload.registration,['available','status','reason']),
   association:pick(payload.association,['available','status','reason'])},
  coverage:{status:'partial',historyComplete:payload.history_complete===true,
   reason:'事件历史完整性不能证明登录终态、邀请绑定和注册关系完整；仅已观测转化，无法由未观测推导未使用'},
  warnings:['登录或邀请的未成熟/无关联事件不当作失败；事实、估算与来源分开']};
}
// Preserve only independently observed source timestamps and bounded IDs.
// Query completion and the event-store snapshot are NOT evidence that GSC,
// X, KOL or CRM data was refreshed to the same point in time.
function specialtyProvenance(id,raw,snapshot){
 const observedTime=value=>Number.isSafeInteger(value)&&value>0&&
  Number.isFinite(new Date(value).getTime())?new Date(value).toISOString():null;
 const reportedTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?
  new Date(value).toISOString():null;
 const snapshotId=value=>typeof value==='string'&&value.length>0&&value.length<=120?value:null;
 if(id==='get_channel_economics')
  return {sourceVersions:{events:null,operatorRecords:'crm-manual-collaboration-ledger'},
   watermarks:{events:null,operatorRecords:null,trades:null,registrations:null},
   provenanceNote:'crm-ledger-has-no-authoritative-period-complete-watermark'};
 if(id==='get_seo_performance'){
  const source=raw?.source==='gsc-api'?'gsc-api':
   raw?.source==='gsc-manual-export'?'gsc-manual-export':null;
  return {sourceVersions:{events:null,searchConsole:snapshotId(raw?.snapshotId)},
   watermarks:{events:null,searchConsole:source==='gsc-api'?
    observedTime(raw?.syncedAt):source==='gsc-manual-export'?
    observedTime(raw?.importedAt):null,trades:null,registrations:null},
   provenanceNote:source==='gsc-manual-export'?'manual-import-time-not-google-freshness':
    'gsc-collection-time-not-pt-day-completeness'};
 }
 if(id==='get_content_growth'){
  const observed=(raw?.xOfficial?.accounts||[]).map(a=>observedTime(a?.lastSynced))
   .filter(Boolean).sort();
  return {sourceVersions:{events:null,operatorRecords:'manual-content',
    x:raw?.xOfficial?.available===true?'twitterapi.io':null},
   watermarks:{events:null,x:observed.at(-1)||null,trades:null,registrations:null},
   provenanceNote:'x-latest-bounded-post-observation-not-all-account-freshness'};
 }
 if(id==='get_follower_quality'){
  const observed=(raw?.progress||[]).map(r=>observedTime(r?.updated_at))
   .filter(Boolean).sort();
  return {sourceVersions:{events:null,followerScan:'mutable-scan-progress'},
   watermarks:{events:null,followerScan:observed.at(-1)||null,
    trades:null,registrations:null},
   provenanceNote:'latest-observed-progress-not-historical-audit-completeness'};
 }
 if(id==='get_kol_performance'){
  return {sourceVersions:{events:null,kol:raw?.available===true?
   snapshotId(raw?.snapshotId):null},
   watermarks:{events:null,kol:raw?.available===true?
    reportedTime(raw?.asOf):null,trades:null,registrations:null},
   provenanceNote:'hologres-snapshot-does-not-verify-crm-tagging-completeness'};
 }
 if(id==='get_operations_timeline')
  return {sourceVersions:{operatorRecords:'multi-source-v1'},
   watermarks:{events:null,trades:null,registrations:null,operatorRecords:null,
    searchConsole:null},provenanceNote:'multi-source-observation-not-a-shared-watermark'};
 return {sourceVersions:{events:snapshot?.snapshot_id??null},
  watermarks:{events:snapshot?.as_of??null,trades:raw?.trade_watermark??null,
   registrations:raw?.registration_watermark??null}};
}
const allowedFields=id=>['scope','start','end','filters','limit','cursor',...(id==='get_funnel'?['steps','hours']:id==='get_retention'?['initial','returning']:id==='query_metrics'?['metrics','dimensions']:id==='get_seo_performance'?['siteUrl']:['get_login_conversion','get_invite_conversion'].includes(id)?['hours']:[])];
function createToolRegistry(deps){
 const budgets=new Map(),maxQueries=deps.maxQueries??20,maxConcurrent=deps.maxConcurrent??2,maxResultBytes=deps.maxResultBytes??200000,timeoutMs=deps.timeoutMs??35000;
 function listLegacyCapabilities(context){owner(context);const period=context.period,hasPeriod=Number.isSafeInteger(period?.start)&&Number.isSafeInteger(period?.end);return Object.entries(definitions).map(([id,t])=>({id,version:'1',description:t.description,supportedScopes:t.scopes||['source','activityId','cohortId'],inputSchema:{...inputSchema,properties:Object.fromEntries(allowedFields(id).map(k=>[k,hasPeriod&&['start','end'].includes(k)?{...inputSchema.properties[k],minimum:period.start-(period.end-period.start),maximum:period.end}:inputSchema.properties[k]]))},example:{start:period?.start,end:period?.end},permission:'authenticated owner and scope',limits:{maxDays:31,maxQueries,maxConcurrent,maxResultBytes,timeoutMs,maxCandidates:80000,physicalScanBytes:'not measured'}}));}
 async function executeLegacyTool(id,input={},context){
  owner(context);if(!Object.hasOwn(definitions,id))fail('未知调查工具');
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))fail('工具输入字段无效');
  const tool=definitions[id];
  if(Object.keys(input).some(k=>!allowedFields(id).includes(k)))fail('该工具不支持这些输入字段');
  const limit=input.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('分页大小无效');
  const {scope,audience}=await resolveScope(input.scope||context.scope||{},context,deps.lookups);
  if(tool.scopes&&Object.keys(scope).some(k=>!tool.scopes.includes(k)))fail('该工具不支持活动或人群范围');
  if(['check_data_quality','get_activity','get_operations_timeline','get_channel_economics','get_seo_performance','get_kol_performance','get_content_growth','get_follower_quality'].includes(id)&&scope.source!=='all')fail('该工具当前仅支持全来源范围，不会忽略来源筛选');
  const ctx={...context,scope},start=input.start??context.period.start,end=input.end??context.period.end;
  validateRange(start,end);if(start<context.period.start-(context.period.end-context.period.start)||end>context.period.end)fail('查询时间超出授权范围',403);
  const period={start,end,timezone:'Asia/Bangkok'},body={start,end,source:scope.source};
  if(input.filters&&Object.keys(input.filters).length)fail('不支持 filters 自定义筛选；来源请用 scope.source，例如 {"scope":{"source":"direct"}}；固定人群请用 scope.activityId 或 scope.cohortId');
  if(input.dimensions!=null&&(!Array.isArray(input.dimensions)||input.dimensions.some(d=>!['source','device','version'].includes(d))))fail('未知分组维度');
  if(input.dimensions?.length&&!(id==='query_metrics'&&
    input.metrics?.length===1&&input.metrics[0]==='registered_user_journey'&&
    input.dimensions.length===1&&input.dimensions[0]==='source'))
   fail('指标分组不支持该维度；注册旅程仅允许单指标按已观测来源 source 分组，不支持设备/版本分组');
  if(id==='query_metrics'&&input.dimensions?.length)body.dimensions=input.dimensions.slice();
  if(input.metrics!=null&&(!Array.isArray(input.metrics)||!input.metrics.length||input.metrics.length>10))fail('指标列表无效');
  for(const m of input.metrics||[])describeMetric(m);
  if(input.cursor){
   if(typeof input.cursor!=='string'||input.cursor.length>1000)fail('分页标识无效');
   let cursor;try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString());}catch{fail('分页标识无效');}
   if(cursor.tool!==id||!Number.isSafeInteger(cursor.offset)||cursor.offset<0)fail('分页标识无效');
   const e=deps.evidenceStore.get(cursor.evidenceId,ctx);if(e.query?.tool!==id)fail('分页工具不匹配');
   return page(e,id,cursor.offset,limit,ctx);
  }
  for(const [k,b]of budgets)if(!b.active&&Date.now()-b.started>120000)budgets.delete(k);
  const key=owner(ctx)+':'+(ctx.runId||'api'),budget=budgets.get(key)||{queries:0,active:0,started:Date.now(),candidateDays:0};budgets.set(key,budget);
  const candidateDays=Math.ceil((end-start)/86400000)*(audience?.length??80000);
  if(budget.queries>=maxQueries||budget.active>=maxConcurrent||Date.now()-budget.started>(deps.maxWallMs??120000)||budget.candidateDays+candidateDays>(deps.maxCandidateDays??80000*31*20))fail('工具查询预算已达上限',429);
  budget.queries++;budget.active++;budget.candidateDays+=candidateDays;
  let timer,operationStarted=false;
  try{
   if(id==='get_funnel'){
    const allowed=['token','chip','drill','ai','trade','logged_in_visit','login','visit'];
    body.steps=input.steps||['token','chip'];if(!Array.isArray(body.steps)||body.steps.length<2||body.steps.length>8||body.steps.some(s=>!allowed.includes(s)))fail('漏斗步骤无效；仅允许 2–8 项：'+allowed.join(', '));
    body.hours=input.hours??24;if(!Number.isSafeInteger(body.hours)||body.hours<1||body.hours>168)fail('转化窗口无效');body.association='user';
   }
   if(['get_login_conversion','get_invite_conversion'].includes(id)){
    body.hours=input.hours??24;
    if(![1,24,72].includes(body.hours))fail('登录/邀请窗口只支持1、24、72小时');
   }
   if(id==='get_retention')for(const k of ['initial','returning']){body[k]=input[k]||'chip';if(!['chip','drill','ai','trade','visit'].includes(body[k]))fail('留存事件无效');}
   if(id==='get_paths')body.details=false;
   if(id==='get_activity'&&!scope.activityId)fail('活动工具需要activityId');
   const snapshot=['get_seo_performance','get_content_growth','get_follower_quality','get_operations_timeline','get_channel_economics'].includes(id)?{snapshot_id:null,as_of:new Date().toISOString()}:await deps.snapshot();
   if(!Number.isFinite(Date.parse(snapshot.as_of))||end>Date.parse(snapshot.as_of)+1)fail('所选期间超出数据水位');
   const operation=async()=>{
    if(tool.adapter==='metrics')return deps.metrics({...body,dimensions:input.dimensions||[]},snapshot,input.metrics||['active_users','new_users','returning_users'],ctx);
    if(tool.adapter==='economics')return deps.economics(body,ctx);
    if(tool.adapter==='activities')return deps.activities(body,snapshot,audience,ctx);
    if(tool.adapter==='seo-performance')return deps.seoPerformance({...body,limit,siteUrl:input.siteUrl},ctx);
    if(tool.adapter==='kol-performance')return deps.kolPerformance({...body,limit},ctx,snapshot);
    if(tool.adapter==='content-growth')return deps.contentGrowth(body,ctx);
    if(tool.adapter==='operations-timeline')return deps.operationsTimeline({...body,limit},ctx);
    if(tool.adapter==='follower-quality')return deps.followerQuality(body,ctx);
    return deps.runAnalysis(tool.adapter,body,snapshot,audience,owner(ctx));
   };
   operationStarted=true;
   const running=operation().finally(()=>{budget.active--;});
   const result=await Promise.race([running,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('工具执行超时'),{status:503})),timeoutMs);})]);
   const rawPayload=result.payload??result;
   // The dedicated business job may contain row-level events and membership
   // lists needed for internal analytics. Only archive a statistics-only
   // projection in the Agent evidence store and return that projection to the
   // model. In particular, don't trust short "rows" or nested arrays.
   const payload=id==='get_product_chain'?productChainSummary(rawPayload):
    id==='get_referral'?referralSummary(rawPayload):
    id==='get_retention'?retentionSummary(rawPayload):
    id==='get_login_conversion'?loginSummary(rawPayload):
    id==='get_invite_conversion'?conversionSummary(rawPayload):
    id==='get_channel_economics'?economicsSummary(rawPayload):
    id==='get_kol_performance'?kolSummary(rawPayload):
    id==='get_content_growth'?contentSummary(rawPayload):
    id==='get_follower_quality'?followerSummary(rawPayload):
    id==='get_operations_timeline'?operationsTimelineSummary(rawPayload):rawPayload;
   const safe=statView(payload);
   if(Buffer.byteLength(JSON.stringify(safe))>maxResultBytes)
     fail('统计摘要超出大小预算，请缩小查询范围',422);
   if(id==='query_metrics'){
    const entries=(safe.metrics||[]).map(m=>{
     // Keep each metric's source limits and warnings with its own immutable
     // evidence. A shared event snapshot is not a registration/trade watermark.
     const eventBased=m.metricId!=='registered_users';
     return makeEvidence({...m,query:{tool:id,body},
      sourceVersions:{events:eventBased?snapshot.snapshot_id??null:null,
       registrations:null,trades:null},
      watermarks:{events:eventBased?snapshot.as_of:null,
       eventsCompleteThrough:eventBased?snapshot.events_complete_through??null:null,
       registrations:null,trades:null},
      coverage:m.coverage||{status:'unknown'},
      warnings:[...(m.warnings||[]),...(safe.warnings||[])]},{...ctx,period});
    });
    for(const e of entries)deps.evidenceStore.save(e,ctx);return {status:'ok',evidence:entries,warnings:safe.warnings||[]};
   }
   const provenance=specialtyProvenance(id,rawPayload,snapshot);
   const e=makeEvidence({metricId:tool.metric,value:safe,
    query:{tool:id,body,metrics:input.metrics||null,dimensions:input.dimensions||null,
     audienceFingerprint:audience===null?null:fingerprint(audience)},
    sourceVersions:provenance.sourceVersions,
    watermarks:provenance.watermarks,
    coverage:payload.coverage||payload.quality||{status:'unknown'},
    warnings:[...(payload.warnings||['各源水位独立；缺失源保持未知']),
     ...(provenance.provenanceNote?[provenance.provenanceNote]:[])],
    reportLocator:{page:tool.adapter,period,scope}}, {...ctx,period});
   deps.evidenceStore.save(e,ctx);return page(e,id,0,limit,ctx);
  }catch(error){if(error.status&&error.status<500)throw error;return {status:'unavailable',evidence:[],warnings:['数据获取失败，不得将缺失解释为0'],error:{type:'data_unavailable'}};}
  finally{clearTimeout(timer);if(!operationStarted)budget.active--;}
 }
 function page(e,id,offset,limit,context){
  const rows=Array.isArray(e.value?.rows)?e.value.rows:null,next=rows&&offset+limit<rows.length?Buffer.from(JSON.stringify({tool:id,evidenceId:e.id,offset:offset+limit})).toString('base64url'):undefined;
  // Archive remains unchanged; the view explicitly identifies its slice.
  const view=rows?{...e,value:{...e.value,rows:rows.slice(offset,offset+limit)},page:{offset,limit,total:rows.length}}:e;
  return {status:'ok',evidence:[view],cursor:next,warnings:e.warnings};
 }
 const catalog=createCapabilityCatalog({legacyIds:Object.keys(definitions),extensions:deps.extensions||[],assertOwner:owner,
  evidenceStore:deps.evidenceStore,makeExternalEvidence:require('./externalEvidence').makeExternalEvidence});
 const registry={listCapabilities:context=>catalog.list(context,listLegacyCapabilities),
  executeTool:(id,input,context)=>catalog.execute(id,input,context,executeLegacyTool),describeMetric};
 const moduleCatalog=require('./businessModuleCatalog');
 return {...registry,
  listBusinessModules:context=>moduleCatalog.listBusinessModules(registry,context),
  executeBusinessModule:(request,context)=>moduleCatalog.executeBusinessModule(registry,request,context)};
}
function defaultRegistry(){
 const db=require('../../../db/connection'),remote=require('../../../data/hologres');
 const {createEvidenceStore}=require('../evidence'),{sqliteLookups}=require('../scope');
 return createToolRegistry({evidenceStore:createEvidenceStore(db),lookups:sqliteLookups(db),snapshot:()=>remote.status(),runAnalysis:require('./adapters').runAnalysis,metrics:require('./adapters').metrics,economics:require('./adapters').economics,activities:require('./adapters').activities,seoPerformance:require('./adapters').seoPerformance,kolPerformance:require('./adapters').kolPerformance,contentGrowth:require('./contentAdapters').contentGrowth,followerQuality:require('./contentAdapters').followerQuality,operationsTimeline:require('./operationsTimeline').defaultOperationsTimeline(),
  extensions:require('./openseoConnector').getExtensions()});
}
module.exports={createToolRegistry,defaultRegistry,listMetrics,listToolIds:()=>Object.keys(definitions),retentionSummary};
