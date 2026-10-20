const {test}=require('node:test'),assert=require('node:assert/strict')
const remote=require('../src/data/hologres')
test('path loader projects safe diagnostic properties, preserves origin context and keeps diagnostics out of business paths',async()=>{
 const query=remote.query;let sql,params
 remote.query=async(s,p)=>{sql=s;params=p;return [{user_key:'user:one',event_id:'e',event_name:'analysis_request_finished',client_ts:2000,session_id:'s',source:'x',device:'desktop',app_version:'v1',page:'/new',properties:{analysis_request_id:'r',outcome:'success',page_path:'/old',page_visit_id:'origin',chain:'3',viewport_width:1400,diagnostics_version:'2026-10-16.v1'}},{user_key:'user:one',event_id:'p',event_name:'page_engaged',client_ts:3000,session_id:'s',properties:{page_path:'/old',page_visit_id:'origin',visible_duration_ms:10000}}]}
 try{const users=await require('../src/data/behaviorPaths').pathUsers({snapshot_cutoff:'2026-10-16T00:00:00Z',as_of:'2026-10-16T00:00:00Z'},{start:0,end:10000});assert.equal(users[0].events[0].page_url,'/old');assert.equal(users[0].events[0].diagnostic,true);assert.equal(users[0].events[0].properties.analysis_request_id,'r');assert.equal(users[0].events[1].type,'page_engaged');assert.equal(users[0].events[1].duration_ms,10000);assert(sql.includes('jsonb_strip_nulls'));assert(!sql.includes("e.properties->'wallet_address'"));assert(params[6].includes('login_attempt_finished'));assert(params[6].includes('page_content_load_finished'))}finally{remote.query=query}
})
test('dedicated value query keeps complete relevant history and original first-seen evidence without page heartbeat payloads',async()=>{
 const original=remote.query;let names
 try{remote.query=async(sql,params)=>{names=params[6];assert(sql.includes('first_observed AS'));assert(!sql.includes('e.client_ts>=$2 AND e.event_name'));return [{user_key:'user:1',first_seen_at:'1',event_id:'r',event_name:'analysis_requested',client_ts:1000,properties:{analysis_request_id:'r',trigger:'user_action'}}]}
 const users=await require('../src/data/behaviorPaths').pathUsers({snapshot_cutoff:'2026-10-18T00:00:00Z',as_of:'2026-10-18T00:00:00Z'},{start:500,end:2000},null,{valueOnly:true})
 assert.equal(users[0].first_seen_at,1);assert(names.includes('analysis_requested'));assert(names.includes('analysis_request_finished'));assert(names.includes('page_viewed'));assert(!names.includes('page_engaged'));assert(!names.includes('strategy_started'))
 const result=require('../src/analytics/requestDiagnostics').requestDiagnostics(users,{start:500,end:2000,asOf:2000})
 assert.equal(result.analysis_rows[0].user_stage,'此前已观测')
 }finally{remote.query=original}
})
test('loss query preserves actual authenticated-page evidence and excludes unrelated diagnostic load/exposure payloads',async()=>{
 const old=remote.query;let names
 try{remote.query=async(sql,params)=>{names=params[6];assert(sql.includes("NULLIF(BTRIM(e.user_id),'') IS NOT NULL AS logged_in"));return [{user_key:'user:1',event_id:'p',event_name:'page_viewed',client_ts:100,logged_in:true,properties:{}}]}
 const users=await require('../src/data/behaviorPaths').pathUsers({snapshot_cutoff:'2026-10-19T00:00:00Z',as_of:'2026-10-19T00:00:00Z'},{start:0,end:1000},null,{lossOnly:true})
 assert.equal(users[0].events[0].logged_in,true);assert(names.includes('chip_analysis_drilldown'));assert(names.includes('login_succeeded'));assert(names.includes('analysis_request_finished'));assert(!names.includes('page_content_load_started'));assert(!names.includes('token_card_exposed'))
 }finally{remote.query=old}
})
