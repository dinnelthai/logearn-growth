'use strict';

// The exact metrics the current retrospective job can reconstruct from its
// existing read-only data fetches. Keep this map shared with the metric
// registry and the retrospective implementation; do not infer support from
// a metric name or silently substitute a nearby metric.
const REVIEW_METRICS=Object.freeze({
 active_users:Object.freeze({adapter:'north',path:'north.totals.active_users'}),
 new_users:Object.freeze({adapter:'north',path:'north.totals.new_users'}),
 returning_users:Object.freeze({adapter:'north',path:'north.totals.returning_users'}),
 activation_rate:Object.freeze({adapter:'growth',path:'mature-growth-channels.activation_rate'}),
 d7:Object.freeze({adapter:'growth',path:'mature-growth-channels.d7.rate'})
});
const REVIEWABLE_METRIC_IDS=Object.freeze(Object.keys(REVIEW_METRICS));

function buildRetrospectiveValues(north,growth){
 const totals=north?.totals&&typeof north.totals==='object'&&!Array.isArray(north.totals)
  ?north.totals:{};
 const channels=Array.isArray(growth?.channels)?growth.channels:[];
 const eligible=channels.reduce((n,c)=>n+(Number.isFinite(c?.eligible)?c.eligible:0),0);
 const activated=channels.reduce((n,c)=>n+(Number.isFinite(c?.activated)?c.activated:0),0);
 const d7Eligible=channels.reduce((n,c)=>n+(Number.isFinite(c?.d7?.eligible)?c.d7.eligible:0),0);
 const d7Returned=channels.reduce((n,c)=>n+(Number.isFinite(c?.d7?.returned)?c.d7.returned:0),0);
 return {...totals,
  activation_rate:eligible?activated/eligible:null,
  d7:d7Eligible?d7Returned/d7Eligible:null
 };
}

function assertReviewMetrics(validationMetrics){
 if(!validationMetrics||typeof validationMetrics!=='object'||Array.isArray(validationMetrics)||
  typeof validationMetrics.primary!=='string'||
  !Array.isArray(validationMetrics.secondary)||validationMetrics.secondary.length>3||
  validationMetrics.secondary.some(id=>typeof id!=='string')||
  new Set([validationMetrics.primary,...validationMetrics.secondary]).size!==1+validationMetrics.secondary.length)
  throw Error('验证指标必须包含一个主指标和最多三个不重复的次要指标');
 const ids=[validationMetrics.primary,...validationMetrics.secondary];
 for(const id of ids){
  if(!Object.hasOwn(REVIEW_METRICS,id))
   throw Error('指标 '+id+' 当前未被复盘服务支持；请使用有直接复盘读取能力的指标，不能用相近指标代替');
 }
 return ids;
}

module.exports={REVIEW_METRICS,REVIEWABLE_METRIC_IDS,buildRetrospectiveValues,assertReviewMetrics};
