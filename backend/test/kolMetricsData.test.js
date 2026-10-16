const {test}=require('node:test'),assert=require('node:assert/strict')
const remote=require('../src/data/hologres'),{kolMetrics}=require('../src/data/kolMetrics')
const asOf=Date.parse('2026-10-14T12:00:00Z'),start=asOf-86400000,end=asOf+1
remote.status=async()=>({snapshot_id:'test',snapshot_cutoff:new Date(asOf).toISOString(),as_of:new Date(asOf).toISOString()})
remote.cached=async(_key,fn)=>fn()
test('source failures stay unknown while successful sources remain usable',async()=>{
  remote.query=async sql=>{
    if(sql.includes('SELECT event_id,SUBSTRING'))throw Error('analysis offline')
    if(sql.includes('trade_groups'))return [{account_id:'1',chain:3,transaction_hash:'x',trade_value:10,transaction_time:new Date(asOf-1000).toISOString(),valid:true}]
    if(sql.includes('user_invitation_relation'))return []
    return [{account_id:'1',created_at:'2026-01-01T00:00:00Z'}]
  }
  const r=await kolMetrics([{id:'a',account_id:'1'},{id:'b',account_id:null}],{start,end})
  assert.equal(r.metrics[0].own.total.analysis_events,null)
  assert.equal(r.metrics[0].own.total.volume_usd,10)
  assert.equal(r.metrics[0].own.rows[0].analysis_days,null)
  assert.equal(r.metrics[0].invited.total.analysis_events,null)
  assert.equal(r.metrics[1].available,false)
  assert.equal(r.errors.analysis,'analysis offline')
})
test('failed referral query does not erase own metrics or fabricate invitation zeros',async()=>{
  remote.query=async sql=>{
    if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'a',user_id:'1',t:asOf-1000}]
    if(sql.includes('trade_groups'))return []
    if(sql.includes('user_invitation_relation'))throw Error('referral offline')
    return [{account_id:'1',created_at:'2026-01-01T00:00:00Z'}]
  }
  const r=await kolMetrics([{id:'a',account_id:'1'}],{start,end})
  assert.equal(r.metrics[0].own.total.analysis_events,1)
  assert.equal(r.metrics[0].invited,null)
  assert.equal(r.errors.referral,'referral offline')
})
test('relationship microseconds survive into KOL aggregation',async()=>{
 const at=asOf-1000,order=at*1000+900
 remote.query=async sql=>{
  if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'before',user_id:'2',t:at},{event_id:'after',user_id:'2',t:at+1}]
  if(sql.includes('trade_groups'))return [899,900].map((micro,i)=>({account_id:'2',chain:3,transaction_hash:String(i),trade_value:10,transaction_time:new Date(at).toISOString(),transaction_order:String(at*1000+micro),valid:true}))
  if(sql.includes('user_invitation_relation'))return [{id:'r',user_id:'2',level1_user_id:'1',is_valid:true,invitation_time:new Date(at).toISOString(),invitation_order:String(order)}]
  return [{account_id:'1',created_at:'2026-01-01T00:00:00Z'},{account_id:'2',created_at:'2026-01-01T00:00:00Z'}]
 }
 const r=await kolMetrics([{id:'a',account_id:'1'}],{start,end})
 assert.equal(r.metrics[0].invited.total.analysis_events,1);assert.equal(r.metrics[0].invited.total.transactions,1)
})
test('manual-only KOL metrics work without an own account or referral lookup',async()=>{
 remote.query=async sql=>{
  if(sql.includes('user_invitation_relation'))throw Error('manual profiles must not need referrals')
  if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'tag1',user_id:'2',t:asOf-1000}]
  if(sql.includes('trade_groups'))return [{account_id:'2',chain:3,transaction_hash:'tag-t',trade_value:12,transaction_time:new Date(asOf-1000).toISOString(),valid:true}]
  return [{account_id:'2'}]
 }
 const r=await kolMetrics([{id:'manual',account_id:null,user_ids:['2','2']}],{start,end}),m=r.metrics[0]
 assert.equal(m.available,true);assert.equal(m.own,null);assert.equal(m.invited,null);assert.equal(m.tagged.total.users,1);assert.equal(m.tagged.total.analysis_events,1);assert.equal(m.tagged.total.volume_usd,12);assert.equal(r.errors.referral,null)
})
test('tag scopes deduplicate overlaps, exclude own account and can return summary-only lists',async()=>{
 remote.query=async sql=>{
  if(sql.includes('user_invitation_relation'))return []
  if(sql.includes('SELECT event_id,SUBSTRING'))return ['1','2'].map(user_id=>({event_id:'a'+user_id,user_id,t:asOf-1000}))
  if(sql.includes('trade_groups'))return []
  return ['1','2'].map(account_id=>({account_id,created_at:'2026-01-01T00:00:00Z'}))
 }
 const profiles=[{id:'a',account_id:'1',user_ids:['1','2','2']}]
 const m=(await kolMetrics(profiles,{start,end})).metrics[0]
 assert.equal(m.tagged.total.users,2);assert.equal(m.tagged.total.analysis_events,2);assert.equal(m.tagged_excluding_own.total.users,1);assert.equal(m.own.total.users,1)
 const small=(await kolMetrics(profiles,{start,end},{includeDetails:false})).metrics[0];assert.equal(small.tagged.rows,undefined);assert.equal(small.tagged.daily,undefined);assert.equal(small.tagged.total.users,2)
})
test('account lookup failures make manual populations unknown rather than zero',async()=>{
 remote.query=async sql=>{
  if(sql.includes('SELECT account_id::text AS account_id'))throw Error('accounts offline')
  return []
 }
 const r=await kolMetrics([{id:'a',account_id:null,user_ids:['2']}],{start,end})
 assert.equal(r.metrics[0].tagged,null);assert.equal(r.errors.account,'accounts offline')
})
