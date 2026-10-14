const {test}=require('node:test'),assert=require('node:assert/strict')
const {computeReferralInsights,validateReferral}=require('../src/analytics/referralInsights')
const D=86400000,account=(n,extra={})=>({account_id:n,user_key:'user:'+n,created_at:0,source:'direct',trade_count:0,chip_days_28:0,...extra}),relation=(n,p,t,extra={})=>({id:String(n),user_id:String(n),level1_user_id:String(p),invitation_at:t,is_valid:true,after_trade_count:0,...extra})
function run(users,rs,options={}){return computeReferralInsights(users,rs,{start:10*D,end:12*D,asOf:20*D,factsAsOf:20*D,scope:'all',...options})}
test('ranking excludes placeholder and unmatched relationships, and every drill matches its numerator',()=>{
 const v=run([account(1),account(2,{last_chip_at:11*D}),account(3,{trade_count:3}),account(4)], [relation(2,1,10*D),relation(3,1,10*D,{after_trade_count:2}),relation(4,0,10*D),relation(8,1,10*D)])
 assert.equal(v.payload.summary.users,2);assert.equal(v.payload.ranking[0].users,2);assert.deepEqual(v.lists.used,['user:2']);assert.deepEqual(v.lists.trade,['user:3']);assert.equal(v.payload.global.registered,4);assert.equal(v.payload.global.participation_rate,1/4)
 assert.equal(v.lists.anomalies.length,2);assert(v.lists.anomalies.every(id=>v.members[id].registered===false))
 for(const r of v.payload.ranking)for(const field of ['used','trade','value','continued'])assert.equal(v.lists[r.list_key+':'+field].length,r[field])
})
test('a period cohort follows later descendants and retains non-recommenders in fixed-window denominator',()=>{
 const v=run([1,2,3,4,5].map(n=>account(n)),[relation(2,1,10*D),relation(3,2,13*D),relation(4,1,11*D),relation(5,3,19*D)],{scope:'period',windowDays:7})
 assert.equal(v.payload.summary.users,2);assert.equal(v.payload.summary.continued,1);assert.equal(v.payload.summary.next_generation,1);assert.equal(v.payload.window.observed_output,0.5);assert.equal(v.payload.global.next_generation,2)
 assert.deepEqual(v.lists.next,['user:3']);assert.equal(v.payload.window.confirmed_new_registration_rate,null)
})
test('cycle and equal-time conflicts are isolated, and events before binding are not usage',()=>{
 const v=run([1,2,3,4,5,6].map(n=>account(n,{last_chip_at:D})),[relation(1,2,2*D),relation(2,1,3*D),relation(3,4,2*D),relation(3,5,2*D,{id:'33'}),relation(6,4,2*D)])
 assert.equal(v.payload.summary.users,1);assert.equal(v.payload.summary.used,0);assert.equal(v.payload.quality.counts['循环关系'],2);assert.equal(v.payload.quality.counts['同时间推荐人冲突'],2)
})
test('local source and quality filters do not change the global population',()=>{
 const u=[account(1),account(2,{source:'x',trade_count:1}),account(3)],rs=[relation(2,1,D),relation(3,1,2*D)]
 const v=run(u,rs,{source:'x',quality:'value'});assert.equal(v.payload.summary.users,1);assert.equal(v.payload.global.bound,2);assert.equal(v.payload.global.registered,3)
 assert.equal(v.payload.cohorts[0].trade,0);assert.equal(v.payload.summary.value,1)
})
test('registration after binding is anomalous, empty ratios are unknown, invalid options reject',()=>{
 const v=run([account(1),account(2,{created_at:3*D})],[relation(2,1,2*D)])
 assert.equal(v.payload.summary.users,0);assert.equal(v.payload.global.continuation_rate,null);assert.equal(v.payload.window.observed_output,null);assert.equal(v.payload.quality.counts['注册晚于绑定'],1)
 assert.throws(()=>validateReferral({window_days:9}),{status:400});assert.throws(()=>validateReferral({inviter:'abc'}),{status:400})
})
test('same-timestamp descendants remain direct referrals but do not prove subsequent propagation',()=>{
 const v=run([1,2,3].map(n=>account(n)),[relation(2,1,D),relation(3,2,D)])
 assert.equal(v.payload.global.bound,2);assert.equal(v.payload.global.next_generation,0);assert.equal(v.payload.global.simultaneous,1)
 assert.deepEqual(v.lists['global:simultaneous'],['user:3'])
})
test('microsecond binding order is preserved instead of turning near timestamps into ties',()=>{
 const v=run([1,2,3].map(n=>account(n)),[relation(2,1,D,{invitation_order:D*1000+400}),relation(3,2,D,{invitation_order:D*1000+100})])
 assert.equal(v.payload.global.simultaneous,0);assert.equal(v.payload.global.next_generation,0)
})
