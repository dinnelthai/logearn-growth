const {test}=require('node:test'),assert=require('node:assert/strict')
const {loginConversion,validateConversion}=require('../src/analytics/loginConversion'),{inviteConversion,verifiedRelations}=require('../src/analytics/inviteConversion')
const b={start:1000,end:100000,hours:24},s={as_of:new Date(2*86400000).toISOString(),snapshot_cutoff:new Date(2*86400000).toISOString()}
const e=(name,t,p={},actor='1')=>({type:({login_succeeded:'login',login_button_clicked:'login_click',chip_analysis_drilldown:'chip'})[name]||name,raw_name:name,t,properties:p,actor_user_id:actor})
const user=(id,events)=>({id:'user:'+id,source:'x',events}),facts=[{id:'rel',invitee:'1',inviter:'2',bound_at:6000,valid:true,account_created_at:500,inviter_exists:true}]
const flow=(id='f',extra={})=>({invite_flow_id:id,referral_link_id:'link',...extra})
function pipeline(id='f'){return [e('invite_link_visited',2000,flow(id),null),e('invite_validation_finished',3000,flow(id,{validation_attempt_id:'v',outcome:'valid',inviter_user_id:'2'}),null),e('login_attempt_finished',4000,flow(id,{login_attempt_id:'l',outcome:'success'})),e('invite_binding_finished',7000,flow(id,{binding_attempt_id:'b',outcome:'bound',relation_id:'rel',inviter_user_id:'2',invitee_user_id:'1'})),e('chip_analysis_drilldown',8000)]}
test('exact invite flow reaches validated, account, authoritative binding and subsequent analysis with correct lists',()=>{
 const r=inviteConversion([user('1',pipeline())],facts,b,s)
 assert.deepEqual(r.payload.steps.map(x=>x.flows),[1,1,1,1,1]);assert.equal(r.payload.binding_rate,1);assert.deepEqual(r.lists['invite:step:bound'],['user:1']);assert.equal(r.payload.records[0].account_evidence,'login_success');assert.equal(r.payload.independent_facts.relations,1)
})
test('frontend binding claim without authoritative relation never enters bound funnel; facts can fail independently',()=>{
 const r=inviteConversion([user('1',pipeline())],[],b,s,{factsAvailable:false,factsError:'unavailable'})
 assert.equal(r.payload.steps[3].available,false);assert.equal(r.payload.steps[3].flows,0);assert.equal(r.payload.binding_rate,null);assert.equal(r.payload.quality.unverified_binding_events,1);assert.equal(r.payload.independent_facts.available,false)
})
test('old relationship, mismatched actor/inviter or self-invite cannot become a new bound flow',()=>{
 for(const bad of [{...facts[0],bound_at:1000},{...facts[0],inviter:'3'},{...facts[0],invitee:'9'},{...facts[0],inviter:'1'}])assert.equal(inviteConversion([user('1',pipeline())],[bad],b,s).payload.steps[3].flows,0)
})
test('already logged-in invite branch does not require a new login; already_bound is not new conversion',()=>{
 const events=pipeline().filter(e=>e.raw_name!=='login_attempt_finished');events[0].actor_user_id='1'
 assert.equal(inviteConversion([user('1',events)],facts,b,s).payload.steps[3].flows,1)
 events.find(e=>e.raw_name==='invite_binding_finished').properties.outcome='already_bound'
 const r=inviteConversion([user('1',events)],facts,b,s).payload;assert.equal(r.steps[3].flows,0);assert.equal(r.states[0].state,'already_bound')
})
test('conflicting validations/bindings and cross-identity shared flow IDs isolate instead of merging users',()=>{
 const events=pipeline();events.push(e('invite_validation_finished',3500,flow('f',{validation_attempt_id:'v',outcome:'invalid'})))
 let r=inviteConversion([user('1',events)],facts,b,s).payload;assert.equal(r.quality.conflicting_flows,1);assert.equal(r.steps[3].flows,0)
 r=inviteConversion([user('1',pipeline()),user('3',[e('invite_link_visited',2000,flow())])],facts,b,s).payload;assert.equal(r.quality.conflicting_flows,2);assert.equal(r.steps[3].flows,0)
})
test('missing flow and orphan results are visible quality; no visit means no fabricated funnel zeroes',()=>{
 const r=inviteConversion([user('1',[e('invite_validation_finished',2000,{outcome:'valid'}),e('invite_binding_finished',4000,flow())])],facts,b,s).payload
 assert.equal(r.quality.missing_flow_events,1);assert.equal(r.quality.orphan_flows,1);assert.equal(r.available,false);assert(r.steps.every(x=>!x.available));assert.equal(r.independent_facts.relations,1)
})
test('invitation window includes cross-period results but excludes late outcomes, preserves unresolved and mature denominators',()=>{
 const events=pipeline();events.find(e=>e.raw_name==='invite_binding_finished').t=120000
 assert.equal(inviteConversion([user('1',events)],facts,b,s).payload.steps[3].flows,1)
 events.find(e=>e.raw_name==='invite_binding_finished').t=2*86400000
 assert.equal(inviteConversion([user('1',events)],facts,b,s).payload.steps[3].flows,0)
 const r=inviteConversion([user('1',[e('invite_link_visited',2000,flow())])],[],b,{snapshot_cutoff:new Date(5000).toISOString()}).payload
 assert.equal(r.pending,1);assert.equal(r.mature_flows,0);assert.equal(r.binding_rate,null)
})
test('link/campaign filters affect flows but do not invent independent relation attribution',()=>{
 const r=inviteConversion([user('1',pipeline())],facts,{...b,link:'other'},s).payload
 assert.equal(r.flow_count,0);assert.equal(r.independent_facts.relations,1);assert.equal(r.independent_facts.ignores_link_and_campaign_filters,true)
})
test('relation proof excludes conflicting first inviters, unmatched accounts and cycles',()=>{
 const rows=[{...facts[0],invitee:'3',inviter:'4',id:'a'},{...facts[0],invitee:'4',inviter:'3',id:'b'},{...facts[0],inviter:'5',id:'c'},facts[0],{...facts[0],invitee:'6',id:'d',inviter_exists:false}]
 const r=verifiedRelations(rows,2*86400000);assert.equal(r.rows.length,0);assert.equal(r.quality.cycles,2);assert.equal(r.quality.conflicts,2);assert.equal(r.quality.invalid,1)
})
test('login keeps clicks and manual/auto/unknown facts separate from attempt denominators',()=>{
 const es=[e('login_button_clicked',2000),e('login_succeeded',3000,{login_type:'auto_restore'}),e('login_succeeded',4000,{login_type:'manual'}),e('login_succeeded',5000,{}),e('login_attempt_started',6000,{login_attempt_id:'a',login_method:'wallet'}),e('login_attempt_finished',7000,{login_attempt_id:'a',login_method:'wallet',outcome:'cancelled',duration_ms:1000})]
 const r=loginConversion([user('1',es)],b,s).payload;assert.equal(r.click_users,1);assert.deepEqual(r.login_breakdown.map(x=>x.users),[1,1,1]);assert.equal(r.login.requests,1);assert.equal(r.login.success_rate,null);assert.equal(r.login.counts.cancelled,1);assert.equal(r.stages.available,false)
})
test('login stage data requires explicit starts, parent attempt and exact stage pairing, even under method filter',()=>{
 const es=[e('login_attempt_started',2000,{login_attempt_id:'a',login_method:'wallet'}),e('login_stage_started',3000,{login_attempt_id:'a',stage_attempt_id:'stage',stage:'signature'}),e('login_stage_finished',4000,{login_attempt_id:'a',stage_attempt_id:'stage',stage:'signature',outcome:'failed',duration_ms:1000}),e('login_stage_finished',5000,{login_attempt_id:'a',stage_attempt_id:'missing',stage:'auth_verify',outcome:'success'})]
 const r=loginConversion([user('1',es)],{...b,method:'wallet'},s).payload;assert.equal(r.stages.rows.length,1);assert.equal(r.stages.rows[0].failed,1);assert.equal(r.stages.rows[0].started,1);assert.equal(r.stages.quality.orphan_stage_finishes,1)
})
test('conversion validator rejects overlong periods, windows and oversized identifiers',()=>{
 assert.throws(()=>validateConversion({...b,end:b.start+32*86400000}));assert.throws(()=>validateConversion({...b,hours:12}));assert.throws(()=>validateConversion({...b,inviter:'a'.repeat(129)}));validateConversion(b)
})

