const {test}=require('node:test'),assert=require('node:assert/strict'),{compareFacts}=require('../src/analytics/operationsComparison')
const snapshot={snapshot_cutoff:new Date(100000).toISOString()},period={start:0,end:100000}
const event=(id,t)=>({event_id:id,user_id:'1',t}),trade=(id,t,order=t*1000)=>({transaction_hash:id,account_id:'1',chain:'eth',valid:true,trade_value:10,transaction_time:new Date(t).toISOString(),transaction_order:String(order)})
test('overlapping and disjoint activity windows deduplicate the union without filling gaps',()=>{
 const specs=[{id:'a',members:[{id:'1'},{id:'2'}],start:10000,end:20000},{id:'b',members:[{id:'1'}],start:40000,end:60000},{id:'c',members:[{id:'1'}],start:45000,end:55000}]
 const facts={known:new Set(['1','2']),errors:{},events:[event('before',0),event('a',15000),event('gap',30000),event('overlap',50000)],trades:[trade('a',15000),trade('gap',30000),trade('b',50000)]}
 const r=compareFacts(specs,facts,period,snapshot)
 assert.equal(r.rows[0].total.analysis_events,1);assert.equal(r.rows[1].total.analysis_events,1);assert.equal(r.rows[2].total.analysis_events,1)
 assert.equal(r.union.users,2);assert.equal(r.union.analysis_events,2);assert.equal(r.union.transactions,2);assert.equal(r.union.volume_usd,20);assert.equal(r.overlap_memberships,2)
 assert.equal(r.rows[0].total.analysis_rate,.5)
})
test('native invitation precision excludes earlier same-millisecond trades and unknown data stays unknown',()=>{
 const facts={known:new Set(['1']),errors:{analysis:'unavailable'},events:[],trades:[trade('before',10000,10000001),trade('after',10000,10000003)]}
 const r=compareFacts([{id:'a',members:[{id:'1',bound_at:10000,bound_order:10000002}]},{id:'b',members:[{id:'1',bound_order:10000002}]}],facts,period,snapshot)
 assert.equal(r.union.transactions,1);assert.equal(r.union.analysis_users,null);assert.equal(r.union.analysis_rate,null);assert.equal(r.rows[0].total.transactions,1)
})
test('no common observation window is not presented as zero conversion',()=>{
 const r=compareFacts([{id:'past',members:[{id:'1'}],start:200000,end:300000}],{known:new Set(['1']),errors:{},events:[],trades:[]},period,snapshot)
 assert.equal(r.rows[0].no_window,true);assert.equal(r.rows[0].total,null);assert.equal(r.union.users,0)
})
