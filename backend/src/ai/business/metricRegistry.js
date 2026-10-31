const {definitions}=require('../../analytics/businessPriorities');
const {REVIEW_METRICS}=require('../growth/reviewMetrics');
const specs={
 active_users:['users','north','north','统计期内去重，不是DAU'],new_users:['users','north','north','历史覆盖影响首次观测'],returning_users:['users','north','north','历史覆盖影响回访分类'],
 activation_rate:['ratio','growth','growth','首次观测后24小时成熟'],d7:['ratio','growth','growth','第7业务日成熟队列'],weekly_core:['users','weekly',null,'7个完整UTC+7业务日'],
 registered_users:['users','growth',null,'真实注册事实；首次观测不能替代'],registration_activation_rate:['ratio','growth',null,'注册后24小时内首次筹码分析行为；仅成熟注册队列进入分母；当前复盘服务尚无直接读取能力'],registered_trade_conversion_rate:['ratio','growth',null,'注册后首次筹码分析行为后7日内发生真实交易；仅成熟且身份可验证用户进入分母，用户级非同Token关联；当前复盘服务尚无直接读取能力'],trade_revenue:['currency','platform-revenue-unavailable',null,'平台真实收入尚无已核验的直接数据源，不得用成交量或合作账本代替'],collaboration_economics:['report','economics',null,'CRM人工合作账本的多币种收入及成本；不代表全平台实际收入或交易费收入'],
 funnel:['report','funnel',null,'转化窗口与数据截至时间'],paths:['report','paths',null,'完整观测窗口'],product_chain:['report','product-chain',null,'真实交易覆盖未知不等于失败'],
 retention:['report','retention',null,'只比较成熟队列'],channels:['report','channels',null,'成熟分母与待成熟样本分开'],segments:['report','segments',null,'固定范围'],activities:['report','activities',null,'固定名单及活动时间窗'],quality:['report','quality',null,'各源分别报告水位与覆盖'],
 seo_search:['report','seo-performance',null,'用户导入的GSC查询明细；非整站全量；与站内业务日口径不同'],
 kol_performance:['report','kol-performance',null,'KOL CRM人工关联账户的观测数据，不是因果增量'],
 content_growth:['report','content-growth',null,'累计内容指标只来自人工登记，非自动归因'],
 follower_quality:['report','follower-quality',null,'部分已采集粉丝的粗粒度分类'],
 referral:['report','referral',null,'只计算已验证推荐绑定，绑定不等于新增注册或增量获客'],
 login_conversion:['report','login-conversion',null,'仅已观测登录流程与状态，不把待成熟当失败'],
 invite_conversion:['report','invite-conversion',null,'绑定、注册关系与邀请链接漏斗分别标注可观测覆盖']
};
const registry=Object.fromEntries(Object.entries(specs).map(([id,[unit,queryAdapter,declaredReviewAdapter,maturityRule]])=>{
 const reviewAdapter=REVIEW_METRICS[id]?.adapter||null;
 if((declaredReviewAdapter||null)!==reviewAdapter)
  throw Error('指标注册表与实际复盘服务的支持范围不一致：'+id);
 return [id,{id,version:'1',label:id,definition:definitions[id]||({registered_users:'真实注册账户人数，来自注册事实',registration_activation_rate:'注册后24小时内首次筹码分析行为人数 / 已成熟注册人数；未成熟单列',registered_trade_conversion_rate:'注册队列首次筹码分析后7日内交易人数 / 已成熟且身份可验证用户；用户级关联，非同Token归因',trade_revenue:'平台已确认收入，必须来自直接可核验收入事实；当前未接入，不能用交易额或合作账本替代',collaboration_economics:'CRM合作与KOL人工账本的已记录收支，按币种独立列示；不是全平台收入'}[id])||'复用现有'+id+'分析服务的正式输出',unit,queryAdapter,reviewAdapter,maturityRule,supportedScopes:['source',...(['north','weekly','quality','economics','platform-revenue-unavailable'].includes(queryAdapter)?[]:['activityId','cohortId'])],supportedDimensions:queryAdapter==='growth'?['source','device','version']:[]}];
}));
function describeMetric(id){if(!Object.hasOwn(registry,id))throw Object.assign(Error('未知指标'),{status:400});return structuredClone(registry[id]);}
module.exports={describeMetric,listMetrics:()=>Object.keys(registry).map(describeMetric)};
