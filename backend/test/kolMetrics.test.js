const {test}=require('node:test'),assert=require('node:assert/strict')
const {aggregateMembers,validatePeriod}=require('../src/analytics/kolMetrics')
test('KOL metrics count unique events and trades after binding, use absolute USD and retain missing amounts',()=>{
  const start=Date.parse('2026-10-01T00:00:00+07:00'),end=start+86400000
  const event=(id,user_id,t)=>({event_id:id,user_id,t})
  const trade=(hash,account_id,t,value,valid=true)=>({transaction_hash:hash,chain:3,account_id,transaction_time:new Date(t).toISOString(),trade_value:value,valid})
  const result=aggregateMembers([{id:'1',bound_at:start+1000},{id:'2',bound_at:start+2000}],
    [event('before','1',start),event('a','1',start+1000),event('a','1',start+1000),event('b','2',start+2000),event('end','1',end),event('future','1',end-1)],
    [trade('before','1',start,100),trade('x','1',start+1000,-25),trade('x','1',start+1000,-25),trade('y','2',start+2000,null),trade('bad','2',start+2001,50,false)],
    {start,end,asOf:end-2})
  assert.equal(result.total.analysis_events,2);assert.equal(result.total.analysis_users,2)
  assert.equal(result.total.transactions,2);assert.equal(result.total.volume_usd,25)
  assert.equal(result.total.missing_values,1);assert.equal(result.total.excluded_trades,1)
  assert.equal(result.rows.find(r=>r.user_id==='2').volume_usd,null)
  assert.equal(result.daily[0].date,'2026-10-01');assert.equal(result.daily[0].analysis_events,2)
})
test('unobserved facts and a legitimate empty period are separate from invalid dates',()=>{
  const result=aggregateMembers([{id:'1'}],[],[],{start:1,end:100,asOf:100})
  assert.equal(result.total.volume_usd,0);assert.equal(result.total.last_analysis_at,null)
  assert.throws(()=>validatePeriod({start:'1',end:100}),/有效统计期/)
  assert.throws(()=>validatePeriod({start:100,end:100}),/有效统计期/)
  assert.throws(()=>validatePeriod({start:1,end:367*86400000}),/有效统计期/)
})
test('sub-millisecond bindings exclude earlier trades and millisecond analysis events',()=>{
 const t=1000,order=1000900
 const result=aggregateMembers([{id:'1',bound_at:t,bound_order:order}],
  [{event_id:'before','user_id':'1',t},{event_id:'after',user_id:'1',t:t+1}],
  [899,900,901].map((micro,i)=>({account_id:'1',chain:1,transaction_hash:String(i),transaction_time:'1970-01-01T00:00:01.000'+micro+'Z',transaction_order:String(1000000+micro),trade_value:10,valid:true})),
  {start:0,end:2000,asOf:2000})
 assert.equal(result.total.transactions,2);assert.equal(result.total.volume_usd,20);assert.equal(result.total.analysis_events,1)
})
