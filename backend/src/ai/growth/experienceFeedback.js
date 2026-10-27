'use strict';
// Review feedback is keyed by established structured metric IDs and scope,
// never fuzzy text similarity or observational claims of causality.
const {definitions}=require('../../analytics/businessPriorities');
const known=new Set(Object.keys(definitions));
function summarizeExperience(history,{source='all',now=Date.now(),lookbackDays=180}={}){
 if(!Array.isArray(history)||typeof source!=='string'||!source||
  !Number.isSafeInteger(now)||!Number.isSafeInteger(lookbackDays)||lookbackDays<1||lookbackDays>365)
   throw Error('历史经验输入无效');
 const byMetric=new Map();
 for(const item of history.slice(0,100)){
  if(item?.user_status!=='executed')continue;
  const metric=item.validation_metrics?.primary;
  if(!known.has(metric)||!['effective','ineffective'].includes(item.effectiveness))continue;
  const itemSource=item.applicable_scope?.source||'all';
  if(itemSource!=='all'&&itemSource!==source)continue;
  if(source==='all'&&itemSource!=='all')continue;
  const reviewed=Number(item.reviewed_at);
  if(!Number.isSafeInteger(reviewed)||reviewed>now||reviewed<now-lookbackDays*86400000)continue;
  if(!byMetric.has(metric))byMetric.set(metric,{
   metric,effectiveReviews:0,ineffectiveReviews:0,recentLessons:[],
   interpretation:'复盘为非实验观测结论，不代表该策略有确定因果效果'
  });
  const entry=byMetric.get(metric);
  if(item.effectiveness==='effective')entry.effectiveReviews++;
  else entry.ineffectiveReviews++;
  if(typeof item.result_summary==='string'&&item.result_summary.trim()&&entry.recentLessons.length<3)
   entry.recentLessons.push(item.result_summary.slice(0,240));
 }
 return [...byMetric.values()].sort((a,b)=>a.metric.localeCompare(b.metric));
}
module.exports={summarizeExperience};
