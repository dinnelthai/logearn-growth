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
 ['follower-quality','X 粉丝质量','get_follower_quality','follower_quality']
].map(([id,label,tool,metric])=>Object.freeze({id,label,tool,metric})));
const ALLOWED_NUMBERS=new Set([
 'active_users','new_users','returning_users','clicks','impressions','ctr','position',
 'users','visits','eligible','converted','returned','activated','registered',
 'success','started','pending','failed','rate','participation_rate',
 'views','likes','replies','retweets','posts','count','total',
 'trade','trades','volume','revenue','cost','bound','inviters'
]);
const validNumber=x=>typeof x==='number'&&Number.isFinite(x);
const cleanText=(value,max=180)=>String(value??'').slice(0,max);
function factsFromEvidence(evidence){
 const facts=[];
 const walk=(obj,prefix='',depth=0)=>{
  if(depth>3||!obj||typeof obj!=='object'||Array.isArray(obj)||facts.length>=4)return;
  for(const [key,value] of Object.entries(obj)){
   if(facts.length>=4)break;
   if(validNumber(value)&&ALLOWED_NUMBERS.has(key))
    facts.push({metric:prefix?prefix+'.'+key:key,value});
   else if(depth<3&&value&&typeof value==='object'&&!Array.isArray(value)&&
    ['metrics','summary','totals','global','conversion','product_chain','first_value',
     'referral','window','trade','xOfficial','counts'].includes(key))
    walk(value,prefix?prefix+'.'+key:key,depth+1);
  }
 };
 for(const evidenceRow of evidence.slice(0,2))walk(evidenceRow.value);
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
 if(evidence.every(e=>e?.value?.available===false||e?.value==null))return 'insufficient';
 // A nominally successful tool request with no observed statistic should
 // remain a data gap; it is not proof that a business outcome was observed.
 const containsStatistic=(value,depth=0)=>{
  if(depth>4||value==null)return false;
  if(validNumber(value))return true;
  if(Array.isArray(value))return value.slice(0,8).some(x=>containsStatistic(x,depth+1));
  if(typeof value!=='object')return false;
  return Object.entries(value).slice(0,28).some(([key,v])=>
   ALLOWED_NUMBERS.has(key)&&validNumber(v)||
   (typeof v==='object'&&containsStatistic(v,depth+1)));
 };
 if(!evidence.some(e=>containsStatistic(e.value)))return 'insufficient';
 if(evidence.some(e=>e.metricId==='seo_search'&&e.coverage?.periodMatched!==true))
  return 'insufficient'; // reference-only GSC must not qualify as weekly analyzed
 return 'collected'; // only model citations can promote a source to analyzed
}
function packModule(def,{status,reason,evidence=[],source='read-only',tool=def.tool}={}){
 return {id:def.id,label:def.label,status,reason:cleanText(reason||'',180),
  tool,source,evidenceIds:evidence.map(e=>e?.id).filter(id=>typeof id==='string').slice(0,4),
  facts:factsFromEvidence(evidence).slice(0,4)};
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
 const scheduled=[
  ...manifest.modules.filter(x=>!['content-growth','follower-quality'].includes(x.id)),
  ...manifest.modules.filter(x=>['content-growth','follower-quality'].includes(x.id))
 ];
 // Specialists are elevated when owner-owned X data exists, without
 // increasing the fixed query cap.
 if(availableSpecialties.length){
  const special=scheduled.filter(x=>availableSpecialties.includes(x.id));
  const first=scheduled.findIndex(x=>x.id==='revenue');
  scheduled.splice(first,0,...special);
 }
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
     result?.status==='unavailable'?'当前数据源暂不可用，不能视作零':
     '本周没有足够的可核对聚合指标，不能视作零',evidence});
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
    'AI 已调查，但当前来源没有足够的可核对指标'}));
 }

 if(!raw||raw.version!==VERSION||!Array.isArray(raw.modules))return null;
 const claimed=new Set((analysis?.claims||[]).flatMap(c=>c?.evidenceIds||[]));
 const analyzed=raw.modules.map(entry=>{
  const chosen=entry.status==='collected'?entry:(updates.get(entry.id)||entry);
  const row={id:chosen.id,label:chosen.label,tool:chosen.tool,
   status:chosen.status,reason:chosen.reason,source:chosen.source,
   evidenceIds:[...(chosen.evidenceIds||[])].slice(0,4),
   facts:(chosen.facts||[]).filter(x=>typeof x.metric==='string'&&validNumber(x.value)).slice(0,4)};
  const rankedClaims=(analysis?.claims||[]).filter(claim=>
   Array.isArray(claim?.evidenceIds)&&
   claim.evidenceIds.some(id=>row.evidenceIds.includes(id))&&
   typeof claim.text==='string'&&claim.text.trim());
  const matchedClaim=rankedClaims.find(x=>x.kind==='fact')||
   rankedClaims.find(x=>x.kind==='hypothesis')||rankedClaims[0];
  if(row.status==='collected'&&matchedClaim&&
     matchedClaim.evidenceIds.some(id=>claimed.has(id))){
   row.status='analyzed';
   row.reason='AI 结论已引用该模块的可验证证据';
   row.insight=cleanText(matchedClaim.text,200);
   row.insightType=matchedClaim.kind==='hypothesis'?'hypothesis':
    matchedClaim.kind==='fact'?'fact':'recommendation';
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
