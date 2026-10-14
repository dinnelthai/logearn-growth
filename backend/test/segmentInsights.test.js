const {test}=require('node:test'),assert=require('node:assert/strict')
const {computeInsights,validateOptions}=require('../src/analytics/segmentInsights')
const DAY=86400000,now=1800000000000
function row(id,more={}){return {user_key:'user:'+id,account_id:id,created_at:now-2*DAY,last_login_at:null,first_chip_at:null,last_chip_at:null,chip_days_28:0,analysis_days_period:0,identity_count:0,trade_count:0,trade_count_period:0,...more}}
const options={pool:'registered',groupBy:'binding',asOf:now,factsAsOf:now,start:now-7*DAY,end:now+1}
test('registered denominator excludes unmatched identities and zero analysts stays unknown',()=>{
 const r=computeInsights([row(1),row('unresolved',{account_id:null,telegram_bound:null})],options)
 assert.equal(r.payload.total,1);assert.equal(r.payload.unmatched_users,1);assert.equal(r.payload.summary.analysis_rate,0)
 assert.equal(r.payload.summary.avg_analysis_days,null);assert.equal(r.payload.summary.d7_rate,null)
 assert.deepEqual(r.lists.all,['user:1']);assert.equal(r.details['user:unresolved'].trade_count,null)
})
test('intersecting filters, exclusive binding groups and calendar cohort lists preserve sets',()=>{
 const rows=[row(1,{telegram_bound:1,email_bound:1,analysis_days_period:2}),row(2,{telegram_bound:1,email_bound:0}),row(3,{email_bound:1})]
 const r=computeInsights(rows,{...options,filters:{binding:'telegram'}})
 assert.equal(r.payload.total,2);assert.equal(r.payload.summary.analysis_rate,.5);assert.equal(r.payload.summary.avg_analysis_days,2)
 assert.equal(r.payload.comparison.reduce((n,g)=>n+g.users,0),2)
 assert.deepEqual(r.payload.registration_cohorts.flatMap(c=>r.lists[c.list_key]).sort(),r.lists.all.slice().sort())
 const empty=computeInsights(rows,{...options,filters:{binding:'both',trade:'repeat'}})
 assert.equal(empty.payload.total,0);assert.equal(empty.payload.summary.analysis_rate,null)
})
test('incomplete history never confirms churn or return, and period trades differ from lifetime',()=>{
 const r=computeInsights([row(1,{first_chip_at:now-40*DAY,last_chip_at:now-30*DAY,trade_count:10,trade_count_period:0}),row(2,{first_chip_at:now-DAY,last_chip_at:now,returned_28:true})],options)
 assert.equal(r.payload.segments[0].segment,'观察不足');assert.equal(r.payload.segments.length,1)
 assert.equal(r.payload.summary.trade_users,0)
 assert.throws(()=>validateOptions({filters:{invented:'all'}}),e=>e.status===400)
 assert.throws(()=>validateOptions({group_by:'credential'}),e=>e.status===400)
})

test('newly referred returning analysts count even when first analysis precedes invitation',()=>{
 const r=computeInsights([row(1,{invitation_at:now-DAY,first_chip_at:now-2*DAY,referred_analysis_period:true})],options)
 assert.equal(r.payload.summary.new_referred_users,1);assert.equal(r.payload.summary.new_referred_analysis_users,1)
})

