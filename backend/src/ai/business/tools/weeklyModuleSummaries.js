'use strict';
// Strict statistics-only projections for existing, owner-scoped tool results.
// Source accounts, per-user rows and raw post content never leave their adapters.
const {CURRENCIES}=require('../../../analytics/collaborationCosts');
const number=x=>typeof x==='number'&&Number.isFinite(x);
// Convert only exact decimal totals that fit a safe integer. Never use a
// floating-point currency sum or silently round an oversized amount.
const minorUnits=(text,currency)=>{
 const decimals=CURRENCIES[currency];
 if(!Number.isInteger(decimals)||typeof text!=='string')return null;
 const match=/^(-?)(\d+)\.(\d+)$/.exec(text);
 if(!match||match[3].length!==decimals)return null;
 const units=BigInt(match[2])*(10n**BigInt(decimals))+BigInt(match[3]);
 const signed=match[1]? -units:units;
 return signed>=BigInt(Number.MIN_SAFE_INTEGER)&&signed<=BigInt(Number.MAX_SAFE_INTEGER)?
  Number(signed):null;
};
const nonnegative=x=>number(x)&&x>=0?x:null;
const sum=values=>values.reduce((n,x)=>n+x,0);
const safeDimension=x=>typeof x==='string'&&/^[a-z0-9_-]{1,40}$/i.test(x)?x.toLowerCase():null;
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>number(o?.[k])).map(k=>[k,o[k]]));

