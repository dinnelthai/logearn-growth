'use strict';
// Declarative Growth Skills; existing tools remain the only data source.
// Versions are explicit so future skill changes can be reviewed independently.
const skills=Object.freeze([
 {id:'growth-overview',version:'1',goal:'activation',label:'每日增长概览',
  tools:['query_metrics','check_data_quality'],signals:['active_users','new_users','returning_users'],
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
  tools:['get_seo_performance','get_channels','get_funnel'],signals:['new_users','activation_rate'],
  instructions:'仅使用用户导入的 Search Console 查询/页面/日期原始行；无法证明整站完整覆盖，搜索端日期和站内业务日不同；点击、排名不等于注册、交易或因果转化'},
 {id:'kol-impact',version:'1',goal:'conversion',label:'KOL 归组用户与交易行为',
  tools:['get_kol_performance','get_channels','get_funnel','get_channel_economics'],signals:['new_users','activation_rate'],
  instructions:'使用既有 CRM KOL 成员归组与真实交易观察；成员可重叠，交易量不是收入；用户标签相关性不等于 KOL 导致的增量'}
]);
const byId=new Map(skills.map(s=>[s.id,s]));
function getSkill(id){const skill=byId.get(id);if(!skill)throw Object.assign(Error('未知增长技能'),{status:400});return skill}
function listSkills(){return skills.map(s=>({...s,tools:[...s.tools],signals:[...s.signals]}))}
module.exports={getSkill,listSkills};
