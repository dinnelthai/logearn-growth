'use strict';
// Derived evaluations over original LogEarn reports. Never redefines metrics.
const {definitions}=require('../../analytics/businessPriorities');
const SUPPORTED=Object.freeze(['active_users','new_users','returning_users','activation_rate','d7','weekly_core']);
const DAY=86400000;
function readMetric(report,metric){
 if(!report||!SUPPORTED.includes(metric))return {value:null,available:false,reason:'unsupported-metric'};
 if(['active_users','new_users','returning_users'].includes(metric)){
  const n=report.current?.totals?.[metric];
  return Number.isSafeInteger(n)&&n>=0?{value:n,available:true,unit:'users'}:
   {value:null,available:false,reason:'current-count-unavailable'};
 }
 if(metric==='weekly_core'){
  const n=report.weekly?.users;
  return report.weekly?.available===true&&Number.isSafeInteger(n)&&n>=0?
   {value:n,available:true,unit:'users'}:
   {value:null,available:false,reason:'weekly-not-mature'};
 }
 const rows=report.growth?.channels;
 if(!Array.isArray(rows)||report.growth?.quality?.truncated)
  return {value:null,available:false,reason:'channel-coverage-incomplete'};
 let eligible=0,numerator=0;
 for(const row of rows){
  const e=metric==='d7'?row.d7?.eligible:row.eligible;
  const a=metric==='d7'?row.d7?.returned:row.activated;
  if(!Number.isSafeInteger(e)||e<0||!Number.isSafeInteger(a)||a<0||a>e)
   return {value:null,available:false,reason:'invalid-or-unavailable-mature-denominator'};
  eligible+=e;numerator+=a;
 }
 return eligible>0?{value:numerator/eligible,available:true,unit:'rate',
  eligible,observed:numerator}:
  {value:null,available:false,reason:'no-mature-eligible-cohort'};
}
function scoreDaily(report,targets){
 if(!Array.isArray(targets))throw Error('每日目标列表无效');
 const end=Number(report?.period?.end),start=Number(report?.period?.start);
 const quality=report?.snapshot||{};
 const events=Date.parse(quality.eventsCompleteThrough),asOf=Date.parse(quality.asOf);
 const reasons=[];
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start!==DAY)
  reasons.push('analysis-period-not-one-complete-day');
 if(quality.historyComplete!==true)reasons.push('historical-coverage-unconfirmed');
 if(!Number.isFinite(events)||events<end)reasons.push('event-coverage-not-through-day-end');
 if(!Number.isFinite(asOf)||asOf<end)reasons.push('source-watermark-not-through-day-end');
 if(report?.growth?.quality?.truncated)reasons.push('truncated-source');
 const rows=targets.map(t=>{
  const metric=t.metric,observed=readMetric(report,metric),
   target=Number(t.target),weight=Number(t.weight);
  if(!SUPPORTED.includes(metric)||!Number.isFinite(target)||target<=0||
    !Number.isSafeInteger(weight)||weight<1||weight>10)
   throw Error('运营目标值/指标不合法');
  return {id:t.id,metric,definition:definitions[metric],target,weight,
   observed:observed.available?observed.value:null,unit:observed.unit||null,
   matureEligible:observed.eligible??null,
   progress:observed.available?observed.value/target:null,
   gap:observed.available?Math.max(0,target-observed.value):null,
   reason:observed.available?null:observed.reason};
 });
 const unscored=rows.filter(x=>x.progress==null);
 const complete=reasons.length===0&&rows.length>0&&!unscored.length;
 const weight=rows.reduce((n,r)=>n+r.weight,0);
 const numeric=complete?Math.round(rows.reduce((n,r)=>n+Math.min(1,r.progress)*r.weight,0)/weight*100):null;
 return {version:'growth-score-v1',score:numeric,status:complete?'scored':'insufficient-evidence',
  basis:'weighted completion of operator-set minimum KPIs; not business ROI, causal effect, or model accuracy',
  metrics:rows,quality:{complete,blockingReasons:reasons,
   missingMetrics:unscored.map(x=>x.metric),sourceSnapshotId:quality.id||null},
  warnings:[
   '首次观察用户不等于新注册用户；筹码分析不等于完成交易',
   '评分只相对于用户明确设定的目标，绝非 AI 凭空估计经营好坏',
   ...(!targets.length?['没有运营目标，不能给出综合分数']:[])
  ]};
}
module.exports={SUPPORTED,readMetric,scoreDaily};
