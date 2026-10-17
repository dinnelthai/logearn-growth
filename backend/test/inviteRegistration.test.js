const {test}=require('node:test'),assert=require('node:assert/strict')
const {inviteRegistration}=require('../src/analytics/inviteRegistration')
const {referralKey}=require('../src/analytics/inviteAssociation')
const b={start:1000,end:10000,hours:1},asOf=4000000,key=referralKey('entry-code')
const accounts=[{id:'1',created_at:3000,code_key:referralKey('own')},{id:'2',created_at:0,code_key:key}]
const relation={id:'r',invitee:'1',inviter:'2',valid:true,bound_at:3500}
const event=(raw_name,t,p={},actor_user_id=null)=>({raw_name,t,actor_user_id,event_id:raw_name+t,session_id:'s',anonymous_id:'a',properties:{invite_flow_id:'f',...p}})
const events=()=>[{...event('invite_link_visited',2000,{invite_verification_version:'registration-v1'}),referral_key:key},event('login_attempt_finished',4000,{outcome:'success'},'1'),event('chip_analysis_drilldown',5000)]
const run=(es=events(),rs=[relation],as=accounts,opts={},body=b)=>inviteRegistration([{id:'user:1',source:'referral',events:es}],rs,as,body,asOf,{effectiveFrom:0,...opts})
test('referral entry plus independent code owner and database new account confirms registration, without frontend binding events',()=>{
 const r=run();assert.deepEqual(r.payload.steps.map(s=>s.users),[1,1,1,1,1]);assert.equal(r.payload.records[0].state,'registered');assert.deepEqual(r.lists['invite:registration:registered'],['user:1']);assert(!JSON.stringify(r).includes(key))
})
test('existing account never counts as new even when binding and code match',()=>{
 const r=run(events(),[relation],[{...accounts[0],created_at:500},accounts[1]]).payload
 assert.equal(r.records[0].state,'existing_account');assert.equal(r.success_users,0)
 const es=events();es.push(event('login_succeeded',4001,{login_type:'manual',is_new_user:true},'1'))
 assert.equal(run(es,[relation],[{...accounts[0],created_at:500},accounts[1]]).payload.records[0].state,'time_conflict')
})
test('independent owner mismatch fails even if relation saved code matches entry',()=>{
 const r=run(events(),[{...relation,inviter:'3',referral_key:key}],accounts).payload
 assert.equal(r.records[0].state,'inviter_mismatch');assert.equal(r.success_users,0)
})
test('missing relations wait for write and fact failures remain unavailable',()=>{
 assert.equal(run(events(),[]).payload.records[0].state,'binding_pending')
 const r=run(events(),[],[],{registrationAvailable:false}).payload
 assert.equal(r.records[0].state,'facts_unavailable');assert.equal(r.success_rate,null)
})
test('missing, ambiguous, unresolved codes and self invite cannot succeed',()=>{
 const es=events();es[0].referral_key=null;assert.equal(run(es).payload.records[0].state,'code_missing')
 assert.equal(run(events(),[relation],[...accounts,{id:'3',created_at:0,code_key:key}]).payload.records[0].state,'code_ambiguous')
 assert.equal(run(events(),[relation],[accounts[0]]).payload.records[0].state,'code_unresolved')
 assert.equal(run(events(),[relation],[{...accounts[0],code_key:key}]).payload.records[0].state,'self_invite')
})
test('no new flow or version fields are required; past entries and automatic restores do not count',()=>{
 const es=events();for(const e of es){delete e.properties.invite_verification_version;delete e.properties.invite_flow_id}assert.equal(run(es).payload.success_users,1);assert.equal(run(es,[relation],accounts,{effectiveFrom:2500}).payload.entries,0)
 const auto=events();auto[1]=event('login_succeeded',4000,{login_type:'auto_restore'},'1');assert.equal(run(auto).payload.records[0].state,'login_pending')
})
test('late, future or cross-identity login and invalid relation times never confirm',()=>{
 for(const change of [{t:3602000},{t:asOf+1},{actor_user_id:'9'}]){const es=events();Object.assign(es[1],change);assert.equal(run(es).payload.success_users,0)}
 for(const bound_at of [1000,2500,3602000])assert.equal(run(events(),[{...relation,bound_at}]).payload.records[0].state,'time_conflict')
 assert.equal(run(events(),[{...relation,has_rebinding:true}]).payload.records[0].state,'relation_changed')
 assert.equal(run(events(),[{...relation,valid:false}]).payload.records[0].state,'relation_invalid')
 assert.equal(run(events(),[relation,{...relation,id:'r2'}]).payload.records[0].state,'relation_conflict')
})
test('multiple flows cannot claim the same registration, even with link filter',()=>{
 const es=events(),second=events().map(e=>({...e,t:e.t+1,session_id:'second',properties:{...e.properties,invite_flow_id:'g',referral_link_id:'other'}}))
 es[0].properties.referral_link_id='selected'
 const r=run([...es,...second],[relation],accounts,{}, {...b,link:'selected'}).payload
 assert.equal(r.records[0].state,'ambiguous');assert.equal(r.success_users,0)
})
test('shared flow actors conflict and unknown account registration time stays pending',()=>{
 const es=events();es.push(event('login_succeeded',4001,{login_type:'manual'},'9'));assert.equal(run(es).payload.records[0].state,'conflict')
 assert.equal(run(events(),[relation],[accounts[1]]).payload.records[0].state,'account_pending')
})
