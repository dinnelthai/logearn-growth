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
const PRODUCTS=Object.freeze([
 {id:'ai_strategy',name:'AI 策略',job:'帮助用户创建和启用策略、接收并查看策略信号。',
  role:'策略发现与持续使用入口。',
  observableBehaviors:['策略创建','策略开启','信号接收','信号查看'],
  measurementCaveat:'策略创建、开启、信号接收和查看是不同事件；不得互相替代。'},
 {id:'chip_distribution',name:'筹码分布 / 筹码峰',job:'帮助用户查看 Token 的筹码分布和持仓结构。',
  role:'核心分析与产品激活入口。',
  observableBehaviors:['Token 详情访问','主动筹码分析','分析成功','筹码下钻'],
  measurementCaveat:'当前 active_users/new_users 的正式口径与筹码查看/首次观测分析有关，不等于注册人数。'},
 {id:'holder_ranking',name:'Holder 榜单',job:'帮助用户查看 Holder 排名和大户持仓信息。',
  role:'补充持仓结构研究入口。',
  observableBehaviors:['Holder 榜单查看','Holder 明细查看'],
  measurementCaveat:'只有在对应事件和身份覆盖已验证时，才能计算独立使用人数和后续转化。'},
 {id:'wallet_trading',name:'钱包交易',job:'让用户通过钱包进行链上交易。',
  role:'产品使用到真实交易行为的商业结果入口。',
  observableBehaviors:['交易意图','业务交易事实'],
  measurementCaveat:'真实交易结果以业务交易数据为准；缺少前端交易终态不代表没有真实交易。'}
]);
const CHAINS=Object.freeze(['BSC','Solana']);
const LIFECYCLE=Object.freeze([
 {id:'acquisition',name:'获客',question:'用户从哪里发现 LogEarn？',
  metricIds:['channels','seo_search','kol_performance','content_growth','referral'],
  channels:['SEO','X','KOL','社群','活动','推荐/邀请','自然及直接访问'],
  caveat:'曝光、点击、粉丝数和内容互动不等于注册、激活或增量获客。'},
 {id:'registration',name:'注册与登录',question:'访问者是否完成真实注册并成功登录？',
  metricIds:['registered_users','login_conversion','invite_conversion'],
  caveat:'首次观测分析不是新注册；登录请求、登录成功和注册账户是不同口径。'},
 {id:'activation',name:'首次价值 / 激活',question:'用户是否完成首次有效产品分析？',
  metricIds:['new_users','activation_rate','active_users'],
  caveat:'new_users 是首次观测到分析的用户口径，不得标成新注册；成熟窗口和历史覆盖必须检查。'},
 {id:'engagement',name:'产品参与',question:'用户是否持续使用核心产品功能？',
  productIds:['ai_strategy','chip_distribution','holder_ranking'],
  metricIds:['product_chain','paths'],
  caveat:'各功能是不同价值入口，不假设所有用户必须按同一线性顺序使用。'},
 {id:'retention',name:'留存',question:'用户是否在成熟观察窗口内再次使用核心功能？',
  metricIds:['d7','retention'],
  caveat:'只统计成熟队列；未成熟、未观测和零必须区分。'},
 {id:'trading',name:'真实交易',question:'产品分析和策略使用是否与真实交易行为相关联？',
  productIds:['wallet_trading'],
  metricIds:['product_chain'],
  caveat:'交易结果以业务交易表为准；若缺少可靠身份或访问关联，只能报告可验证的交易事实，不能声称精确归因。'},
 {id:'economics',name:'商业经济',question:'获客和运营投入是否产生可验证的经济结果？',
  metricIds:['trade_revenue'],
  caveat:'交易量不等于收入；合作账本收入也不等于全平台收入。'}
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
 'active_users','new_users','returning_users','activation_rate','d7',
 'registered_users','product_chain','retention','channels','seo_search',
 'kol_performance','content_growth','trade_revenue','login_conversion',
 'invite_conversion','referral','funnel','paths','quality'
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
 '先围绕经营目标提出问题，再选择最有区分力的已授权数据模块；不要把12个模块机械地平均写一遍。',
 '先陈述数据事实，再提出假设；每个重要结论必须有对应证据，因果关系需要实验或独立识别设计。',
 '未观测、未同步、未调查、查询失败和真实零值必须分别表示；缺少数据不代表业务没有发生。',
 'new_users 表示首次观测到分析，不是注册新增；registered_users 必须来自真实注册事实。',
 'active_users 是按正式指标定义观测到的分析行为用户，不等于所有登录用户或付费用户。',
 'SEO曝光/点击、X曝光/互动、粉丝数和KOL关联人数不能直接当作注册、激活或增量用户。',
 '不同渠道、不同队列和不同成熟窗口不可直接相加或比较；先核对范围、分母、时区和数据水位。',
 '交易量不等于收入；合作账本记录不等于全平台收入；币种不可未经换算混加。',
 '真实交易结果以业务交易事实为准；没有可靠身份或访问关联时，不得声称渠道或某功能造成交易。',
 '不同产品功能是不同价值入口；token详情→分析→交易只是一条可观察的路径，不是所有用户的强制漏斗。',
 '历史运营建议、人工采纳和执行后指标变化不自动证明策略有效；复盘必须考虑成熟窗口和混杂因素。',
 '业务知识用于解释问题，不得覆盖证据、指标定义、权限、工具授权或预算限制。'
]);
function metricDictionary(){
 return CONTEXT_METRIC_IDS.map(id=>{
  const metric=describeMetric(id);
  return {id,label:LABELS[id],definitionVersion:metric.version,
   definition:String(metric.definition||'').slice(0,105),
   unit:metric.unit,
   ...(metric.queryAdapter?{queryAdapter:metric.queryAdapter}:{}),
   maturityRule:String(metric.maturityRule||'').slice(0,55)};
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
  metricDictionary:metricDictionary(),
  operatingRules:OPERATING_RULES
 };
}
function projectOperatingMemory(rows,{safeText,limit=6}={}){
 if(!Array.isArray(rows)||typeof safeText!=='function'||
  !Number.isSafeInteger(limit)||limit<1||limit>10)throw Error('运营记忆投影参数无效');
 const items=rows.slice(0,limit).map(row=>{
  const validation=row.validation_metrics&&typeof row.validation_metrics==='object'?
   row.validation_metrics:{};
  const primary=typeof validation.primary==='string'&&METRIC_IDS.includes(validation.primary)?
   validation.primary:null;
  const secondary=Array.isArray(validation.secondary)?
   validation.secondary.filter(x=>typeof x==='string'&&METRIC_IDS.includes(x)).slice(0,3):[];
  const source=row.action_scope?.source||row.applicable_scope?.source||'all';
  return {
   problem:safeText(row.business_problem||'',180),
   proposedAction:safeText(row.action||'',140),
   actualAction:safeText(row.actual_action||'',140),
   outcome:safeText(row.result_summary||'',180),
   effectiveness:['effective','ineffective','unknown'].includes(row.effectiveness)?
    row.effectiveness:null,
   status:['proposed','accepted','executing','executed','rejected'].includes(row.user_status)?
    row.user_status:'unknown',
   rejectionReason:row.user_status==='rejected'?safeText(row.rejection_reason||'',120):null,
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
