'use strict';
// Weekly source coverage is a versioned, owner-scoped READ-ONLY evidence manifest.
// It is not a replacement for the business-tool authorization, paid-call journal
// or model-backed claims. All facts are selected from existing aggregate evidence.
const VERSION='weekly-coverage-v1';
const DEFINITIONS=Object.freeze([
 ['growth-overview','增长概览','query_metrics','active_users'],
 ['seo-organic','SEO / Search Console','get_seo_performance','seo_search'],
 ['channel-growth','渠道获客','get_channels','channels'],
 ['activation-funnel','用户激活','get_funnel','funnel'],
 ['retention','用户留存','get_retention','retention'],
 ['trade-conversion','产品到交易','get_product_chain','product_chain'],
 ['revenue','收入与渠道经济','get_channel_economics','trade_revenue'],
 ['referral-and-invite','推荐与邀请','get_invite_conversion','invite_conversion'],
 ['login-conversion','登录转化','get_login_conversion','login_conversion'],
 ['kol-impact','KOL 效果','get_kol_performance','kol_performance'],
 ['content-growth','X 内容增长','get_content_growth','content_growth'],
 ['follower-quality','X 粉丝质量','get_follower_quality','follower_quality'],
 ['operations-timeline','运营活动与执行记录','get_operations_timeline','activities']
].map(([id,label,tool,metric])=>Object.freeze({id,label,tool,metric})));
// Only observed aggregate metrics may enter the weekly model. Do not traverse
// arbitrary rows, events, identities or raw payloads just to find a number.
const ALLOWED_NUMBERS=new Set([
 'active_users','new_users','returning_users','registered_users',
 'users','visits','eligible','converted','returned','activated','registered',
 'success','successes','started','pending','failed','cancelled','unknown',
 'rate','conversion_rate','success_rate','activation_rate','retention_rate',
 'participation_rate','continuation_rate','binding_rate',
 'views','likes','replies','retweets','reposts','posts','impressions','clicks',
 'ctr','position','followers','engagementRate','trades','transactions',
 'volume','volume_usd','cost_usd','revenue','cost','bound','inviters',
 'count','total','flows','exposures','clicked','entered','details',
 'visitor_users','clicked_users','drop_off_users','mature_users',
 'h24Views','h48Views','viewCount','postCount','likeCount','replyCount',
 'logged','token','analysis','strategy','submitted','succeeded',
 'analysis_rate','strategy_rate','trade_rate','source_conflicts','first_visit_users',
 'total_entered','total_converted','pending_count','drop_off_users',
 'previous_conversion_rate','total_conversion_rate','eligible_users',
 'retained_users','pending_users','observed_returned_users',
 'requests','terminal_coverage','observed_completion_rate','success_rate',
 'click_users','record_total','currencyCount','receivedEntries','income_entries','roi',
 'measuredProfiles','profilesWithObservedUsers','profilesWithAnalysis',
 'profilesWithTrade','maxObservedUsers','observedAccounts','measuredPosts',
 'measuredImpressions','measuredEngagementRate','sampledPosts',
 'scannedRecords','analyzedRecords','reviewedRecords','records','reviewed','analyzed','human_operations','channel_observations','ai_actions','total_records',
 'human_operations_shown','channel_observations_shown','ai_actions_shown','total_records_shown',
 'assigned','delivered','sent_unconfirmed','not_delivered','delivery_unknown','cross_exposed','retrospective_records'
]);
const AGGREGATE_OBJECTS=new Set([
 'metrics','summary','totals','global','conversion','product_chain',
 'first_value','referral','window','trade','xOfficial','contentSignals',
 'counts','retention','growth','current','previous','funnel','attribution',
 'humanOperations','assignments','scheduleChanges',
 'registration','association','first_value','exposure','entrance',
 'byCurrency','bySource','dimensions','rates','d7','d30',
 'channels','sources','steps','stages','drops','groups','cohorts',
 'families','retention_summary','entrance_breakdown','page_clicks_summary',
 'items','series','trends','days','manual','official','economics'
]);
const AGGREGATE_ARRAYS=new Set([
 'channels','sources','steps','stages','drops','groups','cohorts',
 'families','retention_summary','entrance_breakdown','page_clicks_summary',
 'items','series','trends','bySource','days','humanOperations','assignments','scheduleChanges'
]);
const validNumber=x=>typeof x==='number'&&Number.isFinite(x);
const cleanText=(value,max=180)=>String(value??'').slice(0,max);
// Labels are dimensions, never arbitrary names/addresses. Unknown categories
// are still counted but are not exported into the metric path.
const safeDimension=v=>typeof v==='string'&&/^[a-z0-9_-]{1,32}$/i.test(v)?
 v.toLowerCase():null;
