const test=require('node:test'),assert=require('node:assert/strict')
const remote=require('../src/data/hologres')
const {orderedFunnelUsers,loadUsers}=require('../src/data/remoteUsers')
const {computeFunnel}=require('../src/analytics/funnel')
test('remote composite condition requires event user_id and shares evidence timestamp with analysis',async()=>{
 const original=remote.query
 try{
  remote.query=async(sql,params)=>{
   assert(sql.includes("e.event_name=ANY($9::text[]) AND NULLIF(BTRIM(e.user_id),'') IS NOT NULL"))
   assert(params[8].includes('login_succeeded'));assert(params[8].includes('chip_analysis_drilldown'))
   return [{user_key:'user:1',source:'direct',step0:[100],step1:[100]}]
  }
  const s={snapshot_cutoff:new Date(1000).toISOString(),as_of:new Date(1000).toISOString()}
  const body={start:0,end:1000,steps:['login_verified','chip'],hours:24}
  const users=await orderedFunnelUsers(s,body)
  assert.equal(computeFunnel(users,{steps:body.steps,startAt:0,endAt:1000,asOf:1000}).total_converted,1)
 }finally{remote.query=original}
})
test('raw loader excludes inferred anonymous login evidence even after identity merge',async()=>{
 const original=remote.query
 try{
  remote.query=async()=>[{user_key:'user:1',user_id:null,event_name:'chip_analysis_drilldown',client_ts:100},{user_key:'user:2',user_id:'2',event_name:'chip_analysis_drilldown',client_ts:200}]
  const s={snapshot_cutoff:new Date(1000).toISOString(),as_of:new Date(1000).toISOString()}
  const users=await loadUsers(s,{types:['login_verified','chip'],start:0,end:1000})
  assert.equal(users[0].events.some(e=>e.type==='login_verified'),false)
  assert.equal(users[1].events.filter(e=>e.type==='login_verified').length,1)
 }finally{remote.query=original}
})
