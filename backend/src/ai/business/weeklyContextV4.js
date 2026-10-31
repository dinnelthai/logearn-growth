'use strict';
// A weekly decision context is statistics-first, not a twelve-skill data dump.
// Full evidence/tool schemas stay in the owner-scoped read-only registry and
// paid-call journal. This projection does not query or mutate external sources.
const DEFAULT_CAP=22000;
const {describeMetric}=require('./metricRegistry');
const METRICS=[
 ['new_users','首次分析用户',5],['active_users','分析活跃用户',5],
 ['returning_users','回访分析用户',3],['activation_rate','激活率',5],
 ['registered_users','注册用户',3],['registration_activation_rate','注册后24小时激活率',3],['registered_trade_conversion_rate','注册用户分析后7日交易率',3],['volume_usd','交易量',3]
];
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const compactPeriod=p=>({
 ...(p?.kind==='custom'?{kind:'custom'}:{}),
 start:p?.start??null,end:p?.end??null,
 previousStart:p?.previousStart??null,previousEnd:p?.previousEnd??null,
 timezone:p?.timezone||'Asia/Bangkok'
});
function factsFromValue(value,max=4){
 if(value==null)return [];
 if(valid(value))return [{metric:'value',value}];
 if(typeof value!=='object')return [];
 const matches=[],registration=value?.cohorts?.registration,registrationMetrics=registration?.metrics;
 // Preserve the aggregate activity experiment summary without exposing member IDs.
 for(const row of (Array.isArray(value.humanOperations)?value.humanOperations:[])
  .filter(x=>x?.kind==='growth_activity'&&Array.isArray(x.assignments)).slice(0,1)){
  const source=row.source==='growth_activities'?'growth_activities':'activity';
  for(const assignment of row.assignments.slice(0,2)){
   const group=['treatment','control'].includes(assignment.group)?assignment.group:'group';
   for(const key of ['assigned','delivered','sent_unconfirmed','not_delivered','delivery_unknown','cross_exposed']){
    if(valid(assignment[key]))matches.push({metric:`humanOperations.${source}.assignments.${group}.${key}`,value:assignment[key]});
   }
  }
 }
 if(registration?.available===true&&registrationMetrics&&typeof registrationMetrics==='object'){
  const fields=[
   ['registration_activation_rate','rate'],
   ['registration_activation_activated','activated'],
   ['registration_activation_eligible','eligible'],
   ['registration_pending','pending']
  ];
  for(const [metric,key] of fields)if(valid(registrationMetrics[key]))
   matches.push({metric,value:registrationMetrics[key]});
 }
 const engagement=registration?.engagement;
 if(engagement&&typeof engagement==='object'){
  const fields=[
   ['registered_engagement_eligible','eligible'],
   ['registered_engagement_pending','pending'],
   ['registered_chip_analysis_users','chip_analysis_users'],
   ['registered_holder_view_users','holder_view_users'],
   ['registered_strategy_started_users','strategy_started_users'],
   ['registered_signal_view_users','signal_view_users'],
   ['registered_repeat_analysis_users','repeat_analysis_users']
  ];
  for(const [metric,key] of fields)if(valid(engagement[key]))
   matches.push({metric,value:engagement[key]});
 }
 const registrationTrade=registration?.trade;
 if(registrationTrade?.available===true){
  const fields=[
   ['registered_trade_conversion_rate','conversion_rate'],
   ['registered_trade_traders','traders'],
   ['registered_trade_eligible','eligible'],
   ['registered_trade_pending','pending'],
   ['registered_trade_unmatched','unmatched']
  ];
  for(const [metric,key] of fields)if(valid(registrationTrade[key]))
   matches.push({metric,value:registrationTrade[key]});
 }
 const allowed=new Set([
  'active_users','new_users','returning_users','activation_rate','registered_users','registration_activation_rate','registered_trade_conversion_rate','activated',
  'chip_analysis_users','holder_view_users','strategy_started_users','signal_view_users','repeat_analysis_users',
  'users','visits','clicks','impressions','ctr','position','views','likes',
  'replies','retweets','reposts','posts','followers','followerChange',
  'engagementRate','replyRate','repostRate','likeRate','h24Views','h48Views',
  'measuredPosts','followerChange','comments','shares',
  'converted','rate','eligible','returned','pending','trades','volume_usd',
  'completed','prior','active','inactive','review','analysis_users','analysis_events','analysis_days','returning_analysis_users','multi_day_users','trade_users','actual','ratio','target',
  'volume','revenue','cost','cost_usd','total','count','started','success','failed'
 ]);
 const visit=(obj,prefix='',depth=0)=>{
  if(depth>2||!obj||typeof obj!=='object'||Array.isArray(obj))return;
  for(const [key,v] of Object.entries(obj).slice(0,40)){
   if(valid(v)&&allowed.has(key))matches.push({metric:prefix?prefix+'.'+key:key,value:v});
   else if(depth<2&&['metrics','totals','summary','counts','contentSignals','outcome','targetProgress','performance','sourceCoverage',
     'xOfficial','global','conversion','retention','trade','product_chain','cohorts','registration'].includes(key))
    visit(v,prefix?prefix+'.'+key:key,depth+1);
  }
 };
 visit(value);
 const preference=['clicks','impressions','views','posts','engagementRate','users',
  'visits','converted','rate','trades','volume_usd','revenue','cost'];
 matches.sort((a,b)=>{
  const rank=x=>{const k=x.metric.split('.').at(-1),i=preference.indexOf(k);return i<0?100:i};
  return rank(a)-rank(b);
 });
 return matches.slice(0,max);
}
function buildWeeklyContextV4(raw,{modelEvidence,compactCapabilities,safeText,reviewRevision=0,reserveBytes=0,includeDecisionSignals=false}){
 if(raw?.weeklyCoverage?.version!=='weekly-coverage-v1')
  throw Error('周报 Context v4 缺少可信的服务端模块覆盖记录');
 if(!Number.isSafeInteger(reserveBytes)||reserveBytes<0||reserveBytes>12000)
  throw Error('周报上下文预留预算无效');
 const CAP=DEFAULT_CAP-reserveBytes;
 const period=compactPeriod(raw.period);
 const source=Array.isArray(raw.evidence)?raw.evidence:[];
 const byId=new Map(source.filter(e=>typeof e?.id==='string').map(e=>[e.id,e]));
 const summaries=raw.weeklyCoverage.modules.map(row=>{
  const ids=(row.evidenceIds||[]).filter(id=>byId.has(id)).slice(0,3);
  const evidence=ids.map(id=>byId.get(id));
  // Preserve the actual breakdown for acquisition and activation, not just
  // the first four overall numbers. This remains bounded and aggregate-only.
  const maxFacts=['channel-growth','activation-funnel','operations-timeline'].includes(row.id)?12:4;
  const facts=(row.facts||[]).filter(f=>valid(f.value)&&typeof f.metric==='string')
   .slice(0,maxFacts).map(f=>({metric:safeText(f.metric,110),
    path:'stats.'+safeText(f.metric,110),value:f.value}));
  if(!facts.length)for(const e of evidence){
   for(const f of factsFromValue(modelEvidence(e).value,4)){
    if(!facts.some(x=>x.metric===f.metric))facts.push(f);
    if(facts.length>=maxFacts)break;
   }
   if(facts.length>=maxFacts)break;
  }
  return {id:row.id,status:row.status,
   ...(facts.length?{stats:facts}:{}),
   ...(ids.length?{evidenceIds:ids}:{}),
   ...(row.status==='not-connected'||row.status==='insufficient'?
    {gap:safeText(row.reason||'',80)}:
    /有界样本|达到读取上限/.test(row.reason||'')?{note:safeText(row.reason,80)}:{})};
 });
 const periodEvidence=(id,start,end,target)=>source.find(e=>
  e.metricId===id&&e.period?.start===start&&e.period?.end===end&&
  valid(e.value)&&(target==null||e.value===target));
 const core=METRICS.map(([id,label,weight])=>{
  const current=raw.current?.totals?.[id],previous=raw.previous?.totals?.[id];
  if(!valid(current)&&!valid(previous))return null;
  const cur=valid(current)?current:null,prev=valid(previous)?previous:null;
  const refs=[cur===null?null:periodEvidence(id,period.start,period.end,cur)?.id,
   prev===null?null:periodEvidence(id,period.previousStart,period.previousEnd,prev)?.id].filter(Boolean);
  const changePct=cur!==null&&prev!==null&&prev!==0?
   Math.round((cur-prev)/prev*10000)/100:null;
  const unit=describeMetric(id).unit;
  return {id,label,current:cur,previous:prev,changePct,evidenceIds:refs,unit,
   affectedPopulationDelta:unit==='users'&&cur!==null&&prev!==null?Math.abs(cur-prev):null,
   score:changePct===null?0:Math.abs(cur-prev)*weight,
   coverage:refs.length===2?'period-evidence':'snapshot-only'};
 }).filter(Boolean);
 const goalFocus=includeDecisionSignals?
  require('./businessBrain').buildBusinessBrainContext({
   focusGoal:raw.business?.focusGoal||raw.focusGoal||'activation'
  }).focus:null;
 const goalRank=metricId=>{
  const index=goalFocus?.priorityMetrics?.indexOf(metricId)??-1;
  return index<0?null:index+1;
 };
 const signalOrder=(a,b)=>{
  if(!includeDecisionSignals)return reviewRevision>=2?0:b.score-a.score;
  const goal=(goalRank(a.id)??100)-(goalRank(b.id)??100);
  if(goal)return goal;
  const evidence=(a.coverage==='period-evidence'?0:1)-(b.coverage==='period-evidence'?0:1);
  if(evidence)return evidence;
  // Compare affected populations only when both metrics use the same unit.
  if(a.unit===b.unit&&a.affectedPopulationDelta!==null&&b.affectedPopulationDelta!==null){
   const population=b.affectedPopulationDelta-a.affectedPopulationDelta;
   if(population)return population;
  }
  // Relative movement is a tie-breaker only within the same metric unit.
  return a.unit===b.unit?Math.abs(b.changePct)-Math.abs(a.changePct):0;
 };
 const issues=core.filter(x=>x.changePct!==null&&x.changePct<0)
  .sort(signalOrder).slice(0,4)
  .map(({id,label,current,previous,changePct,evidenceIds,coverage,unit,affectedPopulationDelta})=>
   ({metricId:id,label,current,previous,changePct,evidenceIds,coverage,unit,
    ...(affectedPopulationDelta!==null?{affectedPopulationDelta}:{}),
    ...(includeDecisionSignals?{goalRank:goalRank(id)}:{}),
    classification:coverage==='period-evidence'?'observed-decline;cause-unverified':
     'snapshot-decline;period-evidence-incomplete'}));
 const growthOpportunities=includeDecisionSignals?core
  .filter(x=>x.changePct!==null&&x.changePct>0)
  .sort(signalOrder).slice(0,4)
  .map(({id,label,current,previous,changePct,evidenceIds,coverage,unit,affectedPopulationDelta})=>({
   metricId:id,label,current,previous,changePct,evidenceIds,coverage,unit,
   ...(affectedPopulationDelta!==null?{affectedPopulationDelta}:{}),
   goalRank:goalRank(id),
   classification:coverage==='period-evidence'?'observed-increase;replicability-unverified':
    'snapshot-increase;period-evidence-incomplete'
  })):null;
 const favored=new Set([
  ...core.flatMap(x=>x.evidenceIds),
  ...summaries.filter(m=>m.status==='collected'||m.status==='analyzed')
   .flatMap(m=>(m.evidenceIds||[]).slice(0,1)),
  ...(raw.weeklySources?.seo?.evidenceIds||[])
 ]);
 const ordered=[...favored].map(id=>byId.get(id)).filter(Boolean);
 const evidence=ordered.slice(0,16).map(e=>{
  const sanitized=modelEvidence(e);
  const value=sanitized.value;
  const stats=typeof value==='number'||value===null?[]:factsFromValue(value,5);
  const scalar=typeof value==='number'||value===null?value:undefined;
  return {
   id:sanitized.id,metricId:sanitized.metricId,
   ...(scalar!==undefined?{value:scalar}:{}),
   ...(stats.length?{stats}:{}),
   ...(sanitized.sampleSize!=null?{sampleSize:sanitized.sampleSize}:{}),
   ...(sanitized.numerator!=null?{numerator:sanitized.numerator}:{}),
   ...(sanitized.denominator!=null?{denominator:sanitized.denominator}:{}),
   period:{start:sanitized.period?.start??null,end:sanitized.period?.end??null},
   coverage:{status:sanitized.coverage?.status||'unknown',
    ...(typeof sanitized.coverage?.periodMatched==='boolean'?
     {periodMatched:sanitized.coverage.periodMatched}:{})}
  };
 });
 const originalCapabilities=Array.isArray(raw.capabilities)?raw.capabilities:[];
 const allowedIds=originalCapabilities.map(x=>x.id);
 const toolOrder=['query_metrics',
  ...(issues.some(x=>x.metricId==='new_users'||x.metricId==='active_users')?
   ['get_channels','get_funnel','get_login_conversion']:[]),
  'get_seo_performance','get_product_chain','get_retention',
  ...(raw.business?.focusGoal==='content-growth'?['get_content_growth']:[]),
  ...allowedIds];
 const relevant=[...new Set(toolOrder)].filter(id=>allowedIds.includes(id)).slice(0,reviewRevision>=2?allowedIds.length:5);
 const chosen=originalCapabilities.filter(x=>relevant.includes(x.id))
  .sort((a,b)=>relevant.indexOf(a.id)-relevant.indexOf(b.id));
 const tools=compactCapabilities(chosen).map(x=>({
  id:x.id,required:x.required,
  input:reviewRevision>=2?x.input:Object.fromEntries(Object.entries(x.input||{}).slice(0,9)),
  description:safeText(x.description,reviewRevision>=2?110:75)
 }));
 // Tie investigation to the largest verified change. Tool names here
 // are suggestions, never new permissions or automatic paid queries.
 const primary=reviewRevision>=2?null:
  includeDecisionSignals?[...issues.map(x=>({...x,direction:'decrease'})),
   ...growthOpportunities.map(x=>({...x,direction:'increase'}))].sort((a,b)=>{
    const goal=(a.goalRank??100)-(b.goalRank??100);
    if(goal)return goal;
    const evidence=(a.coverage==='period-evidence'?0:1)-(b.coverage==='period-evidence'?0:1);
    if(evidence)return evidence;
    if(a.unit===b.unit&&a.affectedPopulationDelta!=null&&b.affectedPopulationDelta!=null)
     return b.affectedPopulationDelta-a.affectedPopulationDelta;
    return 0;
   })[0]||null:issues[0]||null;
 const toolMap={
  registered_users:['get_channels','get_seo_performance','get_referral','get_invite_conversion'],
  registration_activation_rate:['get_funnel','get_login_conversion','get_product_chain'],
  new_users:['get_channels','get_funnel','get_login_conversion','get_seo_performance','get_referral'],
  activation_rate:['get_funnel','get_login_conversion','get_product_chain'],
  active_users:['get_channels','get_funnel','get_retention','get_product_chain'],
  returning_users:['get_retention','get_segments','get_product_chain'],
  volume_usd:['get_product_chain','get_channel_economics']
 };
 const investigationFocus=primary?{
  metricId:primary.metricId,direction:primary.direction||'decrease',
  changePct:primary.changePct,goalRank:primary.goalRank??null,
  question:primary.direction==='increase'?
   '解释该目标相关指标为何上升，并验证变化是否持续、覆盖是否完整；不能把同期增长直接归因于某项活动':
   primary.metricId==='new_users'?
    '首次分析人数下降：优先区分渠道流量减少、登录转化下降和首次有效分析漏斗损失；目前不能归因':
    '识别该指标变化贡献最大的已观测步骤或人群；没有可比证据就说明阻塞点',
  candidateTools:relevant.filter(id=>(toolMap[primary.metricId]||[
   'get_channels','get_funnel','get_retention','get_product_chain'
  ]).includes(id)),
  instruction:'先使用当前上下文和已采集证据；只请求能区分竞争性解释、且本任务已授权的最少工具。不得假设工具费用或数据可用性；如果工具成本/权限未知，不请求外部付费采集。重复参数不得重查；证据已足够或没有可区分假设的授权工具时停止。'
 }:null;
 const seo=raw.weeklySources?.seo||{};
 const out={
  transportVersion:'aggregated-business-v4',
  business:{product:'LogEarn',
   focusGoal:safeText(raw.business?.focusGoal||raw.focusGoal||'activation',50),
   scope:{source:safeText(raw.business?.scope?.source||'all',120)},
   question:safeText(raw.business?.question||'',250)},
  period,
  snapshot:{asOf:raw.snapshot?.asOf||null,
   historyComplete:raw.snapshot?.historyComplete===true},
  coreMetrics:core.map(({score,...rest})=>rest),
  priorityIssues:issues,
  ...(includeDecisionSignals?{questionPriority:
   (raw.growthPlan?.questionRanking?.questions||[]).slice(0,3).map(row=>({
    metric:safeText(row.metric||'',60),priority:safeText(row.priority||'',6),
    goalRelevant:row.goalRelevant===true,
    affectedUsers:Number.isSafeInteger(row.affectedUsers)&&row.affectedUsers>=0?
     row.affectedUsers:null,
    observedChangeMagnitude:Number.isSafeInteger(row.observedChangeMagnitude)&&
     row.observedChangeMagnitude>=0?row.observedChangeMagnitude:null,
    evidenceConfidence:safeText(row.evidenceConfidence||'unknown',12),
    authorizedTool:row.authorizedTool?safeText(row.authorizedTool,60):null,
    observedMedianMs:Number.isSafeInteger(row.observedLatency?.medianMs)?
     row.observedLatency.medianMs:null,
    sampleCount:Number.isSafeInteger(row.observedLatency?.sampleCount)?
     row.observedLatency.sampleCount:null,
    monetaryQueryCost:'unknown'
   }))}:{}),
  ...(growthOpportunities?{growthOpportunities}:{}),
  investigationFocus,
  weeklyCoverage:summaries,
  evidence,
  evidenceMeta:{available:source.length,shown:evidence.length,
   note:'未展示的维度未知而不是0；完整证据可按ID审计'},
  seo:{status:seo.status||'unavailable',
   periodMatched:seo.periodMatched===true,
   evidenceIds:(seo.evidenceIds||[]).slice(0,3)},
  weeklyOperations:raw.weeklyOperations?Object.fromEntries(
   ['goalsCount','unresolvedCount','newActionCount','executedActionCount',
    'reviewedActionCount','pendingActionCount'].map(k=>[k,
     valid(raw.weeklyOperations[k])?raw.weeklyOperations[k]:null])):null,
  capabilities:tools,
  otherAvailableTools:allowedIds.filter(id=>!relevant.includes(id)),
  omissions:{
   rawRowsOmitted:true,postTextOmitted:true,toolNarrativesOmitted:true,
   fullSourceMetadataArchived:true,
   note:'13模块仅发送关键统计与覆盖；没有查询或没有观测不表示0；需要补查时使用授权工具'
  }
 };
 const size=()=>Buffer.byteLength(JSON.stringify(out),'utf8');
 // Statistical facts and every module's status outrank tool documentation.
 if(size()>CAP){
  out.capabilities=out.capabilities.map(x=>({id:x.id,required:x.required,
   input:reviewRevision>=2?x.input:Object.fromEntries(Object.entries(x.input).slice(0,5))}));
  out.otherAvailableTools=out.otherAvailableTools.slice(0,20);
 }
 // At most one evidence from each relevant module survives before surplus.
 while(size()>CAP&&out.evidence.length>4)out.evidence.pop();
 out.evidenceMeta.shown=out.evidence.length;
 if(size()>CAP){
  out.weeklyCoverage=out.weeklyCoverage.map(x=>({id:x.id,status:x.status,
   ...(x.stats?{stats:x.stats.slice(0,2)}:{})}));
 }
 // Core report metrics and module coverage have higher priority than
 // optional query-economics hints when approaching the strict byte budget.
 if(size()>CAP&&out.questionPriority?.length)out.questionPriority=out.questionPriority.slice(0,1);
 if(size()>CAP&&out.questionPriority?.length)out.questionPriority=[];
 if(size()>CAP)throw Error('AI 周报精简统计上下文仍超出安全预算，尚未调用付费模型');
 return out;
}
module.exports={buildWeeklyContextV4,factsFromValue};
