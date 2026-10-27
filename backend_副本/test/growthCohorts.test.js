const {test}=require('node:test'),assert=require('node:assert/strict')
const {growthInsights}=require('../src/analytics/growthInsights')
const DAY=86400000,start=Date.parse('2026-10-01T00:00:00+07:00'),end=start+3*DAY
const row=(id,extra={})=>({user_key:'user:'+id,first_seen_at:start,first_chip_at:null,current_active:false,previous_active:false,source:'x',chip_days:[],first_day_hours:0,...extra})
const run=(rows,asOf,evidence={})=>growthInsights(rows,[],{start,end},{as_of:new Date(asOf).toISOString()},undefined,evidence)
test('registration cohort includes accounts with no events and remains separate from first observed users',()=>{
 const registration={available:true,scope:'all',rows:[{user_key:'user:2',source:'未知',registered_at:start,first_chip_at:null},{user_key:'user:3',registered_at:start,first_chip_at:start+DAY-1},{user_key:'user:4',registered_at:start,first_chip_at:start+DAY},{user_key:'user:5',registered_at:end-1,first_chip_at:null}]}
 const result=run([row(1,{first_seen_at:start-100*DAY})],end,{registration}),c=result.payload.cohorts
 assert.equal(c.observed.users,0);assert.equal(c.registration.metrics.users,4);assert.equal(c.registration.metrics.eligible,3);assert.equal(c.registration.metrics.activated,1);assert.equal(c.registration.metrics.pending,1)
 assert.deepEqual(result.lists['cohort:registered:activated'],['user:3']);assert.equal(result.members['user:2'].id,'user:2')
 assert.equal(run([],end).payload.cohorts.registration.metrics,null)
})
test('cross-midnight revisit is not a 24 hour revisit and immature successes stay outside mature numerator',()=>{
 const first=start+DAY-60000,rows=[row(1,{first_chip_at:first,first_later_day_at:first+120000,first_after_24h_at:null}),row(2,{first_chip_at:first,first_later_day_at:first+DAY,first_after_24h_at:first+DAY}),row(3,{first_chip_at:first,first_later_day_at:first+7*DAY,first_after_24h_at:first+7*DAY})]
 let r=run(rows,first+2*DAY).payload.cohorts.repeats
 assert.equal(r[0].eligible,0);assert.equal(r[0].rate,null);assert.equal(r[0].observed_returned,2);assert.equal(r[0].returned,0);assert.equal(r[1].observed_returned,1)
 r=run(rows,first+7*DAY-1).payload.cohorts.repeats
 assert.equal(r[0].eligible,3);assert.equal(r[0].returned,2);assert.equal(r[1].returned,1);assert.equal(r[1].pending,0)
})
test('diagnostic user counts are exact family totals, never summed over overlapping version groups',()=>{
 const coverage={available:true,rows:[{scope:'family',family:'analysis',users:1,events:1000},{scope:'device_version',family:'analysis',device:'desktop',users:1},{scope:'device_version',family:'analysis',device:'mobile',users:1}]}
 const q=run([],end,{coverage}).payload.quality
 assert.equal(q.families[0].users,1);assert.equal(q.families[1].users,0);assert.equal(q.diagnostic_coverage.rows.length,3)
})
