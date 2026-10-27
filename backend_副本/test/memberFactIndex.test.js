const {test}=require('node:test'),assert=require('node:assert/strict')
const {createMemberFactSelector}=require('../src/analytics/memberFactIndex')
const {memberMetrics}=require('../src/data/memberMetrics')
test('indexed subsets preserve source order, duplicates, numeric IDs and missing members',()=>{
 const repeat={user_id:'1',event_id:'same',t:10},facts={known:new Set(['1','2']),errors:{},events:[repeat,{user_id:'2',event_id:'two',t:20},repeat,{user_id:'3',t:30}],trades:[{account_id:'1',transaction_hash:'first'},{account_id:'2',transaction_hash:'second'}]}
 const select=createMemberFactSelector(facts),selected=select([{id:2},{id:'1'},{id:1},{id:'missing'}])
 assert.deepEqual(selected.events,facts.events.slice(0,3));assert.deepEqual(selected.trades,facts.trades)
 assert.equal(selected.known,facts.known);assert.equal(selected.errors,facts.errors)
 assert.deepEqual(select([]).events,[]);assert.equal(facts.events.length,4)
})
test('indexed and full facts produce identical metrics including conflicting duplicates and unknown sources',()=>{
 const facts={known:new Set(['1','2','3']),errors:{analysis:'source unavailable'},events:[{user_id:'3',event_id:'x',t:1},{user_id:'1',event_id:'x',t:2},{user_id:'2',event_id:'y',t:3}],trades:[['3',999],['1',.1],['2',.2],['1',.3]].map(([account_id,trade_value],i)=>({account_id,trade_value,transaction_hash:i===3?'1':String(i),chain:'eth',valid:true,transaction_time:new Date(10).toISOString()}))}
 const members=[{id:'2'},{id:'1'},{id:'2'},{id:'unknown'}],period={start:0,end:100},snapshot={snapshot_cutoff:new Date(100).toISOString()}
 assert.deepEqual(memberMetrics(createMemberFactSelector(facts)(members),members,period,snapshot),memberMetrics(facts,members,period,snapshot))
})
