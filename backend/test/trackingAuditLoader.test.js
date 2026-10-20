const {test}=require('node:test'),assert=require('node:assert/strict'),remote=require('../src/data/hologres')
const {trackingAuditFacts}=require('../src/data/trackingAudit')
const s={snapshot_cutoff:'2026-10-19T00:00:00Z'}
test('arrival audit uses raw rows before filtering, exact parameterized event IDs and a safe property projection',async()=>{
 const old=remote.query,calls=[]
 try{remote.query=async(sql,params)=>{calls.push({sql,params});if(calls.length===1)return [{received:'3',duplicate_rows:'1'}];if(calls.length===2)return [{n:'1'}];return []}
 const out=await trackingAuditFacts(s,{start:0,end:1000,event_ids:['id-1']})
 assert.equal(out.summary.received,3);assert.equal(out.summary.included,1);assert(calls[0].sql.includes('server_ts>='));assert(calls[0].sql.includes('invalid_client_times'));assert(calls[0].sql.includes('duplicate_rows'))
 assert.deepEqual(calls[2].params,[s.snapshot_cutoff,['id-1']]);assert(calls[2].sql.includes('MD5('));assert(calls[2].sql.includes('LIMIT 1001'));assert(!calls[2].sql.includes("properties->'token'"));assert(!calls[2].sql.includes("properties->'signature'"));assert(calls[3].sql.includes('FROM e WHERE event_id=ANY'))
 }finally{remote.query=old}
})
test('no sample IDs reads only aggregate arrival evidence and excessive duplicate data is rejected without truncation',async()=>{
 const old=remote.query;let count=0
 try{remote.query=async()=>{count++;return count%2===1?[{received:0}]:[{n:0}]};const out=await trackingAuditFacts(s,{start:0,end:1000});assert.equal(count,2);assert.equal(out.raw.length,0)
 count=0;remote.query=async()=>{count++;return count===1?[{received:1001}]:count===2?[{n:1}]:Array(1001).fill({})}
 await assert.rejects(()=>trackingAuditFacts(s,{start:0,end:1000,event_ids:['id']}),/预算/)
 }finally{remote.query=old}
})
test('arrival reconciliation explains historical identity exclusions and flags inconsistent multi-read totals',async()=>{
 const old=remote.query
 try{let calls=0
 remote.query=async(sql)=>{calls++;if(calls===1)return [{received:10}];if(calls===2)return [{n:7,same_id_others:1,excluded:2,window_received:10}];assert(sql.includes('dirty_anonymous_history'));return [{reason:'dirty_anonymous_history',records:2}]}
 const out=await trackingAuditFacts(s,{start:0,end:1000});assert.equal(out.summary.reconciled,true);assert.deepEqual(out.summary.excluded_reasons,[{reason:'dirty_anonymous_history',records:2}]);assert.equal(calls,3)
 calls=0;remote.query=async()=>{calls++;return calls===1?[{received:10}]:calls===2?[{n:7,same_id_others:1,excluded:2,window_received:10}]:[{reason:'dirty_anonymous_history',records:1}]}
 assert.equal((await trackingAuditFacts(s,{start:0,end:1000})).summary.reconciled,false)
 }finally{remote.query=old}
})
