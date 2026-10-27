const { test } = require('node:test')
const assert = require('node:assert/strict')
const { auditTracking } = require('../../scripts/audit-tracking.cjs')
const remote = require('../src/data/hologres')

test('database audit pairs earlier starts, validates only permitted properties and exports no identities or payloads',async()=>{
 const original=remote.query,DAY=86400000,asOf=10*DAY
 const common={user_key:'user:private-account',properties:{analysis_request_id:'private-request',token_address:'private-token',chain:'3'}}
 const rows=[
  {...common,event_id:'private-event-1',event_name:'analysis_requested',client_ts:asOf-DAY-100,properties:{...common.properties,analysis_kind:'chip',trigger:'user_action'}},
  {...common,event_id:'private-event-2',event_name:'analysis_request_finished',client_ts:asOf-DAY+100,properties:{...common.properties,outcome:'success',duration_ms:200,viewport_width:1200,secret:'private-secret'}},
  {...common,event_id:'private-event-3',event_name:'page_content_load_started',client_ts:asOf-100,properties:{page_load_id:'private-load',load_type:'spa',content_type:'token'}},
 ]
 const calls=[]
 try{
  remote.query=async(sql,params)=>{
   calls.push({sql,params})
   if(sql.includes('LIMIT 5001'))return rows
   if(sql.includes('GROUP BY event_name'))return [{event_name:'analysis_requested',events:'1'},{event_name:'analysis_request_finished',events:'1'},{event_name:'page_content_load_started',events:'1'}]
   if(sql.includes('COUNT(*) AS received'))return [{received:'3'}]
   if(sql.includes('window_received'))return [{window_received:'3',n:'3',same_id_others:0,excluded:0}]
   throw Error('Unexpected audit query')
  }
  const report=await auditTracking({...remote,status:async()=>({as_of:new Date(asOf).toISOString(),snapshot_cutoff:new Date(asOf+1000).toISOString(),snapshot_id:'test'})},{days:1})
  assert.equal(report.schema.checked_events,2);assert.equal(report.schema.invalid_events,0)
  assert.equal(report.families.analysis.requests,0) // Start precedes window, so no invented in-window attempt.
  assert.equal(report.families.analysis.quality.orphan_terminals,0)
  assert.equal(report.families.page_load.counts.pending,1)
  assert.equal(report.arrivals.reconciled,true)
  assert(report.missing_fact_events.includes('login_attempt_started'))
  assert.equal(report.end_to_end_verified,false);assert.equal(report.continuous_coverage_confirmed,false)
  assert(!JSON.stringify(report).includes('private-'))
  assert(calls.every(({sql})=>!/(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(sql)))
  assert(calls[0].sql.includes('candidates'))
 }finally{remote.query=original}
})
test('database audit rejects invalid windows and over-budget results instead of silently truncating',async()=>{
 await assert.rejects(()=>auditTracking({}, {days:0}),/1 to 31/)
 await assert.rejects(()=>auditTracking({}, {days:1.5}),/1 to 31/)
 await assert.rejects(()=>auditTracking({status:async()=>({as_of:'bad',snapshot_cutoff:'bad'})}),/Invalid snapshot/)
 await assert.rejects(()=>auditTracking({status:async()=>({as_of:'2026-10-21T00:00:00Z',snapshot_cutoff:'2026-10-21T00:00:00Z'}),eventsCte:()=>'',query:async()=>Array(5001).fill({})}),/budget/)
})