test('business pool excludes contact-only users and includes usage, assets and available points',()=>{
 const rs=[row(1,{email_bound:1}),row(2,{trade_count:2}),row(3,{nft_count:1}),row(4,{has_balance:true}),row(5,{available_points:10}),row(6,{used_strategy:true}),row(7),row(8,{account_id:null,trade_count:9})]
 const result=computeInsights(rs,{...options,pool:'business',groupBy:'signal'})
 assert.deepEqual(result.lists.all,['user:2','user:3','user:4','user:5','user:6'])
 assert.equal(result.payload.business_total,5);assert.equal(result.payload.contact_only_total,1);assert.equal(result.payload.no_signal_total,1)
 assert.equal(result.payload.focus.vip_users,null);assert.equal(result.payload.focus.points_users,1)
 const contact=computeInsights(rs,{...options,pool:'contact_only'});assert.deepEqual(contact.lists.all,['user:1'])
 const noSignal=computeInsights(rs,{...options,pool:'no_signal'});assert.deepEqual(noSignal.lists.all,['user:7'])
 assert.throws(()=>validateOptions({pool:'invented'}),e=>e.status===400)
})
test('unknown asset facts are not zeros, and contactable value is an intersection',()=>{
 const result=computeInsights([row(1,{trade_count:1,telegram_bound:1,has_balance:null,available_points:null}),row(2,{first_chip_at:now-DAY,last_chip_at:now,used_strategy:true})],{...options,pool:'business'})
 assert.equal(result.payload.focus.points_users,null);assert.equal(result.payload.focus.contactable_value_users,1);assert.equal(result.payload.focus.recent_used_users,1)
 assert.equal(result.details['user:1'].has_balance,null)
 const unknown=computeInsights([row(1,{trade_count:1,has_balance:null})],{...options,pool:'business',filters:{asset:'balance'}});assert.equal(unknown.payload.total,0)
})
test('chart and card drill sets match numerators and cohort partitions',()=>{
 const result=computeInsights([row(1,{analysis_days_period:2,strategy_period:true,trade_count_period:1,nft_count:1}),row(2,{analysis_days_period:0})],options)
 const group=result.payload.comparison[0],co=result.payload.registration_cohorts[0]
 assert.equal(result.lists['period:analysis'].length,result.payload.summary.analysis_users)
 assert.equal(result.lists[group.list_key+':strategy'].length,group.strategy_users)
 assert.equal(result.lists[group.list_key+':trade'].length,group.trade_users)
 assert.deepEqual(result.lists[co.list_key+':analysis'],['user:1']);assert.deepEqual(result.lists[co.list_key+':unobserved'],['user:2'])
 assert.deepEqual(result.lists.nft,['user:1'])
})

test('operating tags use observed login and complete UTC+7 days, excluding immature or unknown return facts',()=>{
 const end=Date.parse('2026-10-11T12:00:00+07:00'),day=Date.parse('2026-10-09T12:00:00+07:00')
 const opts={...options,asOf:end,factsAsOf:end,start:end-7*DAY,end:end+1}
 const rs=[row(1,{login_period:true,analysis_days_period:0}),row(2,{first_chip_at:day,analysis_returned_d1:false}),row(3,{first_chip_at:day,analysis_returned_d1:true}),row(4,{first_chip_at:end-DAY,analysis_returned_d1:false}),row(5,{last_observed_at:Date.parse('2026-10-07T23:59:00+07:00')}),row(6,{last_observed_at:Date.parse('2026-10-08T00:01:00+07:00')})]
 assert.deepEqual(computeInsights(rs,{...opts,filters:{task:'login_no_analysis'}}).lists.all,['user:1'])
 assert.deepEqual(computeInsights(rs,{...opts,filters:{task:'analysis_no_d1'}}).lists.all,['user:2'])
 assert.deepEqual(computeInsights(rs,{...opts,filters:{task:'absent_3d'}}).lists.all,['user:5'])
 for(const task of ['login_no_analysis','analysis_no_d1','absent_3d'])assert.equal(validateOptions({filters:{task}}).task,task)
})

test('lifecycle operating filters distinguish repeated analysis, known trades and voluntary contact',()=>{
 const rs=[row(1,{analysis_days_period:2,trade_count:0,login_period:true}),row(2,{analysis_days_period:0,trade_count:2,trade_count_period:1,referred_user:true,checkin_days_period:1}),row(3,{analysis_days_period:1,trade_count:0,email_bound:true,strategy_period:true})]
 const cases={repeat_analysis_no_trade:['user:1'],analysis_no_trade:['user:1','user:3'],strategy_no_trade:['user:3'],trade_no_analysis:['user:2'],analysis_no_binding:['user:1'],checkin_no_analysis:['user:2'],referred_no_analysis:['user:2']}
 for(const [task,ids]of Object.entries(cases)){validateOptions({filters:{task}});assert.deepEqual(computeInsights(rs,{...options,filters:{task}}).lists.all,ids)}
})

test('URL operating tags require explicitly observed session evidence',()=>{const rows=[row(1,{single_page_no_action:true}),row(2,{token_detail_no_analysis:true}),row(3)];for(const task of ['single_page_no_action','token_detail_no_analysis'])validateOptions({filters:{task}});assert.deepEqual(computeInsights(rows,{...options,filters:{task:'single_page_no_action'}}).lists.all,['user:1']);assert.deepEqual(computeInsights(rows,{...options,filters:{task:'token_detail_no_analysis'}}).lists.all,['user:2'])})
