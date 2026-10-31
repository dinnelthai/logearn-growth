'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {REVIEW_METRICS,REVIEWABLE_METRIC_IDS,buildRetrospectiveValues,assertReviewMetrics}=
 require('../src/ai/growth/reviewMetrics');
const {describeMetric,listMetrics}=require('../src/ai/business/metricRegistry');

test('metric registry review adapters are derived from the exact retrospective service contract',()=>{
 const all=listMetrics();
 for(const metric of all){
  assert.equal(metric.reviewAdapter,REVIEW_METRICS[metric.id]?.adapter||null,metric.id);
 }
 assert.deepEqual(REVIEWABLE_METRIC_IDS,
  ['active_users','new_users','returning_users','activation_rate','d7']);
 assert.equal(describeMetric('registered_users').reviewAdapter,null);
 assert.equal(describeMetric('registered_trade_conversion_rate').reviewAdapter,null);
});

test('retrospective reads preserve north-star values and derive mature growth rates with the service formula',()=>{
 const value=buildRetrospectiveValues(
  {totals:{active_users:20,new_users:8,returning_users:12}},
  {channels:[
   {eligible:10,activated:4,d7:{eligible:8,returned:3}},
   {eligible:20,activated:10,d7:{eligible:12,returned:6}}
  ]}
 );
 assert.deepEqual(value,{active_users:20,new_users:8,returning_users:12,
  activation_rate:14/30,d7:9/20});
});

test('missing or invalid channel coverage stays unavailable rather than becoming zero',()=>{
 const value=buildRetrospectiveValues({totals:{active_users:5}},null);
 assert.equal(value.active_users,5);
 assert.equal(value.activation_rate,null);
 assert.equal(value.d7,null);
});

test('suggestion review metrics require one supported primary and bounded unique supported secondary metrics',()=>{
 assert.deepEqual(assertReviewMetrics({primary:'new_users',secondary:['active_users','d7']}),
  ['new_users','active_users','d7']);
 for(const value of [
  {primary:'registered_users',secondary:[]},
  {primary:'new_users',secondary:['registered_trade_conversion_rate']},
  {primary:'new_users',secondary:['new_users']},
  {primary:'new_users',secondary:['active_users','returning_users','activation_rate','d7']},
  {primary:'new_users',secondary:null}
 ])assert.throws(()=>assertReviewMetrics(value));
});
