const test=require('node:test'),assert=require('node:assert/strict'),{productChain}=require('../src/analytics/productChain'),{requestDiagnostics}=require('../src/analytics/requestDiagnostics')
const DAY=86400000,p={token_visit_id:'v',token_address:'token',chain:'3',entry_module:'signals'},event=(type,t,props={})=>({type,t,raw_name:{token:'token_detail_viewed',trade:'trade_succeeded'}[type]||type,session_id:'s',device:'desktop',properties:{...p,...props}})
const request=(id,t,outcome='success',extra={})=>[event('analysis_requested',t,{analysis_request_id:id,analysis_kind:'full_lifecycle',trigger:'user_action',...extra}),event('analysis_request_finished',t+1,{analysis_request_id:id,outcome,duration_ms:1,...extra})]
const run=(events,asOf=DAY+100,tradeFacts={trades:[],known:new Set(['u']),error:null})=>{const users=[{id:'u',source:'x',first_seen_at:0,events}],options={start:0,end:100,asOf};return productChain(users,options,requestDiagnostics(users,options).analysis_rows,tradeFacts)}
test('same-visit ordered analysis retry links to a matching business database trade',()=>{
 const events=[event('token',10),...request('failed',11,'failed'),...request('ok',20),event('trade_submitted',30,{trade_attempt_id:'a'}),event('trade',40,{trade_attempt_id:'a'})],r=run(events,DAY+100,{trades:[{user_id:'u',chain:'3',token_address:'token',transaction_hash:'hash',t:40}],known:new Set(['u']),error:null})
 assert.deepEqual(r.payload.stages.map(s=>s.visits),[1,1,1,1,1]);assert.deepEqual(r.lists['chain:stage:4'],['u']);assert(r.payload.drops.every(d=>d.visits===0));assert.equal(r.payload.dimensions.user_stage[0].value,'本期首次观测')
})
test('cross-visit, cross-token, cross-chain analysis and frontend-only trades never complete the chain',()=>{
 for(const mismatch of [{token_visit_id:'other'},{token_address:'other'},{chain:'56'}]){const r=run([event('token',10),...request('r',11,'success',mismatch)]);assert.deepEqual(r.payload.stages.map(s=>s.visits),[1,0,0,0,0])}
 const r=run([event('token',10),...request('r',11),event('trade_submitted',30,{trade_attempt_id:'a'}),event('trade',40,{trade_attempt_id:'other'})]);assert.deepEqual(r.payload.stages.map(s=>s.visits),[1,1,1,1,0]);assert.equal(r.payload.drops[3].users,0);assert.equal(r.payload.drops[3].unknown,1)
})
test('pending windows are separate from mature gaps, missing association remains a coverage issue',()=>{
 const events=[event('token',10),event('token',11,{token_visit_id:null}),event('analysis_requested',12,{analysis_request_id:'r',analysis_kind:'circle_select',trigger:'user_action',token_visit_id:null})],pending=run(events,100)
 assert.equal(pending.payload.pending,1);assert(pending.payload.drops.every(d=>d.eligible===0));assert.equal(pending.payload.quality.missing_visit_context,1);assert.equal(pending.payload.quality.requests_missing_visit,1)
 const mature=run(events);assert.equal(mature.payload.drops[0].visits,1);assert.equal(mature.payload.stages[0].visits,1)
})
test('completion outside 24h, background requests, and reverse order never count',()=>{
 let r=run([event('token',10),...request('auto',11,'success',{trigger:'background_refresh'})]);assert.equal(r.payload.stages[1].visits,0)
 r=run([event('token',10),...request('old',5)]);assert.equal(r.payload.stages[1].visits,0)
 r=run([event('token',10),event('analysis_requested',11,{analysis_request_id:'r',analysis_kind:'full_lifecycle',trigger:'user_action'}),event('analysis_request_finished',DAY+11,{analysis_request_id:'r',outcome:'success',duration_ms:DAY})]);assert.deepEqual(r.payload.stages.map(s=>s.visits),[1,1,0,0,0])
})
test('repeat details deduplicate visits, while one user in two visits stays one user per stage',()=>{
 const r=run([event('token',10),event('token',11),event('token',12,{token_visit_id:'second'})]);assert.equal(r.payload.stages[0].visits,2);assert.equal(r.payload.stages[0].users,1);assert.equal(r.payload.drops[0].visits,2);assert.equal(r.payload.drops[0].users,1)
})
test('rollout coverage counts event records independently from deduplicated visits',()=>{
 const r=run([event('token',10,{diagnostics_version:'web-core-chain-v1'}),event('token',11,{diagnostics_version:'web-core-chain-v1'}),event('token',12,{token_visit_id:'legacy'})]);assert.equal(r.payload.quality.versioned_detail_events,2);assert.equal(r.payload.quality.detail_events,3);assert.equal(r.payload.stages[0].visits,2)
})

test('frontend success never confirms a database trade; missing facts stay unknown',()=>{
 const events=[event('token',10),...request('r',11),event('trade_submitted',30),event('trade',40)]
 for(const facts of [{trades:[],known:null,error:'query failed'},{trades:[],known:new Set(['u']),error:null}]){
  const r=run(events,DAY+100,facts);assert.equal(r.payload.stages[4].visits,0);assert.equal(r.payload.drops[3].unknown,1);assert.equal(r.payload.drops[3].eligible,0);assert.deepEqual(r.lists['chain:unknown:3'],['u'])
 }
})
test('database confirmation works without frontend trade events and checks account, token, chain and strict time boundaries',()=>{
 const events=[event('token',10),...request('r',20)],trade={user_id:'u',chain:'3',token_address:'token',transaction_hash:'hash',t:40}
 const check=(row,known=new Set(['u']))=>run(events,DAY+100,{trades:[row],known,error:null})
 assert.deepEqual(check(trade).payload.stages.map(r=>r.visits),[1,1,1,1,1])
 for(const extra of [{user_id:'other'},{token_address:'other'},{chain:'56'},{t:21},{t:DAY+10},{t:DAY+101},{transaction_hash:null},{token_address:null},{valid:false}]){
  const r=check({...trade,...extra});assert.equal(r.payload.stages[4].visits,0,JSON.stringify(extra));assert.equal(r.payload.drops[2].unknown,1)
 }
 assert.equal(check(trade,new Set()).payload.stages[4].visits,0)
 assert.equal(run(events,30,{trades:[trade],known:new Set(['u']),error:null}).payload.stages[4].visits,0)
})
test('EVM addresses ignore casing while other chain addresses remain case sensitive',()=>{
 const address='0x'+'a'.repeat(40),events=[event('token',10,{token_address:address.toUpperCase().replace('0X','0x')}),...request('r',20,'success',{token_address:address.toUpperCase().replace('0X','0x')})]
 assert.equal(run(events,DAY+100,{trades:[{user_id:'u',chain:'3',token_address:address,transaction_hash:'h',t:40}],known:new Set(['u']),error:null}).payload.stages[4].visits,1)
 assert.equal(run([event('token',10),...request('r',20)],DAY+100,{trades:[{user_id:'u',chain:'3',token_address:'TOKEN',transaction_hash:'h',t:40}],known:new Set(['u']),error:null}).payload.stages[4].visits,0)
})
