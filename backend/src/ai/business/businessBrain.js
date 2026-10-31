'use strict';

// Versioned, compact operator-approved knowledge for LogEarn Growth Agent.
// This is business context, not a source of numeric observations or permissions.
const {describeMetric}=require('./metricRegistry');

const VERSION='logearn-business-brain-v1';
const BUSINESS=Object.freeze({
 name:'LogEarn',
 category:'Web3 Token Research, On-chain Analytics and Wallet Trading',
 purpose:'帮助用户研究 Token、理解筹码与持仓结构、使用策略信号，并在需要时通过钱包进行交易。',
 northStarIntent:{
  statement:'有效分析用户，并关注其带来的真实交易量。',
  status:'operator-direction-not-a-validated-composite-kpi',
  caveat:'在身份关联、有效分析定义、交易事实覆盖和观察窗口统一前，不得将其合并成一个未经验证的单一数值。'
 }
});
const CHAINS=Object.freeze(['BSC','Solana']);
const PRODUCTS=Object.freeze([
 {id:'ai_strategy',name:'AI 策略',role:'策略创建/开启与信号使用。',
  signals:['策略创建','策略开启','信号接收','信号查看'],caveat:'各事件不可互相替代。'},
 {id:'chip_distribution',name:'筹码峰',role:'Token 筹码分布与持仓结构分析；核心分析入口。',
  signals:['Token详情','主动分析','分析成功','下钻'],caveat:'首次分析不是注册。'},
 {id:'holder_ranking',name:'Holder 榜单',role:'Holder 排名和大户持仓明细。',
  signals:['榜单查看','Holder明细'],caveat:'需核对身份及事件覆盖。'},
 {id:'wallet_trading',name:'钱包交易',role:'钱包发起链上交易。',
  signals:['交易意图','业务交易事实'],caveat:'真实交易以业务交易数据为准。'}
]);
const LIFECYCLE=Object.freeze([
 {id:'acquisition',name:'获客',metricIds:['channels','seo_search','kol_performance','content_growth','referral'],caveat:'渠道曝光互动不等于站内激活。'},
 {id:'registration',name:'注册/登录',metricIds:['registered_users','login_conversion','invite_conversion'],caveat:'注册、登录、首次分析是不同事实。'},
 {id:'activation',name:'首次价值/激活',metricIds:['new_users','activation_rate','active_users'],caveat:'new_users 是首次观测分析，不是新注册。'},
 {id:'engagement',name:'产品参与',productIds:['ai_strategy','chip_distribution','holder_ranking'],metricIds:['product_chain','paths'],caveat:'多价值入口，不是强制线性漏斗。'},
 {id:'retention',name:'留存',metricIds:['d7','retention'],caveat:'只比较成熟队列。'},
 {id:'trading',name:'真实交易',productIds:['wallet_trading'],metricIds:['product_chain','volume_usd'],caveat:'身份/访问关联不足时不声称精确归因。'},
 {id:'economics',name:'商业经济',metricIds:['trade_revenue'],caveat:'交易量不等于收入；合作账本不等于全平台收入。'}
]);
const LABELS=Object.freeze({
 active_users:'分析活跃用户',new_users:'首次分析用户',returning_users:'回访分析用户',
 activation_rate:'激活率',d7:'D7 留存',weekly_core:'周核心用户',
 registered_users:'注册用户',trade_revenue:'已登记合作收入',
 funnel:'转化漏斗',paths:'行为路径',product_chain:'产品到交易链路',
 retention:'用户留存',channels:'渠道获客',segments:'用户分群',
 activities:'运营活动',quality:'数据质量',seo_search:'SEO / Search Console',
 kol_performance:'KOL 效果',content_growth:'内容增长',
 follower_quality:'粉丝质量',referral:'推荐转化',
 login_conversion:'登录转化',invite_conversion:'邀请转化'
});
const METRIC_IDS=Object.freeze(Object.keys(LABELS));
const CONTEXT_METRIC_IDS=Object.freeze([
 'registered_users','new_users','active_users','returning_users','activation_rate',
 'd7','channels','seo_search','kol_performance','content_growth',
 'product_chain','volume_usd','trade_revenue','login_conversion','retention'
]);
const GOAL_FOCUS=Object.freeze({
 activation:{objective:'提高首次有效产品分析用户，同时辨别注册、访问、登录与首次分析之间的真实断点。',
  stages:['acquisition','registration','activation'],priorityMetrics:['new_users','registered_users','activation_rate','active_users']},
 retention:{objective:'提高成熟用户的持续产品使用，先确认队列成熟度和可观测覆盖。',
  stages:['engagement','retention'],priorityMetrics:['active_users','returning_users','d7','retention']},
 conversion:{objective:'理解从产品价值行为到真实交易的可验证转化，不把点击意图当成成交。',
  stages:['activation','engagement','trading'],priorityMetrics:['product_chain','active_users']},
 revenue:{objective:'核对真实交易和已记录收入、成本，分清交易量、收入与合作账本。',
  stages:['trading','economics'],priorityMetrics:['product_chain','trade_revenue']}
});
const OPERATING_RULES=Object.freeze([
 '围绕经营目标分析，再选能解决关键歧义的已授权模块；不机械罗列。',
 '事实、假设和行动分开；重要事实必须有证据，相关性不等于因果。',
 '未观测、未同步、未调查、查询失败和真实零值分别表示。',
 '首次分析不是注册；active_users、new_users 和 registered_users 严格区分。',
 'SEO/X/KOL曝光、点击、粉丝和互动不等于站内注册、激活或增量。',
 '比较前核对渠道、队列、分母、时区、范围和成熟窗口。',
 '交易量不等于收入；合作账本不等于全平台收入；关联不足不声称归因。',
 '多产品价值入口非强制漏斗；采纳和前后变化不证明有效；知识不覆盖证据/权限/预算。'
]);
function metricDictionary(){
 return CONTEXT_METRIC_IDS.map(id=>{
  const metric=describeMetric(id);
  const meaning=String(metric.definition||'').slice(0,45);
  const maturity=String(metric.maturityRule||'').slice(0,16);
  return {id,label:LABELS[id],unit:metric.unit,
   meaning:maturity?meaning+'；'+maturity:meaning};
 });
}
function buildBusinessBrainContext({focusGoal='activation'}={}){
 const focus=GOAL_FOCUS[focusGoal]||GOAL_FOCUS.activation;
 return {
  version:VERSION,
  business:BUSINESS,
  productMap:{chains:CHAINS,products:PRODUCTS,
   principle:'产品功能是多个价值入口；只有具备事件和身份关联证据时，才将跨功能行为组成漏斗。'},
  lifecycle:LIFECYCLE,
  focus:{goal:GOAL_FOCUS[focusGoal]?focusGoal:'activation',
   objective:focus.objective,stages:focus.stages,priorityMetrics:focus.priorityMetrics},
  metricDictionaryVersion:'1',
  metricDictionary:metricDictionary(),
  operatingRules:OPERATING_RULES
 };
}
function projectOperatingMemory(rows,{safeText,limit=3}={}){
 if(!Array.isArray(rows)||typeof safeText!=='function'||
  !Number.isSafeInteger(limit)||limit<1||limit>5)throw Error('运营记忆投影参数无效');
 const items=rows.slice(0,limit).map(row=>{
  const validation=row.validation_metrics&&typeof row.validation_metrics==='object'?
   row.validation_metrics:{};
  const primary=typeof validation.primary==='string'&&METRIC_IDS.includes(validation.primary)?
   validation.primary:null;
  const secondary=Array.isArray(validation.secondary)?
   validation.secondary.filter(x=>typeof x==='string'&&METRIC_IDS.includes(x)).slice(0,3):[];
  const source=row.action_scope?.source||row.applicable_scope?.source||'all';
  return {
   problem:safeText(row.business_problem||'',100),
   proposedAction:safeText(row.action||'',80),
   actualAction:safeText(row.actual_action||'',80),
   outcome:safeText(row.result_summary||'',100),
   effectiveness:['effective','ineffective','unknown'].includes(row.effectiveness)?
    row.effectiveness:null,
   status:['proposed','accepted','executing','executed','rejected'].includes(row.user_status)?
    row.user_status:'unknown',
   rejectionReason:row.user_status==='rejected'?safeText(row.rejection_reason||'',80):null,
   validationMetrics:{primary,secondary},
   source:typeof source==='string'&&/^[a-z0-9_-]{1,80}$/i.test(source)?source:'all',
   executedAt:Number.isSafeInteger(row.executed_at)?row.executed_at:null,
   reviewedAt:Number.isSafeInteger(row.reviewed_at)?row.reviewed_at:null
  };
 }).filter(x=>x.problem||x.proposedAction||x.actualAction||x.outcome);
 return {
  status:items.length?'available':'no_saved_history',
  source:'owner-scoped AI suggestions and reviewed experiences',
  total:rows.length,shown:items.length,items,
  limitation:'这是现有AI建议及复盘记录，不是全部KOL、SEO、X、社群、活动或人工运营历史；未记录不代表未执行。'
 };
}
module.exports={VERSION,BUSINESS,PRODUCTS,CHAINS,LIFECYCLE,LABELS,METRIC_IDS,
 GOAL_FOCUS,OPERATING_RULES,metricDictionary,buildBusinessBrainContext,projectOperatingMemory};