test('explicit binding failure remains an observed failure instead of pending or a successful relation',()=>{
 const es=pipeline();es.find(e=>e.raw_name==='invite_binding_finished').properties={...flow(),binding_attempt_id:'b',outcome:'failed',reason_code:'binding_unavailable'}
 const r=inviteConversion([user('1',es)],[],b,s).payload;assert.equal(r.states[0].state,'binding_failed');assert.equal(r.errors[0].reason,'binding_unavailable');assert.equal(r.steps[3].flows,0)
})
test('record status filters apply before the hundred-row cap, not to a truncated subset',()=>{
 const es=Array.from({length:200},(_,i)=>[e('login_attempt_started',2000+i*10,{login_attempt_id:'a'+i,login_method:'wallet'}),e('login_attempt_finished',2005+i*10,{login_attempt_id:'a'+i,outcome:i<150?'failed':'success',duration_ms:5})]).flat()
 const r=loginConversion([user('1',es)],{...b,status:'failed'},s).payload;assert.equal(r.login.requests,200);assert.equal(r.record_total,150);assert.equal(r.records.length,100);assert.equal(r.records_limited,true);assert(r.records.every(r=>r.state==='failed'))
})

test('server binding during authentication can precede the client success callback without becoming a false failure',()=>{
 const es=pipeline();es.find(e=>e.raw_name==='invite_binding_finished').t=3600
 const r=inviteConversion([user('1',es)],[{...facts[0],bound_at:3500}],b,s).payload
 assert.equal(r.steps[2].flows,1);assert.equal(r.steps[3].flows,1);assert.equal(r.quality.unverified_binding_events,0)
})
test('grouped invitation dimensions and reasons preserve counts, list IDs and encounter order',()=>{
 const users=[0,1,2].map(i=>user(String(i),[
  e('invite_link_visited',2000,flow('f'+i,{referral_link_id:i===1?'other':'shared',campaign_id:i===1?'b':'a'}),null),
  e('invite_validation_finished',3000,flow('f'+i,{referral_link_id:i===1?'other':'shared',outcome:'failed',reason_code:i===1?'second':'first'}),null)
 ]))
 const r=inviteConversion(users,[],b,s)
 assert.deepEqual(r.payload.dimensions.link.map(d=>[d.value,d.flows,d.list_key]),[['shared',2,'invite:link:0'],['other',1,'invite:link:1']])
 assert.deepEqual(r.lists['invite:link:0'],['user:0','user:2'])
 assert.deepEqual(r.payload.errors.map(e=>[e.reason,e.flows,e.list_key]),[['first',2,'invite:reason:0'],['second',1,'invite:reason:1']])
 assert.deepEqual(r.lists['invite:reason:0'],['user:0','user:2'])
})
