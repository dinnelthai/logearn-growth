const {test}=require('node:test'),assert=require('node:assert/strict'),remote=require('../src/data/hologres')
test('conversion loader keeps exact flow/stage IDs, original actor and an explicitly empty audience',async()=>{
 const saved=remote.query;let sql,params;remote.query=async(s,p)=>{sql=s;params=p;return [{user_key:'user:1',user_id:null,anonymous_id:'anon',event_id:'e',event_name:'invite_link_visited',client_ts:2000,properties:{invite_flow_id:'flow',referral_link_id:'link'}}]}
 try{const r=await require('../src/data/conversionFacts').conversionUsers({snapshot_cutoff:'2026-10-16T00:00:00Z'},{start:0,end:10000},[]);assert.deepEqual(params[5],[]);assert.equal(r[0].events[0].actor_user_id,null);assert.equal(r[0].events[0].properties.invite_flow_id,'flow');assert(sql.includes("'stage_attempt_id'"));assert(!sql.includes("'invite_code'"));assert(params[6].includes('invite_binding_finished'))}finally{remote.query=saved}
})
test('relation loader uses registered account evidence and snapshot cutoffs, not event claims',async()=>{
 const saved=remote.query;let sql;remote.query=async s=>{sql=s;return [{id:1,user_id:2,level1_user_id:3,invitation_time:'2026-10-15T00:00:00Z',account_created_at:'2026-10-14T00:00:00Z',is_valid:true,inviter_exists:true}]}
 try{const r=await require('../src/data/conversionFacts').invitationRelations({snapshot_cutoff:'2026-10-16T00:00:00Z'});assert.equal(r[0].invitee,'2');assert.equal(r[0].valid,true);assert.equal(r[0].inviter_exists,true);assert(sql.includes('public.account_v2'));assert(sql.includes('r.created_time<=$1'))}finally{remote.query=saved}
})
test('historical landing codes become private comparison keys; raw URLs and codes do not enter job events',async()=>{
 const saved=remote.query;let params
 remote.query=async(s,p)=>{params=p;return [{user_key:'user:1',event_id:'e',event_name:'first_visit_captured',client_ts:2000,properties:{first_landing_url:'https://logearn.com/cn?referral=private-code'}}]}
 try{const r=await require('../src/data/conversionFacts').conversionUsers({snapshot_cutoff:'2026-10-17T00:00:00Z'},{start:0,end:10000});assert.equal(r[0].events[0].referral_key,require('../src/analytics/inviteAssociation').referralKey('private-code'));assert(!JSON.stringify(r).includes('private-code'));assert(params[6].includes('page_viewed'));assert(params[6].includes('first_visit_captured'))}finally{remote.query=saved}
})
test('versioned web digest survives loading while raw digest is removed from display properties',async()=>{
 const saved=remote.query,key=require('../src/analytics/inviteAssociation').referralKey('known-code');let sql
 remote.query=async s=>{sql=s;return [{user_key:'user:1',user_id:null,event_name:'invite_link_visited',client_ts:2000,properties:{invite_flow_id:'f',invite_verification_version:'registration-v1',referral_code_sha256:key,is_new_user:true}}]}
 try{const [u]=await require('../src/data/conversionFacts').conversionUsers({snapshot_cutoff:'2026-10-17T00:00:00Z'},{start:0,end:10000});assert.equal(u.events[0].referral_key,key);assert.equal(u.events[0].properties.referral_code_sha256,undefined);assert.equal(u.events[0].properties.is_new_user,true);assert(sql.includes("'referral'"));assert(sql.includes("'referral_code_sha256'"))}finally{remote.query=saved}
})
test('independent account lookup hashes codes and retains database registration timestamps',async()=>{
 const saved=remote.query;let sql,params;remote.query=async(s,p)=>{sql=s;params=p;return [{account_id:2,invite_code:'known-code',created_at:'2026-10-16T00:00:00Z'}]}
 try{const rows=await require('../src/data/conversionFacts').registrationAccounts({snapshot_cutoff:'2026-10-17T00:00:00Z'});assert.equal(rows[0].id,'2');assert.equal(rows[0].code_key,require('../src/analytics/inviteAssociation').referralKey('known-code'));assert.equal(rows[0].created_at,Date.parse('2026-10-16T00:00:00Z'));assert(!JSON.stringify(rows).includes('known-code'));assert(sql.includes('created_at<=$1'));assert(!sql.includes('user_invitation_relation'));assert.deepEqual(params,['2026-10-17T00:00:00Z'])}finally{remote.query=saved}
})
test('loaded web entry reaches database registration verification without frontend validation/binding claims',async()=>{
 const saved=remote.query,{conversionUsers,registrationAccounts,invitationRelations}=require('../src/data/conversionFacts'),key=require('../src/analytics/inviteAssociation').referralKey('known-code')
 remote.query=async sql=>{
  if(sql.includes('WITH ranked'))return [{user_key:'user:1',session_id:'s',anonymous_id:'a',event_id:'entry',event_name:'invite_link_visited',client_ts:2000,properties:{invite_flow_id:'f',invite_verification_version:'registration-v1',referral_code_sha256:key}},{user_key:'user:1',user_id:'1',session_id:'s',anonymous_id:'a',event_id:'login',event_name:'login_attempt_finished',client_ts:4000,properties:{invite_flow_id:'f',outcome:'success'}}]
  if(sql.includes('SELECT account_id,invite_code'))return [{account_id:1,created_at:new Date(3000).toISOString(),invite_code:'own-code'},{account_id:2,created_at:new Date(0).toISOString(),invite_code:'known-code'}]
  return [{id:1,user_id:1,level1_user_id:2,invitation_time:new Date(3500).toISOString(),account_created_at:new Date(3000).toISOString(),is_valid:true,inviter_exists:true}]
 }
 try{const s={snapshot_cutoff:new Date(4000000).toISOString()},b={start:1000,end:10000,hours:1},users=await conversionUsers(s,b),relations=await invitationRelations(s),accounts=await registrationAccounts(s),r=require('../src/analytics/inviteConversion').inviteConversion(users,relations,b,s,{registrationAccounts:accounts,registrationAvailable:true,registrationEffectiveFrom:0});assert.equal(r.payload.registration.success_users,1);assert.equal(r.payload.registration.records[0].state,'registered');assert.deepEqual(r.lists['invite:registration:registered'],['user:1']);assert(!JSON.stringify(r).includes(key));assert(!JSON.stringify(r).includes('known-code'))}finally{remote.query=saved}
})

test('existing referral property can be used directly without any new web fields',async()=>{
 const saved=remote.query;remote.query=async()=>[{user_key:'user:1',event_name:'page_viewed',client_ts:2000,properties:{referral:'existing-code'},session_id:'s',anonymous_id:'a'}]
 try{const [u]=await require('../src/data/conversionFacts').conversionUsers({snapshot_cutoff:'2026-10-17T00:00:00Z'},{start:0,end:10000});assert.equal(u.events[0].referral_key,require('../src/analytics/inviteAssociation').referralKey('existing-code'));assert(!JSON.stringify(u).includes('existing-code'))}finally{remote.query=saved}
})
