const {test}=require('node:test'),assert=require('node:assert/strict'),remote=require('../src/data/hologres')
const {growthFacts,growthQuality,cohortTrades}=require('../src/data/growthInsights')
const s={snapshot_cutoff:'2026-10-18T00:00:00Z',as_of:'2026-10-18T00:00:00Z'}
test('growth loader bounds snapshot, passes selected audience, projects compact facts and rejects oversized data',async()=>{
 const old=remote.query;let captured
 try{remote.query=async(sql,params)=>{captured={sql,params};return [{user_key:'user:1',first_seen_at:'100',first_chip_at:null,chip_days:[1,2],first_day_hours:'2'}]}
 const rows=await growthFacts(s,{start:100,end:1000,source:'x'},['user:1'])
 assert.equal(rows[0].first_chip_at,null);assert.equal(rows[0].first_seen_at,100);assert.equal(rows[0].first_day_hours,2)
 assert.equal(captured.params[4],'x');assert.deepEqual(captured.params[5],['user:1']);assert.equal(captured.params[6],-800)
 assert(captured.sql.includes('LIMIT 50001'));assert(!captured.sql.includes('e.properties AS'))
 remote.query=async()=>Array.from({length:50001},()=>({}));await assert.rejects(()=>growthFacts(s,{start:100,end:1000}),/预算/)
 }finally{remote.query=old}
})
test('quality query requires relation IDs and caps unbounded version groups; unavailable trade stays unknown',async()=>{
 const old=remote.query
 try{remote.query=async(sql)=>{assert(sql.includes("properties->>'analysis_request_id'"));assert(sql.includes('LIMIT 2001'));return []};await growthQuality(s,{start:100,end:1000},[])
 remote.query=async()=>{throw Error('secret database detail')}
 const result=await cohortTrades(s,[{user_key:'user:1',first_seen_at:100,first_chip_at:100}],{start:100,end:1000});assert.equal(result.known,null);assert(!result.error.includes('secret'))
 }finally{remote.query=old}
})
