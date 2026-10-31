'use strict';
// Review feedback is keyed by established structured metric IDs and scope,
// never fuzzy text similarity or observational claims of causality.
const {definitions}=require('../../analytics/businessPriorities');
const known=new Set(Object.keys(definitions));
const {classifyRetrospectiveOutcome}=require('./retrospectiveOutcome');
function summarizeExperience(history,{source='all',now=Date.now(),lookbackDays=180}={}){
 if(!Array.isArray(history)||typeof source!=='string'||!source||
  !Number.isSafeInteger(now)||!Number.isSafeInteger(lookbackDays)||lookbackDays<1||lookbackDays>365)
   throw Error('历史经验输入无效');
 const byMetric=new Map();
 for(const item of history.slice(0,100)){
  if(item?.user_status!=='executed'||!['1','2'].includes(item.review_context_version))continue;
  const metric=item.validation_metrics?.primary;
  if(!known.has(metric))continue;
  let outcome=item.effectiveness,observed=null;
  const change=item.metric_changes?.[metric];
  if(item.review_context_version==='2'){
   observed=classifyRetrospectiveOutcome(item);
   outcome=observed.assessment==='observed-supported'?'effective':
    observed.assessment==='observed-contradicted'?'ineffective':'unknown';
  }else if(outcome==='unknown'&&['high','medium'].includes(item.review_confidence||item.confidence)&&
   change?.available===true&&Number.isFinite(change.baseline)&&Number.isFinite(change.effect)){
   if(item.has_improvement===true&&change.effect>change.baseline)outcome='effective';
   else if(item.has_improvement===false&&change.effect<=change.baseline)outcome='ineffective';
  }
  if(!['effective','ineffective'].includes(outcome))continue;
  const itemSource=item.action_scope?.source||item.applicable_scope?.source||'all';
  if(itemSource!==source)continue;
  const reviewed=Number(item.reviewed_at);
  if(!Number.isSafeInteger(reviewed)||reviewed>now||reviewed<now-lookbackDays*86400000)continue;
  if(!byMetric.has(metric))byMetric.set(metric,{
   metric,effectiveReviews:0,ineffectiveReviews:0,observedSupportedReviews:0,
   observedContradictedReviews:0,recentLessons:[],
   outcomeBasis:item.review_context_version==='2'?'fixed-cohort-observation':'legacy-business-observation',
   interpretation:'复盘为非实验观测结论，不代表该策略有确定因果效果'
  });
  const entry=byMetric.get(metric);
  if(outcome==='effective'){entry.effectiveReviews++;entry.observedSupportedReviews++;}
  else {entry.ineffectiveReviews++;entry.observedContradictedReviews++;}
  if(typeof item.result_summary==='string'&&item.result_summary.trim()&&entry.recentLessons.length<3)
   entry.recentLessons.push(item.result_summary.slice(0,240));
 }
 return [...byMetric.values()].sort((a,b)=>a.metric.localeCompare(b.metric));
}
module.exports={summarizeExperience};
