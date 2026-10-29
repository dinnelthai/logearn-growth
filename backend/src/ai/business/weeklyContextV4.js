'use strict';
// A weekly decision context is statistics-first, not a twelve-skill data dump.
// Full evidence/tool schemas stay in the owner-scoped read-only registry and
// paid-call journal. This projection does not query or mutate external sources.
const CAP=22000;
const METRICS=[
 ['new_users','首次分析用户',5],['active_users','分析活跃用户',5],
 ['returning_users','回访分析用户',3],['activation_rate','激活率',5],
 ['registered_users','注册用户',3],['volume_usd','交易量',3]
];
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const compactPeriod=p=>({
 start:p?.start??null,end:p?.end??null,
 previousStart:p?.previousStart??null,previousEnd:p?.previousEnd??null,
 timezone:p?.timezone||'Asia/Bangkok'
});
function factsFromValue(value,max=4){
 if(value==null)return [];
 if(valid(value))return [{metric:'value',value}];
 if(typeof value!=='object')return [];
 const matches=[],allowed=new Set([
  'active_users','new_users','returning_users','activation_rate','registered_users',
  'users','visits','clicks','impressions','ctr','position','views','likes',
  'replies','retweets','reposts','posts','followers','followerChange',
  'engagementRate','replyRate','repostRate','likeRate','h24Views','h48Views',
  'converted','rate','eligible','returned','pending','trades','volume_usd',
  'volume','revenue','cost','cost_usd','total','count','started','success','failed'
 ]);
 const visit=(obj,prefix='',depth=0)=>{
  if(depth>2||!obj||typeof obj!=='object'||Array.isArray(obj))return;
  for(const [key,v] of Object.entries(obj).slice(0,40)){
   if(valid(v)&&allowed.has(key))matches.push({metric:prefix?prefix+'.'+key:key,value:v});
   else if(depth<2&&['metrics','totals','summary','counts','contentSignals',
     'xOfficial','global','conversion','retention','trade','product_chain'].includes(key))
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
function buildWeeklyContextV4(raw,{modelEvidence,compactCapabilities,safeText}){
 if(raw?.weeklyCoverage?.version!=='weekly-coverage-v1')
  throw Error('周报 Context v4 缺少可信的服务端模块覆盖记录');
 const period=compactPeriod(raw.period);
 const source=Array.isArray(raw.evidence)?raw.evidence:[];
 const byId=new Map(source.filter(e=>typeof e?.id==='string').map(e=>[e.id,e]));
 const summaries=raw.weeklyCoverage.modules.map(row=>{
  const ids=(row.evidenceIds||[]).filter(id=>byId.has(id)).slice(0,3);
  const evidence=ids.map(id=>byId.get(id));
  const facts=(row.facts||[]).filter(f=>valid(f.value)&&typeof f.metric==='string')
   .slice(0,4).map(f=>({metric:safeText(f.metric,65),value:f.value}));
  if(!facts.length)for(const e of evidence){
   for(const f of factsFromValue(modelEvidence(e).value,4)){
    if(!facts.some(x=>x.metric===f.metric))facts.push(f);
    if(facts.length>=4)break;
   }
   if(facts.length>=4)break;
  }
  return {id:row.id,status:row.status,
   ...(facts.length?{stats:facts}:{}),
   ...(ids.length?{evidenceIds:ids}:{}),
   ...(row.status==='not-connected'||row.status==='insufficient'?
    {gap:safeText(row.reason||'',80)}:{})};
 });
 const periodEvidence=(id,start,end,target)=>source.find(e=>
  e.metricId===id&&e.period?.start===start&&e.period?.end===end&&
  valid(e.value)&&(target==null||e.value===target));
 const core=METRICS.map(([id,label,weight])=>{
  const current=raw.current?.totals?.[id],previous=raw.previous?.totals?.[id];
  if(!valid(current)&&!valid(previous))return null;
  const cur=valid(current)?current:null,prev=valid(previous)?previous:null;
  const refs=[periodEvidence(id,period.start,period.end,cur)?.id,
   periodEvidence(id,period.previousStart,period.previousEnd,prev)?.id].filter(Boolean);
  const changePct=cur!==null&&prev!==null&&prev!==0?
   Math.round((cur-prev)/prev*10000)/100:null;
  return {id,label,current:cur,previous:prev,changePct,evidenceIds:refs,
   score:changePct===null?0:Math.abs(cur-prev)*weight,
   coverage:refs.length===2?'period-evidence':'snapshot-only'};
 }).filter(Boolean);
 const issues=core.filter(x=>x.changePct!==null&&x.changePct<0)
  .sort((a,b)=>b.score-a.score).slice(0,4)
  .map(({id,label,current,previous,changePct,evidenceIds,coverage})=>
   ({metricId:id,label,current,previous,changePct,evidenceIds,coverage,
    classification:'observed-decline;cause-unverified'}));
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
  const stats=factsFromValue(value,5);
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
  ...(issues.some(x=>x.id==='new_users'||x.id==='active_users')?
   ['get_channels','get_funnel']:[]),
  'get_seo_performance','get_product_chain','get_retention',
  ...(raw.business?.focusGoal==='content-growth'?['get_content_growth']:[]),
  ...allowedIds];
 const relevant=[...new Set(toolOrder)].filter(id=>allowedIds.includes(id)).slice(0,5);
 const chosen=originalCapabilities.filter(x=>relevant.includes(x.id))
  .sort((a,b)=>relevant.indexOf(a.id)-relevant.indexOf(b.id));
 const tools=compactCapabilities(chosen).map(x=>({
  id:x.id,required:x.required,
  input:Object.fromEntries(Object.entries(x.input||{}).slice(0,9)),
  description:safeText(x.description,75)
 }));
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
   note:'12模块仅发送关键统计与覆盖；没有查询或没有观测不表示0；需要补查时使用授权工具'
  }
 };
 const size=()=>Buffer.byteLength(JSON.stringify(out),'utf8');
 // Statistical facts and every module's status outrank tool documentation.
 if(size()>CAP){
  out.capabilities=out.capabilities.map(x=>({id:x.id,required:x.required,
   input:Object.fromEntries(Object.entries(x.input).slice(0,5))}));
  out.otherAvailableTools=out.otherAvailableTools.slice(0,20);
 }
 // At most one evidence from each relevant module survives before surplus.
 while(size()>CAP&&out.evidence.length>4)out.evidence.pop();
 out.evidenceMeta.shown=out.evidence.length;
 if(size()>CAP){
  out.weeklyCoverage=out.weeklyCoverage.map(x=>({id:x.id,status:x.status,
   ...(x.stats?{stats:x.stats.slice(0,2)}:{})}));
 }
 if(size()>CAP)throw Error('AI 周报精简统计上下文仍超出安全预算，尚未调用付费模型');
 return out;
}
module.exports={buildWeeklyContextV4,factsFromValue};
