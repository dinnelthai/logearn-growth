async function runAnalysis(kind,body,snapshot,audience,owner){
 const jobs=require('../../../services/analysisJobs'),{waitForJob}=require('../../../data/businessEvidence');
 const job=jobs.start(kind,body,snapshot,audience,owner);return waitForJob(job.id,owner,32000);
}
async function metrics(body,snapshot,ids,context){
 const evidence=require('../../../data/businessEvidence'),values={};
 const metrics=ids.map(id=>require('../metricRegistry').describeMetric(id));
 if(metrics.some(m=>!['north','growth','weekly'].includes(m.queryAdapter)))throw Object.assign(Error('该指标需要专用工具'),{status:400});
 let north,growth,weekly;
 if(metrics.some(m=>m.queryAdapter==='north'))north=await evidence.fetchNorthStar(body.start,body.end,body.source,snapshot);
 if(metrics.some(m=>m.queryAdapter==='growth'))growth=await evidence.fetchGrowthInsights({...body,snapshot});
 if(metrics.some(m=>m.queryAdapter==='weekly'))weekly=await evidence.fetchWeeklyCore({...body,snapshot});
 const entries=metrics.map(m=>{
  if(m.queryAdapter==='north')return {metricId:m.id,value:north.totals[m.id]??null};
  if(m.queryAdapter==='weekly')return {metricId:m.id,value:weekly.available?weekly.users:null,warnings:weekly.available?[]:['周核心指标不可用']};
  if(m.id==='registered_user_journey'){
   const registration=growth?.cohorts?.registration;
   if(registration?.available!==true)return {metricId:m.id,
    value:{available:false,registration:{available:false,
     reason:'注册事实不可用；完整业务旅程未知'}},
    warnings:['注册队列不可用，不能把缺失解释为零']};
   const activation=registration.metrics||{},engagement=registration.engagement;
   const trade=registration.trade||{available:false};
   const finite=value=>typeof value==='number'&&Number.isFinite(value);
   const denominator=finite(engagement?.eligible)?engagement.eligible:null;
   const entry=field=>finite(engagement?.[field])?engagement[field]:null;
   const rate=field=>denominator>0&&entry(field)!==null?entry(field)/denominator:null;
   const productEngagement=engagement?{
    eligible:denominator,pending:finite(engagement.pending)?engagement.pending:null,
    chip_analysis_users:entry('chip_analysis_users'),
    chip_analysis_rate:rate('chip_analysis_users'),
    holder_view_users:entry('holder_view_users'),
    holder_view_rate:rate('holder_view_users'),
    strategy_started_users:entry('strategy_started_users'),
    strategy_started_rate:rate('strategy_started_users'),
    signal_view_users:entry('signal_view_users'),
    signal_view_rate:rate('signal_view_users'),
    repeat_analysis_users:entry('repeat_analysis_users'),
    repeat_analysis_rate:rate('repeat_analysis_users'),
    window_ms:7*86400000,
    definition:'筹码、Holder、策略、信号及复访分别统计注册后7日内至少一次观测；共享已成熟注册账户分母，入口之间允许重叠，不是连续漏斗'
   }:null;
   const tradeAvailable=trade.available===true;
   const tradeConversion={
    available:tradeAvailable,engaged:finite(trade.engaged)?trade.engaged:null,
    eligible:tradeAvailable&&finite(trade.eligible)?trade.eligible:null,
    unmatched:tradeAvailable&&finite(trade.unmatched)?trade.unmatched:null,
    traders:tradeAvailable&&finite(trade.traders)?trade.traders:null,
    conversion_rate:tradeAvailable&&finite(trade.conversion_rate)?trade.conversion_rate:null,
    pending:finite(trade.pending)?trade.pending:null,
    not_engaged:finite(trade.not_engaged)?trade.not_engaged:null,
    association:'user-level-after-first-analysis',window_ms:7*86400000,
    definition:'首次筹码分析后168小时内任意已验证交易；分母仅身份可验证且满168小时用户；不是同Token归因或因果证明'
   };
   const warnings=[
    '注册账户来自 account_v2.created_at；首次筹码分析激活使用独立事件事实',
    '产品入口均为注册后7日并行观测，共享成熟注册账户分母，彼此可重叠，不能相加或画成串行漏斗',
    '交易转化以首次筹码分析为锚点，使用身份可验证的成熟账户；不代表同Token归因或因果关系',
    '事件历史完整性、注册源独立水位及交易源完整性尚未在真实环境验收'
   ];
   if(!productEngagement)warnings.push('注册后7日产品入口事实不可用，保持未知');
   if(!tradeAvailable)warnings.push('真实交易或账号身份关联不可用，交易转化未知而非零');
   if(registration.scope==='observed_source')
    warnings.push('来源归因仅覆盖已观测来源；未归因账户不会计入该来源');
   const grouped=body.dimensions?.includes('source');
   const bySource=grouped?Array.isArray(registration.bySource)?
    registration.bySource.slice(0,6).map(row=>{
     const act=row.activation||{},part=row.engagement||{};
     const e=finite(part.eligible)?part.eligible:null;
     const number=field=>finite(part[field])?part[field]:null;
     const groupRate=field=>e>0&&number(field)!==null?number(field)/e:null;
     return {source:row.source,users:row.users,
      activation:{eligible:act.eligible??null,activated:act.activated??null,
       pending:act.pending??null,rate:act.rate??null},
      engagement:{eligible:e,pending:part.pending??null,
       chip_analysis_users:number('chip_analysis_users'),
       holder_view_users:number('holder_view_users'),
       strategy_started_users:number('strategy_started_users'),
       signal_view_users:number('signal_view_users'),
       repeat_analysis_users:number('repeat_analysis_users'),
       chip_analysis_rate:groupRate('chip_analysis_users'),
       holder_view_rate:groupRate('holder_view_users'),
       strategy_started_rate:groupRate('strategy_started_users'),
       signal_view_rate:groupRate('signal_view_users'),
       repeat_analysis_rate:groupRate('repeat_analysis_users')}}}):null:null;
   if(grouped)warnings.push('按已观测来源对注册队列分组；未知来源单列，最多4个已观测来源，其余合并other；不证明渠道真实获客或增量');
   if(grouped)warnings.push('来源分组仅有注册、24小时激活和并行7日产品观测；交易事实无逐来源完整归因，不输出来源交易率');
   return {metricId:m.id,value:{available:true,registration:{
    users:finite(activation.users)?activation.users:null,
    activation:{eligible:finite(activation.eligible)?activation.eligible:null,
     activated:finite(activation.activated)?activation.activated:null,
     pending:finite(activation.pending)?activation.pending:null,
     rate:finite(activation.rate)?activation.rate:null,window_ms:86400000},
    engagement:productEngagement,trade:tradeConversion,
    ...(grouped?{bySource}:{}),
    coverage:{status:'partial',
     historyComplete:growth?.quality?.history_complete===true,
     eventsCompleteThrough:growth?.quality?.events_complete_through||null,
     reason:'账号创建、行为事件和交易来自不同事实源；只有事件源历史完整性标记可见，注册与交易独立水位仍未知'},
    definition:'按真实注册账号建立队列。先观察注册后24小时筹码分析激活；再分别观察注册后7日内各产品入口；交易另按首次分析后7日统计。并行产品入口不构成线性漏斗。'
   }},warnings};
  }
  if(m.id==='registered_users'){
   const registration=growth?.cohorts?.registration;
   const available=registration?.available===true;
   const count=available&&Number.isFinite(registration.metrics?.users)?registration.metrics.users:null;
   const warnings=['注册人数来自 account_v2.created_at，不使用首次分析用户替代'];
   if(!available||count===null)warnings.push('注册事实不可用或不完整，未知不能解释为0');
   if(registration?.scope==='observed_source')warnings.push('来源归因仅覆盖已观测来源；未归因账户不会计入该来源');
   return {metricId:m.id,value:count,warnings};
  }
  if(m.id==='registration_activation_rate'){
   const registration=growth?.cohorts?.registration,cohort=registration?.metrics;
   const available=registration?.available===true&&cohort&&
    Number.isFinite(cohort.eligible)&&Number.isFinite(cohort.activated)&&Number.isFinite(cohort.pending);
   const denominator=available?cohort.eligible:null,numerator=available?cohort.activated:null;
   const warnings=['注册激活定义：注册后24小时内首次筹码分析行为；仅已成熟注册队列进入分母'];
   if(!available)warnings.push('注册队列不可用，未知不能解释为0');
   if(available&&denominator===0)warnings.push('当前没有已成熟注册用户；比率为未知，不是0%');
   if(registration?.scope==='observed_source')warnings.push('来源归因仅覆盖已观测来源；未归因账户不会计入该来源');
   return {metricId:m.id,value:available&&denominator>0?cohort.rate:null,
    numerator,denominator,sampleSize:denominator,pending:available?cohort.pending:null,warnings};
  }
  if(m.id==='registered_trade_conversion_rate'){
   const trade=growth?.cohorts?.registration?.trade;
   const available=trade?.available===true&&Number.isFinite(trade.eligible)&&Number.isFinite(trade.traders);
   const denominator=available?trade.eligible:null,numerator=available?trade.traders:null;
   const warnings=['分母仅包含首次筹码分析后满7日且可验证账户身份的注册用户'];
   if(!available)warnings.push('交易事实或身份关联不可用，未知不能解释为0');
   if(available&&denominator===0)warnings.push('当前没有成熟且身份可验证的产品参与用户；比率为未知');
   warnings.push('按用户身份关联首次分析后7日内的任意链上交易；不是同Token交易归因或因果证明');
   if(available&&trade.unmatched>0)warnings.push('另有'+trade.unmatched+'名成熟用户身份未匹配，未计入分母');
   return {metricId:m.id,value:available&&denominator>0?trade.conversion_rate:null,
    numerator,denominator,sampleSize:denominator,
    pending:available?trade.pending:null,notEngaged:available?trade.not_engaged:null,
    unmatched:available?trade.unmatched:null,warnings};
  }
  const channels=growth.channels||[],rows=channels.map(c=>m.id==='d7'?c.d7:{eligible:c.eligible,returned:c.activated});
  const known=rows.length>0&&rows.every(r=>Number.isFinite(r?.eligible)&&Number.isFinite(r?.returned));
  const numerator=known?rows.reduce((n,r)=>n+r.returned,0):null,denominator=known?rows.reduce((n,r)=>n+r.eligible,0):null;
  return {metricId:m.id,value:denominator>0?numerator/denominator:null,numerator,denominator,sampleSize:denominator,warnings:denominator>0?[]:['没有成熟分母或成熟覆盖未知']};
 });
 const registration=growth?.cohorts?.registration;
 const registrationStatus=registration?.available===true?(registration.scope||'partial'):'unknown';
 const tradeStatus=registration?.trade?.available===true?'post_analysis_user_level':'unknown';
 // Per-metric coverage is deliberately conservative. A shared event snapshot
 // is NOT an independently validated registration or transaction watermark.
 const coverageFor=id=>{
  if(id==='registered_user_journey')return {status:registration?.available===true?'partial':'unavailable',
    reason:registration?.available===true?'注册、行为与交易来自不同事实源；成熟窗口已区分，但完整性和独立水位仍待验证':'注册事实不可用，完整业务旅程未知'};
   if(id==='registered_users')return {status:registration?.available===true?'partial':'unavailable',
   reason:registrationStatus==='observed_source'?
    '注册来自账号事实；来源仅覆盖已观测归因，注册水位仍待独立验证':
    registrationStatus==='unknown'?'注册来源不可用，人数未知':
    '注册来自账号事实；注册水位与历史完整性仍待独立验证'};
  if(id==='registration_activation_rate')return {
   status:registration?.available===true?'partial':'unavailable',
   reason:registrationStatus==='unknown'?'注册队列或事件来源不可用':
    '注册后24小时成熟队列；事件覆盖和注册水位尚未完整验证'};
  if(id==='registered_trade_conversion_rate')return {
   status:tradeStatus==='unknown'?'unavailable':'partial',
   reason:tradeStatus==='unknown'?'真实交易或身份关联未知，不能解释为零':
    '注册后首次分析的成熟用户级交易关联；非同Token归因，独立交易水位待核验'};
  if(id==='weekly_core')return {status:weekly?.available===true?'partial':'unavailable',
   reason:weekly?.available===true?'周核心指标为已有观测；事件完整性未确认':'周核心来源不可用'};
  return {status:'partial',reason:'当前为已观测事件指标；历史覆盖与采集完整性未确认'};
 };
 return {metrics:entries.map(entry=>({...entry,coverage:coverageFor(entry.metricId)})),
  coverage:{events:'partial',registrations:registrationStatus,trades:tradeStatus}};
}
async function economics(body,context){
 const db=require('../../../db/connection');
 if(body.source!=='all')throw Object.assign(Error('合作账本尚无完整来源归因，仅支持全来源范围'),{status:400});
 const collaborations=db.prepare('SELECT id FROM crm_collaborations WHERE owner_id=? AND start_at>=? AND start_at<? LIMIT 101').all(String(context.ownerId),body.start,body.end);
 if(collaborations.length>100)throw Object.assign(Error('合作数量超出预算，请缩小期间'),{status:422});
 const costs=[],revenues=[];
 for(const c of collaborations){costs.push(...db.prepare('SELECT * FROM crm_collaboration_costs WHERE collaboration_id=?').all(c.id));revenues.push(...db.prepare('SELECT * FROM crm_collaboration_revenue WHERE collaboration_id=? AND occurred_at>=? AND occurred_at<?').all(c.id,body.start,body.end));}
 return {byCurrency:require('../../../analytics/collaborationRevenue').revenueTotals(costs,revenues),coverage:{finance:'manual_records_only',revenue:revenues.length?'recorded':'unknown'},warnings:['各币种独立，不汇总币种；成本为期间开始合作批次账本，收入为期内流水，不代表全平台财务覆盖']};
}
async function activities(body,snapshot,audience,context){
 const db=require('../../../db/connection');
 const a=db.prepare('SELECT * FROM growth_activities WHERE id=? AND owner_id=?').get(context.scope.activityId,String(context.ownerId));
 if(!a)throw Object.assign(Error('活动不存在或无权限'),{status:404});
 const members=db.prepare('SELECT * FROM growth_activity_members WHERE activity_id=?').all(a.id).filter(m=>audience.includes(String(m.user_id)));
 const {memberFacts,memberMetrics}=require('../../../data/memberMetrics');
 const period={start:Math.max(body.start,a.start_at),end:Math.min(body.end,a.cutoff_at)};
 if(period.start>=period.end)throw Object.assign(Error('活动与查询期间无交集'),{status:400});
 const facts=await memberFacts(snapshot,members.map(m=>m.user_id),period);
 return {...memberMetrics(facts,members.map(m=>({id:m.user_id})),period,snapshot),coverage:facts.errors,warnings:['活动原始固定名单与查询期间交集；基线和分组仍以活动报告为准']};
}
// Dedicated owner-scoped specialist adapters. No model calls or external writes.
async function seoPerformance(body,context){
 const {createSeoStore,summarizeSeo}=require('../../growth/seoStore');
 const {createGscService,summarizeGsc,summarizeGscWindow}=require('../../growth/gscService');
 // Business periods are Bangkok-local; GSC dates are Pacific Time.
 // Prefer an exact snapshot. Otherwise a recent aggregate remains useful
 // as context, but must never be presented as period-matched evidence.
 const startDate=new Date(body.start+7*3600000).toISOString().slice(0,10);
 const endDate=new Date(body.end-1+7*3600000).toISOString().slice(0,10);
 const service=createGscService();
 const exact=await service.latest(context.ownerId,{siteUrl:body.siteUrl||null,startDate,endDate});
 // A larger stored GSC window may already contain the requested PT days.
 // Read it without re-syncing Google, widening access or making model calls.
 const overlapping=exact||await service.latestOverlapping(context.ownerId,{
  siteUrl:body.siteUrl||null,startDate,endDate
 });
 const latest=overlapping||await service.latest(context.ownerId,{siteUrl:body.siteUrl||null});
 const age=latest?Date.parse(endDate+'T00:00:00Z')-
  Date.parse(latest.end_date+'T00:00:00Z'):Infinity;
 // A covering snapshot may end AFTER the report week: do not discard it
 // as "too new". A wholly unrelated reference still uses the age limit.
 const connected=overlapping||(latest&&age>=0&&age<=31*86400000?latest:null);
 if(connected){
  const result=overlapping?
   summarizeGscWindow(connected,{startDate,endDate}):summarizeGsc(connected);
  const matched=!!overlapping&&result.coverage?.periodMatched===true;
  const maskPage=value=>{
   try{
    const url=new URL(value);
    if(url.protocol!=='https:'&&url.protocol!=='http:')return '[URL invalid]';
    const keys=[...new Set([...url.searchParams.keys()])];
    return url.origin+url.pathname+(keys.length?'?'+keys.map(key=>encodeURIComponent(key)+'=[redacted]').join('&'):'');
   }catch{return '[URL invalid]'}
  };
  return {...result,pages:result.pages.map(row=>({...row,page:maskPage(row.page)})),
   coverage:{...result.coverage,requestedBangkokDateLabels:{startDate,endDate},
    periodMatched:matched},
   warnings:[...result.warnings,
    'GSC 数据日期采用 PT，增长业务日期采用 Asia/Bangkok，不能直接逐日归因',
    ...(!matched?['所需 PT 日期未完整覆盖；当前 SEO 数值仅作部分/背景观察，不可计算完整周环比或站内转化归因']:[])]};
 }
 // Historical manual imports remain an explicit, limited fallback.
 const record=await createSeoStore().latestCovering(context.ownerId,{
   siteUrl:body.siteUrl||null,startDate,endDate
 });
 if(!record)return {available:false,
   reason:'当前站点尚未同步完全匹配所选日期的 GSC API 数据，且没有对应手动导入',
   coverage:{status:'not-synced',completeSearchTraffic:false},
   warnings:['不能将未同步的 Search Console 数据当作0曝光、0点击或排名变化']};
 return summarizeSeo(record,{startDate,endDate,limit:body.limit||20});
}
async function kolPerformance(body,context,snapshot){
 return require('../../growth/kolReader').createKolReader().summarize({
  ownerId:context.ownerId,start:body.start,end:body.end,source:body.source,
  limit:Math.min(body.limit||20,25),snapshot
 });
}
module.exports={runAnalysis,metrics,economics,activities,seoPerformance,kolPerformance};
