const test=require('node:test'),assert=require('node:assert/strict')
const {pathInsights}=require('../src/analytics/pathInsights')
test('graph terminal page diagnosis retains exact selected sessions, excludes other visits by the same user',()=>{
 const event=(type,t,session_id,page_url)=>({type,t,session_id,page_url,device:'desktop',ua:'Mozilla Windows Chrome/156.0'})
 const users=[{id:'a',source:'direct',events:[event('app_open',100,'one','/'),event('token',200,'two','/cn/solana/tokens/A'),event('chip',300,'two','/cn/solana/tokens/A')]},{id:'b',source:'direct',events:[event('app_open',100,'three','/cn/signals')]}]
 const r=pathInsights(users,{start:0,end:1000},{as_of:new Date(2000000).toISOString()})
 const d=r.payload.path_diagnostics['graph:link:0:app_open>1:end']
 assert.equal(d.sessions,2);assert.equal(d.users,2);assert.deepEqual(d.pages.map(p=>p.url).sort(),['/','/cn/signals']);assert.equal(d.pages[0].dimensions.browser[0].label,'Chrome 156')
 assert.equal(r.payload.path_diagnostics['terminal:end'].sessions,3)
})

test('repeated token browse runs collapse before depth cutoff, analysis starts a new run',()=>{
 const {computePaths}=require('../src/analytics/paths')
 const types=['token_click','token','token_click','token','chip','token_click','token','chip_drilldown']
 const events=types.map((type,i)=>({type,t:100+i,session_id:'a'}))
 const r=computePaths([{id:'a',events}],{startAt:0,endAt:1000,asOf:2000000,maxSteps:8,includeDiagnosticSessions:true})
 assert.deepEqual(r.paths[0].types,['token_click','token','chip','token_click','token','chip_drilldown'])
 assert.equal(r.paths[0].terminal,'end');assert.equal(r.diagnostic_sessions[0].observedEvents.length,8)
})

test('stop action includes drilldown, ends at first match, diagnoses the stopping page',()=>{
 const e=(type,t,page_url)=>({type,t,page_url,session_id:'s'})
 const users=[{id:'a',events:[e('token',100,'/'),e('chip_drilldown',200,'/cn/solana/tokens/A'),e('trade',300,'/cn/portfolio')]}]
 const r=pathInsights(users,{start:0,end:1000,path_stop:'chip'},{as_of:new Date(2000000).toISOString()})
 assert.deepEqual(r.payload.paths[0].types,['token','chip_drilldown']);assert.equal(r.payload.paths[0].terminal,'reached')
 assert.equal(r.payload.terminals.reached.users,1);assert.equal(r.payload.terminals.end.users,0)
 assert.equal(r.payload.path_diagnostics['terminal:reached'].pages[0].url,'Token 详情页')
})
