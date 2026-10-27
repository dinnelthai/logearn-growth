const {test}=require('node:test'),assert=require('node:assert/strict'),{behaviorTags}=require('../src/analytics/behaviorTags')
const day=86400000,asOf=40*day,period={start:35*day,end:41*day,asOf}
const keys=(r,options={})=>behaviorTags({account_id:'1',...r},{...period,...options}).map(t=>t.key)
test('new core and trade labels overlap, with period and observation boundaries',()=>{
 assert.deepEqual(keys({first_chip_at:36*day,last_chip_at:40*day,chip_days_28:6,analysis_days_period:3,trade_count:2,trade_count_period:1}),['new_analysis','core','traded','unactivated'])
 assert(keys({first_chip_at:day,last_chip_at:39*day,chip_days_28:2,analysis_days_period:1,trade_count:0}).includes('low_frequency'))
 assert(!keys({first_chip_at:day,analysis_days_period:1,trade_count:null}).includes('analysis_no_trade'))
})
test('unobserved and silent remain observed labels; return requires complete history',()=>{
 assert.deepEqual(keys({first_chip_at:null}),[])
 assert(keys({first_chip_at:day,last_chip_at:20*day}).includes('silent'))
 assert(!keys({returned_28:true}).includes('returned'))
 assert(keys({returned_28:true},{historyComplete:true}).includes('returned'))
})

test('value leads require a value fact and include both analysed and unobserved users',()=>{
 for(const fact of [{trade_count:1},{nft_count:1},{has_balance:true},{vip_active:true},{credits_available:1}]){
  assert(keys({...fact,first_chip_at:null}).includes('unactivated'))
  assert(keys({...fact,first_chip_at:day}).includes('unactivated'))
 }
 for(const fact of [{},{telegram_bound:true},{available_points:100},{credits_available:0},{trade_count:null,has_balance:null}])assert(!keys(fact).includes('unactivated'))
 assert(!keys({account_id:null,trade_count:1}).includes('unactivated'))
})
