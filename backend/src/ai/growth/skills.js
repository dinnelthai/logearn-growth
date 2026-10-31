'use strict';
// Declarative Growth Skills combine existing business/GSC tools with optional,
// owner-scoped reviewed connectors. Missing connectors are filtered at planning.
// Versions are explicit so future skill changes can be reviewed independently.
const skills=Object.freeze([
 {id:'growth-overview',version:'1',goal:'activation',label:'每日增长概览',
  tools:['query_metrics','check_data_quality','get_operations_timeline'],signals:['active_users','new_users','returning_users'],
  instructions:'核对人数、连续采集和覆盖；未观测不等于流失'},
 {id:'activation-funnel',version:'1',goal:'activation',label:'激活漏斗诊断',
  tools:['get_funnel','get_paths','get_product_chain','check_data_quality'],signals:['activation_rate'],
  instructions:'只比较成熟样本；排除埋点覆盖变化，不以相关性证明因果'},
 {id:'retention',version:'1',goal:'retention',label:'成熟留存队列诊断',
  tools:['get_retention','get_segments','check_data_quality'],signals:['d7','returning_users'],
  instructions:'未成熟队列明确标记未知，不能计算为流失'},
 {id:'channel-growth',version:'1',goal:'conversion',label:'渠道贡献诊断',
  tools:['get_channels','get_channel_economics','get_funnel','check_data_quality'],signals:['new_users','activation_rate'],
  instructions:'渠道归因必须区分来源不明、样本大小和交易收益'},
 {id:'trade-conversion',version:'1',goal:'conversion',label:'交易转化诊断',
  tools:['get_product_chain','get_funnel','get_segments','check_data_quality'],signals:['activation_rate'],
  instructions:'只把可验证上链交易视为交易事实，筹码浏览只是代理信号'},
 {id:'revenue',version:'1',goal:'revenue',label:'收入和渠道经济诊断',
  tools:['get_channel_economics','query_metrics','check_data_quality'],signals:[],
  instructions:'按币种独立统计，未记录的收入不能当作零'},
 {id:'seo-organic',version:'1',goal:'conversion',label:'SEO Search Console 搜索表现',
  tools:['get_seo_performance','get_channels','get_funnel','openseo.saved_rankings'],signals:['new_users','activation_rate'],
  instructions:'组合内部业务事实、第一方 GSC 观测与第三方 OpenSEO 已保存排名；来源、时间和覆盖不同，不计算未经验证的 SEO 因果归因。OpenSEO 未配置或故障时仅使用现有 GSC/内部数据'},
 {id:'content-growth',version:'1',goal:'conversion',label:'内容增长与渠道表现',
  tools:['get_content_growth','get_channels','get_funnel'],signals:['new_users','activation_rate'],
  instructions:'使用 get_content_growth 的 contentSignals 做近30天内容比较：统计浏览、回复、转发、点赞与三项行为率；检查发布时间、采集时间、同账号样本量和24/48小时快照。判断哪些选题值得再验证、发布频率是否需要关注，并给出可检查的下次实验。缺少帖子主题标签时仅提出内容类型假设；不要把累计值当作当日增量，不要制造X算法推荐分、站内注册或交易归因。'},
 {id:'follower-quality',version:'1',goal:'conversion',label:'X粉丝质量与潜在受众',
  tools:['get_follower_quality','get_channels'],signals:['new_users'],
  instructions:'粉丝类别基于有限的简介和帖子关键词；只汇总类别，不输出个人档案，不推断真实购买意向'},
 {id:'referral-and-invite',version:'1',goal:'conversion',label:'推荐关系与邀请转化',
  tools:['get_referral','get_invite_conversion','get_channels'],signals:['new_users','activation_rate'],
  instructions:'对比已验证绑定与邀请链接转化；绑定不等于新客，必须标注注册关系可用性、成熟度和未关联比例'},
 {id:'login-conversion',version:'1',goal:'activation',label:'登录转化覆盖',
  tools:['get_login_conversion','get_funnel'],signals:['activation_rate'],
  instructions:'使用现有登录转化服务，区分已关联终态、待完成、事件缺失；不得把未观测当作未登录'},
 {id:'kol-impact',version:'1',goal:'conversion',label:'KOL 归组用户与交易行为',
  tools:['get_kol_performance','get_channels','get_funnel','get_channel_economics'],signals:['new_users','activation_rate'],
  instructions:'使用既有 CRM KOL 成员归组与真实交易观察；成员可重叠，交易量不是收入；用户标签相关性不等于 KOL 导致的增量'}
]);
const byId=new Map(skills.map(s=>[s.id,s]));
function getSkill(id){const skill=byId.get(id);if(!skill)throw Object.assign(Error('未知增长技能'),{status:400});return skill}
function listSkills(){return skills.map(s=>({...s,tools:[...s.tools],signals:[...s.signals]}))}
module.exports={getSkill,listSkills};