function factsFromEvidence(evidence){
 const facts=[],seen=new Set();
 const add=(metric,value,evidenceId)=>{
  if(!validNumber(value)||!evidenceId||facts.length>=12)return;
  const key=evidenceId+':'+metric;
  if(seen.has(key))return;
  seen.add(key);facts.push({metric,value,evidenceId});
 };
 const visit=(obj,evidenceId,prefix='',depth=0)=>{
  if(depth>5||!obj||typeof obj!=='object'||facts.length>=12)return;
  if(Array.isArray(obj))return;
  for(const [key,value] of Object.entries(obj)){
   if(facts.length>=12)break;
   const name=prefix?prefix+'.'+key:key;
   if(validNumber(value)&&ALLOWED_NUMBERS.has(key))add(name,value,evidenceId);
   else if(depth<5&&AGGREGATE_OBJECTS.has(key)&&value&&typeof value==='object'){
    if(Array.isArray(value)){
     if(!AGGREGATE_ARRAYS.has(key))continue;
     for(const [i,item] of value.slice(0,8).entries()){
      if(!item||typeof item!=='object'||Array.isArray(item))continue;
      const category=safeDimension(item.source)||safeDimension(item.channel)||
       safeDimension(item.kind)||safeDimension(item.group)||safeDimension(item.key)||
       safeDimension(item.stage)||safeDimension(item.label);
      // A numeric index alone is stable within this snapshot, not attribution.
      visit(item,evidenceId,name+'.'+(category||String(i)),depth+1);
      if(facts.length>=12)break;
     }
    }else visit(value,evidenceId,name,depth+1);
   }
  }
 };
 for(const e of (Array.isArray(evidence)?evidence:[]).slice(0,8)){
  if(facts.length>=12)break;
  const value=e?.value;
  if(validNumber(value)){add(e.metricId||'value',value,e.id);continue}
  // Reserve facts for the actual *breakdown* instead of letting a wide
  // overall summary consume the entire evidence budget.
  const channelGroups=Array.isArray(value?.groups)?value.groups:
   Array.isArray(value?.groups?.items)?value.groups.items:null;
  if(e.metricId==='channels'&&channelGroups){
   for(const key of ['new_users','users','analysis'])
    add('total.'+key,value.total?.[key],e.id);
   for(const [i,row] of channelGroups.slice(0,3).entries()){
    const source=safeDimension(row?.source)||'group'+i;
    for(const key of ['new_users','users','analysis'])
     add('groups.'+source+'.'+key,row?.[key],e.id);
   }
  }else if(e.metricId==='funnel'&&Array.isArray(value?.steps)){
   for(const key of ['total_entered','total_converted','pending_count'])
    add(key,value[key],e.id);
   for(const [i,row] of value.steps.slice(0,4).entries()){
    const step=safeDimension(row?.key)||'step'+i;
    for(const key of ['users','previous_conversion_rate','drop_off_users'])
     add('steps.'+step+'.'+key,row?.[key],e.id);
   }
  }else visit(value,e?.id);
 }
 return facts;
}
function baselineEvidence(context){
 const rows=Array.isArray(context.evidence)?context.evidence:[];
 return rows.filter(e=>['active_users','new_users','returning_users'].includes(e.metricId)&&
  typeof e.id==='string'&&validNumber(e.value)).slice(0,6);
}
function describeAvailable(result){
 const evidence=Array.isArray(result?.evidence)?result.evidence:[];
 if(result?.status!=='ok'||!evidence.length)return 'insufficient';
 if(evidence.every(e=>e?.value?.available===false||e?.value==null))
  return 'insufficient';
 // Raw rows and identifier-like numbers are NOT valid observations.
 // Only the same allowlisted, evidence-linked aggregate facts that can reach
 // the AI may promote a module to "collected".
 if(!factsFromEvidence(evidence).length)return 'insufficient';
 if(evidence.some(e=>e.metricId==='seo_search'&&e.coverage?.periodMatched!==true))
  return 'insufficient'; // PT reference snapshots cannot be weekly facts
 return 'collected';
}
// Surface a safe, actionable reason for missing statistics. Never expose
// raw tool errors, owner identifiers or underlying business rows.
function insufficientReason(result){
 if(result?.status==='unavailable'){
  const type=result?.error?.type;
  if(type==='data_unavailable')return '底层只读数据源查询失败或超时；需核查 Worker 查询日志';
  if(type==='query_budget_exceeded'||type==='investigation_budget_exceeded')
   return '只读调查预算已用尽，本次没有执行该查询';
  if(type==='permission_denied')return '当前任务没有该来源的读取权限';
  return '只读数据源暂不可用，无法核验统计';
 }
 const raw=(result?.evidence||[]).find(e=>
  e?.value?.available===false&&typeof e.value.reason==='string')?.value.reason;
 if(raw){
  const safe=raw.slice(0,120).replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[隐藏]');
  return '来源未提供可用指标：'+safe;
 }
 return '本周没有足够的可核对聚合指标，不能视作零';
}
function packModule(def,{status,reason,evidence=[],source='read-only',tool=def.tool}={}){
 const truncated=evidence.some(e=>Object.values(e?.value?.coverage||{})
  .some(row=>row?.truncated===true));
 const coverageReason=truncated&&status==='collected'?
  (reason||'已取得只读统计')+'；部分来源达到读取上限，结果为有界样本':reason;
 return {id:def.id,label:def.label,status,reason:cleanText(coverageReason||'',180),
  tool,source,evidenceIds:evidence.map(e=>e?.id).filter(id=>typeof id==='string').slice(0,4),
  facts:factsFromEvidence(evidence).slice(0,(def.id==='operations-timeline'?12:8))};
}
function initialCoverage(context,{allowedTools=[],availableSpecialties=[]}={}){
 const available=new Set(allowedTools),special=new Set(availableSpecialties);
 return {version:VERSION,modules:DEFINITIONS.map(def=>{
  if(def.id==='growth-overview'){
   const baseline=baselineEvidence(context);
   return packModule(def,{status:baseline.length?'collected':'insufficient',
    reason:baseline.length?'已归档基础周度指标，仍需模型证据引用':'缺少可用的基础指标证据',
    evidence:baseline,source:'business-snapshot'});
  }
  if(!available.has(def.tool))return packModule(def,{status:'not-connected',
   reason:'当前任务未授权或未连接对应只读能力'});
  if(['content-growth','follower-quality'].includes(def.id)&&!special.has(def.id))
   return packModule(def,{status:'not-connected',
    reason:'该账号尚无已保存的 X 内容或粉丝采集记录'});
  return packModule(def,{status:'not-investigated',reason:'本次尚未执行该模块的只读调查'});
 })};
}
// Leave model investigations available; one bounded read per module, no queries
// for the already-fetched business overview. The worker owns the existing
// authenticated registry session, so scopes and query limits are unchanged.
async function collectWeeklyCoverage({context,investigate,allowedTools,
 availableSpecialties=[],maxQueries=8,shouldContinue=async()=>{}}){
 if(!Number.isInteger(maxQueries)||maxQueries<0||maxQueries>10)
  throw Error('周报模块预查配额无效');
 const manifest=initialCoverage(context,{allowedTools,availableSpecialties});
 const byId=new Map(DEFINITIONS.map(def=>[def.id,def]));
 let used=0;
 // High-signal modules first; the remainder honestly stays not-investigated.
 const scheduledOrder=[
  'seo-organic','operations-timeline','channel-growth','activation-funnel',
  'retention','trade-conversion','revenue','kol-impact',
  'content-growth','follower-quality','referral-and-invite','login-conversion'
 ];
 const byModuleId=new Map(manifest.modules.map(row=>[row.id,row]));
 const scheduled=scheduledOrder.map(id=>byModuleId.get(id)).filter(Boolean);
 // Owner-owned X specialists are ordered before optional referral/login
 // modules. The fixed 10-query cap remains unchanged.
 const seen=new Set();
 for(const row of scheduled){
  if(seen.has(row.id))continue;
  seen.add(row.id);
  if(row.status!=='not-investigated'||used>=maxQueries)continue;
  const def=byId.get(row.id);
  await shouldContinue();
  used++;
  try{
   const result=await investigate({tool:def.tool,input:{
    scope:{source:'all'},start:context.period.start,end:context.period.end,limit:12
   }});
   const evidence=Array.isArray(result?.evidence)?result.evidence:[];
   const status=describeAvailable(result);
   const replacement=packModule(def,{status,
    reason:status==='collected'?'已取得只读统计；是否形成 AI 结论以证据引用为准':
     insufficientReason(result),evidence});
   Object.assign(row,replacement);
   if(evidence.length){
    const ids=new Set((context.evidence||[]).map(x=>x.id));
    for(const e of evidence)if(e?.id&&!ids.has(e.id)){
     context.evidence.unshift(e);ids.add(e.id);
    }
   }
  }catch(error){
   // A failed read cannot become a paid retry or an invented zero. If the
   // underlying registry says the query budget is exhausted, stop gracefully.
   row.status='insufficient';
   row.reason=error?.status===429?'只读查询预算已用尽':
    '模块数据不可用（只读查询失败）';
   if(error?.status===429)break;
  }
 }
 return {version:VERSION,modules:manifest.modules,queries:used};
}
function finalizeWeeklyCoverage(raw,analysis,{additionalEvidence=[]}={}){
 // Incorporate later AI-requested tool results without executing them again.
 // The tool journal remains the source of truth for whether a request ran.
 const updates=new Map();
 for(const entry of Array.isArray(additionalEvidence)?additionalEvidence:[]){
  const tool=entry?.query?.tool;
  if(typeof tool!=='string'||entry.result?.status==='not-executed')continue;
  const def=DEFINITIONS.find(x=>x.tool===tool);
  if(!def)continue;
  const evidence=Array.isArray(entry.result?.evidence)?entry.result.evidence:[];
  const status=describeAvailable(entry.result);
  const original=updates.get(def.id);
  if(original?.status==='collected'&&status!=='collected')continue;
  updates.set(def.id,packModule(def,{status,evidence,
   reason:status==='collected'?'AI 已调用对应模块，获得只读统计证据':
    insufficientReason(entry.result)}));
 }

 if(!raw||raw.version!==VERSION||!Array.isArray(raw.modules))return null;
 const analyzed=raw.modules.map(entry=>{
  const later=updates.get(entry.id);
  // The initial snapshot can be an aggregate summary; a later model query
  // may discover a real channel / funnel breakdown. Keep BOTH evidence sets
  // without reissuing any tool calls or losing the previous attribution.
  const chosen=entry.status==='collected'&&later?.status==='collected'?{
   ...entry,evidenceIds:[...new Set([...(entry.evidenceIds||[]),
    ...(later.evidenceIds||[])])].slice(0,8),
   facts:[...(entry.facts||[]),...(later.facts||[])].slice(0,12),
   reason:'已合并预查与后续只读调查证据'
  }:entry.status==='collected'?entry:(later||entry);
  const row={id:chosen.id,label:chosen.label,tool:chosen.tool,
   status:chosen.status,reason:chosen.reason,source:chosen.source,
   evidenceIds:[...(chosen.evidenceIds||[])].slice(0,8),
   facts:(chosen.facts||[]).filter(x=>typeof x.metric==='string'&&validNumber(x.value)).slice(0,12)};
  // A citation alone does not mean this module was analyzed. A
  // "data not provided" statement citing a channel query is a data gap,
  // not a verified channel finding. Require a real numeric observation,
  // linked to this module's evidence, in a factual claim.
  const claims=(analysis?.claims||[]).filter(claim=>
   claim?.kind==='fact'&&typeof claim.text==='string'&&
   Array.isArray(claim.evidenceIds)&&
   claim.evidenceIds.some(id=>row.evidenceIds.includes(id)));
  const looksLikeMissing=text=>/没有(?:提供|数据|足够)|未(?:提供|采集|同步|取得|能)|缺少|无法(?:判断|确认|核实)|数据不足|尚无/.test(text);
  const quotesObservedNumber=(text,n)=>{
   const value=String(n);
   const at=text.indexOf(value);
   if(at<0)return false;
   const before=text[at-1]||'',after=text[at+value.length]||'';
   return !/[0-9.]/.test(before)&&!/[0-9.]/.test(after);
  };
  const matchedClaim=row.status==='collected'?claims.find(claim=>
   !looksLikeMissing(claim.text)&&row.facts.some(fact=>
    (claim.evidenceIds.includes(fact.evidenceId)||
      (!fact.evidenceId&&claim.evidenceIds.some(id=>row.evidenceIds.includes(id))))&&
    quotesObservedNumber(claim.text,fact.value))):null;
  if(matchedClaim){
   row.status='analyzed';
   row.reason='已引用本模块可核对的数值事实与证据';
   row.insight=cleanText(matchedClaim.text,200);
   row.insightType='fact';
   const action=(analysis?.suggestions||[]).find(s=>
    Array.isArray(s?.evidence?.evidenceIds)&&
    s.evidence.evidenceIds.some(id=>row.evidenceIds.includes(id))&&
    typeof s.action==='string'&&s.action.trim());
   if(action)row.nextAction=cleanText(action.action,160);
  }
  return row;
 });
 return {version:VERSION,modules:analyzed,queries:raw.queries||0,
  counts:Object.fromEntries(['analyzed','collected','insufficient','not-connected','not-investigated']
   .map(status=>[status,analyzed.filter(x=>x.status===status).length]))};
}
function modelCoverage(raw){
 return (raw?.modules||[]).map(x=>({id:x.id,status:x.status,
  evidenceIds:(x.evidenceIds||[]).slice(0,3),
  reason:cleanText(x.reason,90)}));
}
module.exports={VERSION,DEFINITIONS,initialCoverage,collectWeeklyCoverage,
 finalizeWeeklyCoverage,modelCoverage,factsFromEvidence};
