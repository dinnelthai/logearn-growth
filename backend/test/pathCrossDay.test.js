const {test}=require('node:test'),assert=require('node:assert/strict')
const {pathCrossDay}=require('../src/analytics/pathCrossDay'),{computePaths}=require('../src/analytics/paths')
const day=86400000,start=Date.parse('2026-10-17T00:00:00+07:00'),s={as_of:new Date(start+7*day).toISOString()}
test('cross-day counts deduplicate natural days, ignore pivot filters and include midnight returns under 24h',()=>{
 const users=[{id:'user:1',source:'x',events:[{type:'token',t:start-1},{type:'chip',t:start+day-1000},{type:'chip_drilldown',t:start+day},{type:'chip',t:start+day+1000},{type:'token',t:start+7*day}]},{id:'user:2',source:'x',events:[{type:'token',t:start},{type:'token',t:start+1000}]},{id:'user:3',source:'y',events:[{type:'chip',t:start},{type:'chip',t:start+day}]}]
 const r=pathCrossDay(users,{start,end:start+7*day,source:'x',path_start:'ai'},s)
 assert.equal(r.payload.users,2);assert.equal(r.payload.returning_users,1);assert.equal(r.payload.analysis_returning_users,1);assert.equal(r.payload.median_first_return_hours,1000/3600000);assert.deepEqual(r.lists['crossday:returning'],['user:1']);assert.equal(r.payload.partial_last_day,false);assert.equal(r.payload.entries[0].from,'chip');assert.equal(r.payload.entries[0].to,'chip_drilldown')
})
test('before direction uses last steps through first pivot in each session, chip includes drilldown',()=>{
 const events=['token_click','token','ai','chip_drilldown','token'].map((type,i)=>({type,t:start+i*1000,session_id:'s'}))
 const r=computePaths([{id:'u',events}],{startAt:start,endAt:start+day,asOf:start+2*day,startEvent:'chip',direction:'before',stopEvent:'token',maxSteps:3})
 assert.equal(r.sessions,1);assert.deepEqual(r.paths[0].types,['token','ai','chip_drilldown']);assert.equal(r.paths[0].terminal,'reached')
 assert.equal(computePaths([{id:'u',events}],{startAt:start,endAt:start+day,asOf:start+2*day,startEvent:'login',direction:'before'}).sessions,0)
})
test('invalid direction and before without a concrete pivot are rejected',()=>{
 const {validatePaths}=require('../src/analytics/pathInsights')
 assert.throws(()=>validatePaths({start,end:start+day,path_direction:'sideways'}));assert.throws(()=>validatePaths({start,end:start+day,path_direction:'before',path_start:'all'}))
})
