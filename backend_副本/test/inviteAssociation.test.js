const {test}=require('node:test'),assert=require('node:assert/strict')
const {inviteAssociation,referralKey,referralKeyFromUrl}=require('../src/analytics/inviteAssociation')
const b={start:1000,end:10000,hours:1},asOf=4000000,key=referralKey('test-code')
const relation={id:'r',invitee:'1',inviter:'2',bound_at:4000,referral_key:key}
const event=(raw_name,t,extra={})=>({raw_name,t,event_id:raw_name+t,properties:{},anonymous_id:'a',session_id:'s',...extra})
const entry=()=>event('page_viewed',2000,{referral_key:key})
const login=()=>event('login_succeeded',5000,{actor_user_id:'1'})
const run=(events,rs=[relation],body=b)=>inviteAssociation([{id:'user:1',source:'referral',events}],rs,body,asOf)
test('anonymous entry, real login identity, matching code and server bind before callback produce a matched relationship',()=>{
 const r=run([entry(),login(),event('chip_analysis_drilldown',6000)])
 assert.deepEqual(r.payload.steps.map(s=>s.entries),[1,1,1,1]);assert.equal(r.payload.records[0].bound_at,4000);assert.equal(r.payload.records[0].login_at,5000);assert.deepEqual(r.lists['invite:association:bound'],['user:1'])
 assert(!JSON.stringify(r).includes(key));assert(!JSON.stringify(r).includes('test-code'))
})
test('time alone, a different anonymous id, or mismatched account cannot confirm identity',()=>{
 for(const x of [{anonymous_id:'other'},{actor_user_id:'3'},{actor_user_id:null}]){const r=run([entry(),{...login(),...x}]).payload;assert.equal(r.steps[1].entries,0);assert.equal(r.steps[2].entries,0)}
})
test('multiple candidate visits, mismatched code, changed relation and preexisting binding are separated',()=>{
 assert.equal(run([entry(),event('page_viewed',3000,{referral_key:key}),login()]).payload.states[0].state,'ambiguous')
 assert.equal(run([entry(),login()],[{...relation,referral_key:referralKey('other')}]).payload.states[0].state,'code_mismatch')
 assert.equal(run([entry(),login()],[{...relation,has_rebinding:true}]).payload.states[0].state,'relation_changed')
 assert.equal(run([entry(),login()],[{...relation,bound_at:1500}]).payload.states[0].state,'preexisting')
})
test('first-visit and page-view evidence in the same session consolidate, distinct sessions remain ambiguous',()=>{
 assert.equal(run([entry(),event('first_visit_captured',2010,{referral_key:key}),login()]).payload.entries,1)
 const r=run([entry(),event('first_visit_captured',2010,{referral_key:key,session_id:'other'}),login()]).payload
 assert.equal(r.entries,2);assert.equal(r.steps[2].entries,0)
})
test('flow login can associate without code but cannot claim code-matched binding',()=>{
 const r=run([event('invite_link_visited',2000,{properties:{invite_flow_id:'f'}}),event('login_succeeded',5000,{actor_user_id:'1',anonymous_id:'other',properties:{invite_flow_id:'f'}})]).payload
 assert.equal(r.steps[1].entries,1);assert.equal(r.steps[2].entries,0);assert.equal(r.states[0].state,'identity_only')
})
test('results across reporting boundary count within window; late login, future events and future binding do not',()=>{
 assert.equal(run([entry(),{...login(),t:15000}]).payload.steps[2].entries,1)
 assert.equal(run([entry(),{...login(),t:4000001}]).payload.steps[2].entries,0)
 assert.equal(run([entry(),login()],[{...relation,bound_at:3602000}]).payload.steps[2].entries,0)
})
test('filters retain full counts and lists while limiting records, with status applied before cap',()=>{
 const users=Array.from({length:110},(_,i)=>({id:'user:'+i,events:[event('invite_link_visited',2000,{actor_user_id:String(i),properties:{invite_flow_id:'f'+i}})]}))
 const r=inviteAssociation(users,[],{...b,status:'account_only'},asOf)
 assert.equal(r.payload.record_total,110);assert.equal(r.payload.records.length,100);assert.equal(r.lists['invite:association:account'].length,110)
 assert.equal(run([entry(),login()],[relation],{...b,link:'missing'}).payload.entries,0)
})
test('shared flow across identities is a conflict, existing actor requires the matching account',()=>{
 const r=inviteAssociation(['1','2'].map(id=>({id:'user:'+id,events:[event('invite_link_visited',2000,{actor_user_id:id,properties:{invite_flow_id:'f'}})]})),[],b,asOf)
 assert(r.payload.records.every(x=>x.state==='conflict'))
 assert.equal(run([{...entry(),actor_user_id:'1'}]).payload.steps[2].entries,1)
})
test('only an own landing URL referral parameter is hashed, not arbitrary domains or unrelated URL fields',()=>{
 assert.equal(referralKeyFromUrl('/cn/strategies?referral=test-code'),key)
 assert.equal(referralKeyFromUrl('https://logearn.com/cn?referral=test-code'),key)
 assert.equal(referralKeyFromUrl('https://evil.example/?referral=test-code'),null)
 assert.equal(referralKeyFromUrl('/cn?referral='),null)
 assert.equal(referralKeyFromUrl('/cn?referrer=test-code'),null)
})
test('explicit flow and historical page URL share a single visit when the exact page ID agrees',()=>{
 const p={page_visit_id:'page'},r=run([{...entry(),properties:p},event('invite_link_visited',2100,{properties:{...p,invite_flow_id:'f'}}),{...login(),properties:{invite_flow_id:'f'}}]).payload
 assert.equal(r.entries,1);assert.equal(r.steps[2].entries,1);assert.equal(r.records[0].entry_evidence,'flow_event')
})
test('distinct flows on the same page remain separate candidate entries',()=>{
 const r=run([event('invite_link_visited',2000,{referral_key:key,actor_user_id:'1',properties:{page_visit_id:'p',invite_flow_id:'one'}}),event('invite_link_visited',3000,{referral_key:key,actor_user_id:'1',properties:{page_visit_id:'p',invite_flow_id:'two'}})]).payload
 assert.equal(r.entries,2);assert.equal(r.steps[2].entries,0);assert.equal(r.states[0].state,'ambiguous')
})
