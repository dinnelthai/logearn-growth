const {test}=require('node:test'),assert=require('node:assert/strict'),remote=require('../src/data/hologres'),{registrationFacts,diagnosticCoverage}=require('../src/data/growthEvidence')
const s={as_of:new Date(10000000).toISOString(),snapshot_cutoff:new Date(10000001).toISOString()}
test('registration loader preserves zero-event accounts, scoped empty audience and unavailable fact state',async()=>{
 const old=remote.query
 try{remote.query=async(sql,p)=>{assert(sql.includes('LEFT JOIN e'));assert(sql.includes('a.created_at>='));assert(sql.includes('e.client_ts>=r.registered_at'));assert(sql.includes('e.event_name IN'));assert(sql.includes('holders_analysis_viewed'));assert(sql.includes('strategy_started'));assert(sql.includes('signal_viewed'));assert(sql.includes('first_repeat_chip_at'));assert.deepEqual(p[5],[]);assert.equal(p[4],'x');return [{user_key:'user:1',registered_at:'100',first_chip_at:null,first_holder_at:'150',first_strategy_at:'160',first_signal_at:'170',first_repeat_chip_at:null}]}
 const r=await registrationFacts(s,{start:100,end:1000,source:'x'},[]);assert.equal(r.scope,'observed_source');assert.equal(r.rows[0].first_chip_at,null);assert.equal(r.rows[0].registered_at,100);assert.equal(r.rows[0].first_holder_at,150);assert.equal(r.rows[0].first_strategy_at,160);assert.equal(r.rows[0].first_signal_at,170);assert.equal(r.rows[0].first_repeat_chip_at,null)
 remote.query=async()=>{throw Error('offline')};const failed=await registrationFacts(s,{start:100,end:1000});assert.equal(failed.available,false);assert.deepEqual(failed.rows,[])
 remote.query=async()=>Array.from({length:50001},()=>({}));await assert.rejects(registrationFacts(s,{start:100,end:1000}),e=>e.status===422)
 }finally{remote.query=old}
})
test('coverage uses exact family totals plus overlapping device/version groups and enforces group budget',async()=>{
 const old=remote.query
 try{remote.query=async(sql,p)=>{assert(sql.includes('COUNT(DISTINCT user_key)'));assert(sql.includes('UNION ALL'));assert.equal(p[0],s.snapshot_cutoff);return [{scope:'family',family:'analysis',users:'1',events:'1000'}]}
 const r=await diagnosticCoverage(s,{start:100,end:1000});assert.equal(r.rows[0].users,1);assert.equal(r.rows[0].events,1000)
 remote.query=async()=>Array.from({length:2001},()=>({}));await assert.rejects(diagnosticCoverage(s,{start:100,end:1000}),e=>e.status===422)
 }finally{remote.query=old}
})
