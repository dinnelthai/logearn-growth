const {test}=require('node:test'),assert=require('node:assert/strict')
const {normalizeAuditInput,trackingAudit,contractIssues}=require('../src/analytics/trackingAudit')
const s={as_of:'2026-10-19T00:00:00Z',snapshot_cutoff:'2026-10-19T00:00:01Z'}
const row=(id,extra={})=>({event_id:id,event_name:'analysis_requested',client_ts:100,server_ts:s.as_of,identity_fingerprint:'opaque',properties:{analysis_request_id:'r',analysis_kind:'full_lifecycle',trigger:'user_action',token_address:'token',chain:3},...extra})
test('normalization strips identities and arbitrary credentials, validates budgets and rejects inconsistent same-ID samples',()=>{
 const n=normalizeAuditInput({samples:[{...row('one'),user_id:'private-user',token:'secret',properties:{...row('one').properties,password:'secret',signature:'private'}}]})
 assert(!JSON.stringify(n).includes('secret'));assert(!JSON.stringify(n).includes('private'));assert.deepEqual(n.event_ids,['one'])
 for(const bad of [{event_ids:['bad id']},{event_ids:Array(101).fill('one')},{collector_status:200.1},{samples:[row('one'),{...row('one'),client_ts:101}]}])assert.throws(()=>normalizeAuditInput(bad))
})
test('HTTP200 plus database presence is not a full evidence chain; original browser samples and explicit evidence are required',()=>{
 const raw=row('one'),sample={event_id:'one',event_name:raw.event_name,client_ts:100,properties:raw.properties}
 const base={start:0,end:200,event_ids:['one'],collector_status:200}
 let m=trackingAudit([raw],[raw],{},base,s).payload
 assert.equal(m.rows[0].state,'consistent');assert.equal(m.rows[0].evidence_state,'incomplete');assert.equal(m.continuous_coverage_confirmed,false)
 m=trackingAudit([raw],[raw],{},{...base,samples:[sample],browser_confirmed:true,collector_business_success:true},s).payload
 assert.equal(m.counts.sample_consistent,1);assert.equal(m.rows[0].browser_evidence,'manually_reported');assert(!JSON.stringify(m).includes('opaque'))
 assert.equal(trackingAudit([raw],[raw],{},{...base,samples:[sample],browser_confirmed:true},s).payload.counts.sample_consistent,0)
})
test('database acceptance, contracts, duplicate conflicts, missing IDs and sample differences remain distinct',()=>{
 const a=row('ok'),bad=row('bad',{properties:{analysis_request_id:'bad'}}),conflict=row('conflict'),copy={...conflict,identity_fingerprint:'different'},excluded=row('excluded',{invalid_client_time:true}),mismatch=row('mismatch')
 const out=trackingAudit([a,a,bad,conflict,copy,excluded,mismatch],[a,bad,conflict,mismatch],{}, {start:0,end:200,event_ids:['ok','bad','conflict','excluded','mismatch','missing'],samples:[{event_id:'mismatch',event_name:'different'}]},s).payload
 assert.deepEqual(out.rows.map(r=>r.state),['consistent','schema_issue','duplicate_conflict','excluded','sample_mismatch','not_found'])
 assert.equal(out.rows[0].raw_records,2);assert(out.rows[1].issues.some(x=>x.includes('analysis_kind')));assert.deepEqual(out.rows[4].differences,['event_name']);assert(out.rows[3].exclusions.length)
})
test('contract validation handles zero duration, presented loads, cancellation and unknown prototype event names safely',()=>{
 assert.equal(contractIssues(row('x',{event_name:'page_content_load_finished',properties:{page_load_id:'p',outcome:'presented',duration_ms:0}})).issues.length,0)
 assert(contractIssues(row('x',{event_name:'analysis_request_finished',properties:{analysis_request_id:'r',outcome:'cancelled',duration_ms:1}})).issues.some(x=>x.includes('cancel_reason')))
 assert(contractIssues(row('x',{event_name:'analysis_request_finished',properties:{analysis_request_id:'r',outcome:'failed',duration_ms:'1'}})).issues.some(x=>x.includes('duration_ms')))
 assert.equal(contractIssues(row('x',{event_name:'constructor'})).defined,false)
 assert.equal(contractIssues(row('x',{client_ts:null})).issues.includes('客户端时间无效'),true)
})
test('mutable-source differences between raw lookup and metric lookup never pass sample validation',()=>{
 const raw=row('one'),changed=row('one',{client_ts:101})
 const m=trackingAudit([raw],[changed],{},{start:0,end:200,event_ids:['one']},s).payload
 assert.equal(m.rows[0].state,'read_conflict');assert.equal(m.rows[0].evidence_state,'incomplete')
 const reordered=row('two',{properties:Object.fromEntries(Object.entries(raw.properties).reverse())})
 const duplicate=trackingAudit([row('two'),reordered],[row('two')],{},{start:0,end:200,event_ids:['two']},s).payload
 assert.equal(duplicate.rows[0].state,'consistent')
})
test('analysis business result requires no request timing or cache metrics',()=>{
 const checked=contractIssues({event_name:'analysis_request_finished',client_ts:100,properties:{analysis_request_id:'business',outcome:'success'}})
 assert.deepEqual(checked.issues,[])
})