function loginSummary(payload){
 const base=payload?.login||{};
 const counts=base.counts||{};
 const stages=Array.isArray(payload?.stages?.rows)?payload.stages.rows:[];
 const stageRows=stages.slice(0,8).map((s,i)=>({
  key:safeDimension((s.method||'login')+'_'+(s.stage||i))||'stage'+i,
  ...pick(s,['started','success','failed','cancelled','pending','unknown',
   'conflict','success_rate'])
 }));
 const conversion={
  ...pick(base,['requests','users','success_rate','terminal_coverage',
   'observed_completion_rate']),
  ...pick(counts,['success','failed','cancelled','pending','unknown','conflict']),
  ...pick(payload,['click_users','record_total']),
  stages:stageRows
 };
 const available=number(base.requests)&&base.requests>0||
  number(payload?.click_users)&&payload.click_users>0||
  number(payload?.record_total)&&payload.record_total>0||
  stageRows.some(x=>number(x.started)&&x.started>0);
 return {available:!!available,
  ...(!available?{reason:'本周未观测到可核验的登录请求或点击'}:{}),
  conversion,coverage:{status:'partial',reason:'仅已观测的登录请求和事件，不把未知或未成熟转化当失败'},
  warnings:['登录点击、请求和成功事件分别统计；不等于首次注册人数或全站新增']};
}
function economicsSummary(payload){
 const rows=Array.isArray(payload?.byCurrency)?payload.byCurrency:[];
 const chosen=rows.filter(r=>safeDimension(r.currency)).slice(0,12);
 const received=chosen.map(r=>nonnegative(r.income_entries)).filter(number);
 const groups=chosen.map(r=>{
  const source=safeDimension(r.currency);
  const netRevenueMinor=minorUnits(r.net_revenue,r.currency);
  const actualCostMinor=minorUnits(r.actual_cost,r.currency);
  return {source,...pick(r,['income_entries','roi']),
   ...(number(netRevenueMinor)?{netRevenueMinor}:{}),
   ...(number(actualCostMinor)?{actualCostMinor}:{}),
   ...(number(netRevenueMinor)||number(actualCostMinor)?
    {decimalPlaces:CURRENCIES[r.currency]}:{})};
 });
 return {available:chosen.length>0,
  ...(!chosen.length?{reason:'当前统计窗口没有已登记的合作收入或成本币种记录'}:{}),
  ...(chosen.length?{economics:{currencyCount:chosen.length,
   ...(received.length?{receivedEntries:sum(received)}:{})}}:{}),
  groups,coverage:payload?.coverage||{status:'unknown'},
  warnings:[...(payload?.warnings||[]),
   '账本金额仅在精确可表示时按最小币种单位传输，须除以10的decimalPlaces次方；不能直接把整数当美元；此为人工合作账本，不代表全平台收入']};
}
function kolSummary(payload){
 if(payload?.available!==true)return {available:false,
  reason:typeof payload?.reason==='string'?payload.reason:'KOL 绩效来源未连接或无已登记档案',
  coverage:{status:'unavailable'},
  warnings:[payload?.reason||'KOL来源暂无可核验的绩效记录']};
 const rows=Array.isArray(payload.rows)?payload.rows:[];
 const measured=rows.filter(r=>number(r.observedUsers));
 if(!measured.length)return {available:false,
  reason:'已登记KOL档案，但没有可核验的归组用户表现',
  coverage:payload.coverage||{status:'partial'},
  warnings:['仅有KOL档案，缺少可核验的归组用户统计，不能当作绩效观测']};
 return {available:true,summary:{
  measuredProfiles:measured.length,
  profilesWithObservedUsers:measured.filter(r=>r.observedUsers>0).length,
  profilesWithAnalysis:rows.filter(r=>number(r.analysisUsers)&&r.analysisUsers>0).length,
  profilesWithTrade:rows.filter(r=>number(r.tradeUsers)&&r.tradeUsers>0).length,
  maxObservedUsers:Math.max(...measured.map(r=>r.observedUsers))
 },coverage:payload.coverage||{status:'partial'},
 warnings:[...(payload.warnings||[]),
  'KOL分组可能重叠；只记录档案数量和单档案最高观测人数，不把各档案人数相加当独立获客']};
}
function contentSummary(payload){
 if(payload?.available!==true){
  const historicalGap=payload?.coverage?.status==='snapshots-after-cutoff';
  const laterAt=Number(payload?.coverage?.laterObservedAt);
  const cutoff=Number(payload?.coverage?.cutoff);
  const dates=historicalGap&&Number.isFinite(laterAt)&&laterAt>0&&
   Number.isFinite(cutoff)&&cutoff>0?
   '（报告截止 '+new Date(cutoff).toISOString().slice(0,10)+
   '，已有采集 '+new Date(laterAt).toISOString().slice(0,10)+'）':'';
  return {available:false,
   reason:historicalGap?
    '已有 X 官方内容及较晚采集的累计指标'+dates+
    '，但缺少报告截止前的指标快照，不能还原当周浏览或互动':
    '当前窗口没有可核验的X内容历史指标',
   coverage:payload?.coverage||{status:'unavailable'},
   warnings:[historicalGap?
    '已保存的X数据晚于报告期，可用于当前内容诊断，不可倒填历史周报':
    '没有报告期内已保存的X内容指标，不能按零曝光处理']};
 }

 const manual=payload.summary?.x||{};
 const accounts=Array.isArray(payload.xOfficial?.accounts)?
  payload.xOfficial.accounts:[];
 const groups=accounts.slice(0,4).map((a,i)=>({
  source:safeDimension(a.account)||'account'+i,
  ...pick(a,['sampledPosts','measuredPosts','measuredImpressions',
   'measuredEngagementRate','followerChange'])
 }));
 const manualStats=pick(manual,['count','impressions']);
 return {available:true,
  manual:manualStats,
  official:{observedAccounts:groups.filter(a=>a.sampledPosts>0).length,
   measuredPosts:sum(groups.map(a=>a.measuredPosts||0)),
   ...(groups.some(a=>number(a.measuredImpressions))?
    {measuredImpressions:sum(groups.filter(a=>number(a.measuredImpressions))
     .map(a=>a.measuredImpressions))}:{})},
  groups,coverage:payload.coverage||{status:'partial'},
  warnings:['官方X帖文的观看和互动为最近30天样本的累计快照，不是当周新增曝光',
   '人工登记与官方抓取来源分开；不发送推文正文或原始账号行',
   ...(payload.warnings||[]).slice(0,2)]};
}
function followerSummary(payload){
 if(payload?.available!==true)return {available:false,
  reason:'当前窗口没有已保存的X粉丝扫描分类',
  coverage:payload?.coverage||{status:'unavailable'},
  warnings:['当前统计窗口没有已扫描的粉丝分类记录']};
 const rows=Array.isArray(payload.segments)?payload.segments:[];
 const chosen=rows.filter(r=>number(r.n)).slice(0,50);
 if(!chosen.length)return {available:false,
  reason:'当前窗口没有可核验的X粉丝分类计数',
  coverage:payload.coverage||{status:'partial'},
  warnings:['没有可核对的粉丝分类计数']};
 const grouped=new Map();
 for(const r of chosen){
  const category=safeDimension(r.category)||'other';
  const current=grouped.get(category)||{source:category,records:0,analyzed:0,reviewed:0};
  current.records+=r.n;
  if(number(r.analyzed))current.analyzed+=r.analyzed;
  if(number(r.reviewed))current.reviewed+=r.reviewed;
  grouped.set(category,current);
 }
 return {available:true,summary:{
  scannedRecords:sum(chosen.map(r=>r.n)),
  analyzedRecords:sum(chosen.filter(r=>number(r.analyzed)).map(r=>r.analyzed)),
  reviewedRecords:sum(chosen.filter(r=>number(r.reviewed)).map(r=>r.reviewed))
 },groups:[...grouped.values()].sort((a,b)=>b.records-a.records).slice(0,6),
  coverage:payload.coverage||{status:'partial'},
  warnings:['为当前窗口内已扫描分类记录计数，不代表全账号粉丝总量、独立用户或真实购买意图',
   ...(payload.warnings||[]).slice(0,2)]};
}
module.exports={loginSummary,economicsSummary,kolSummary,contentSummary,followerSummary};
