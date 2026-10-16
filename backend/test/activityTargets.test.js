const {test}=require('node:test'),assert=require('node:assert/strict'),{validateTarget,targetProgress}=require('../src/analytics/activityTargets')
test('targets validate goal-specific units, retain unknown sources and distinguish partial known USD progress',()=>{
 assert.deepEqual(validateTarget({},'activation'),{target_metric:null,target_value:null})
 for(const body of [{target_metric:'trade_users',target_value:2},{target_metric:'first_analysis_users',target_value:1.5},{target_metric:'first_analysis_users',target_value:-1},{target_metric:'first_analysis_users',target_value:'3'}])assert.throws(()=>validateTarget(body,'activation'))
 for(const value of [1.001,1.0000001])assert.throws(()=>validateTarget({target_metric:'volume_usd',target_value:value},'trade'))
 const a={target_metric:'volume_usd',target_value:100},r={summary:{completed:2},performance:{total:{volume_usd:120,missing_values:1}},performance_errors:{}}
 assert.equal(targetProgress(a,r).status,'partial');assert.equal(targetProgress(a,r).ratio,1.2)
 r.performance_errors.trade='unavailable';assert.equal(targetProgress(a,r).actual,null);assert.equal(targetProgress(a,r).ratio,null)
 const first={target_metric:'first_analysis_users',target_value:4};assert.equal(targetProgress(first,r).ratio,.5)
 r.performance_errors.analysis='unavailable';assert.equal(targetProgress(first,r).status,'unknown')
 assert.equal(targetProgress({...first,start_at:200},{...r,as_of:new Date(100).toISOString()}).status,'pending')
})
