const {test}=require('node:test'),assert=require('node:assert/strict')
const {homeBounce}=require('../src/analytics/homeBounce'),{requestDiagnostics}=require('../src/analytics/requestDiagnostics'),{valueDiagnostics}=require('../src/analytics/valueDiagnostics'),{pageVisits}=require('../src/analytics/pageVisits')
const O={start:1000,end:100000,asOf:3000000},e=(type,t,props={},extra={})=>({type,raw_name:type,t,session_id:'s',properties:props,...extra}),home=(t=2000,id='p')=>e('page_view',t,{}, {page_visit_id:id,page_url:'/cn',view_mode:'page'}),u=(id,events)=>({id,source:'x',events})
test('home bounce separates short explicit ends, engaged, pending and unknown; missing is never zero',()=>{
 const users=[u('short',[home(),e('page_end',3000,{}, {page_visit_id:'p',end_reason:'unmount',duration_ms:0})]),u('engaged',[home(),e('page_engaged',12000,{}, {page_visit_id:'p',duration_ms:10000})]),u('unknown',[home(),e('page_end',5000,{}, {page_visit_id:'p',end_reason:'pagehide',duration_ms:2000})]),u('pending',[home(),e('page_end',2900000,{}, {page_visit_id:'p',end_reason:'hidden',duration_ms:1000})])]
 const r=homeBounce(users,O);assert.equal(r.payload.bounced,1);assert.equal(r.payload.engaged,1);assert.equal(r.payload.unknown,1);assert.equal(r.payload.pending,1);assert.equal(r.payload.bounce_rate,.5);assert.deepEqual(r.lists['bounce:bounced'],['short']);assert.equal(r.payload.dimensions.source[0].denominator,2)
})
test('homepage uses exact pathname and page mode; automatic login does not engage',()=>{
 const users=[u('signals',[{...home(),page_url:'/cn/signals'}]),u('float',[{...home(),view_mode:'float'}]),u('restore',[home(),e('login',3000,{}, {login_type:'auto_restore'})]),u('manual',[home(),e('login',3000,{}, {login_type:'manual'})]),u('missingid',[{...home(),page_visit_id:null}])]
 const r=homeBounce(users,O).payload;assert.equal(r.sessions,3);assert.equal(r.unknown,2);assert.equal(r.engaged,1)
})
test('same tab idle segmentation aligns first screen and bounce, does not create sessions from checkpoints',()=>{
 const users=[u('a',[home(),e('page_engaged',12000,{}, {page_visit_id:'p',duration_ms:10000}),home(1900000,'second'),e('page_end',1905000,{}, {page_visit_id:'second',duration_ms:2000,end_reason:'unmount'})])]
 const b=homeBounce(users,{...O,end:2000000,asOf:5000000}).payload,p=pageVisits(users,{...O,end:2000000,asOf:5000000}).payload
 assert.equal(p.sessions,2);assert.equal(b.sessions,2);assert.equal(p.first_screen.average_duration_ms,6000);assert.equal(b.bounced,1)
})
test('page_engaged supplies first screen duration without an end snapshot',()=>{
 const r=pageVisits([u('a',[home(),e('page_engaged',12000,{}, {page_visit_id:'p',duration_ms:10001})])],O).payload
 assert.equal(r.first_screen.duration_sessions,1);assert.equal(r.first_screen.average_duration_ms,10001);assert.equal(r.records.length,1)
})
const start=(id,t=2000,extra={})=>e('analysis_requested',t,{analysis_request_id:id,token_address:'TokenABC',chain:'3',trigger:'user_action',...extra},{diagnostic:true})
const end=(id,state,t=3000,extra={})=>e('analysis_request_finished',t,{analysis_request_id:id,outcome:state,duration_ms:100,token_address:'TokenABC',chain:'3',...extra},{diagnostic:true})
test('analysis diagnostics uses attempt cohorts, excludes cancelled/unknown, does not fabricate terminal failures',()=>{
 const users=[u('a',[start('a'),end('a','success',200000,{cache_hit:true})]),u('b',[start('b'),end('b','empty')]),u('c',[start('c'),end('c','failed',3000,{error_code:'network_error',error_stage:'network'})]),u('d',[start('d'),end('d','cancelled',3000,{cancel_reason:'token_changed'})]),u('missing',[start('m')])]
 const r=requestDiagnostics(users,O);const a=r.payload.families.analysis
 assert.equal(a.requests,5);assert.equal(a.counts.success,1);assert.equal(a.success_rate,1/3);assert.equal(a.counts.unknown,1);assert.equal(a.cancelled_while_waiting,1);assert.equal(a.terminal_coverage,.8);assert.equal(a.latency.find(x=>x.state==='success').median_ms,100);assert.deepEqual(r.lists['diagnostic:analysis:failed'],['c']);assert.equal(a.errors[0].code,'network_error')
})
test('attempt IDs scoped by identity; duplicate outcomes collapse, inconsistent states/chain isolate',()=>{
 const users=[u('a',[start('same'),end('same','success'),end('same','success',4000)]),u('b',[start('same'),end('same','failed')]),u('c',[start('x'),end('x','success'),end('x','empty')]),u('d',[start('y'),end('y','success',4000,{chain:'56'})])]
 const a=requestDiagnostics(users,O).payload.families.analysis;assert.equal(a.requests,4);assert.equal(a.counts.success,1);assert.equal(a.counts.failed,1);assert.equal(a.quality.conflicts,2)
})
test('finish-only, invalid outcome, invalid duration and future results remain quality/unknown',()=>{
 const r=requestDiagnostics([u('a',[end('orphan','success'),start('bad'),end('bad','invented'),start('negative'),end('negative','success',4000,{duration_ms:-1}),start('future'),end('future','failed',4000000),e('analysis_requested',3000,{})])],O).payload.families.analysis
 assert.equal(r.quality.orphan_terminals,1);assert.equal(r.quality.missing_id_events,1);assert.equal(r.counts.unknown,2);assert.equal(r.latency[0].samples,0)
})
test('unsupported diagnostic families are unavailable instead of zero usage',()=>{
 const r=requestDiagnostics([u('a',[home()])],O).payload
 assert.equal(r.families.analysis.available,false);assert.equal(r.families.login.available,false);assert.equal(r.families.page_load.available,false)
})
test('login and page load attempts support ready, missing page binding and distinct load types',()=>{
 const users=[u('a',[e('login_attempt_started',2000,{login_attempt_id:'l'}),e('login_attempt_finished',3000,{login_attempt_id:'l',outcome:'cancelled',duration_ms:10}),e('page_content_load_started',4000,{page_load_id:'p',load_type:'spa'}),e('page_content_load_finished',5000,{page_load_id:'p',load_type:'spa',outcome:'ready',duration_ms:123,page_visit_id:'pv'})])]
 const d=requestDiagnostics(users,O).payload.families;assert.equal(d.login.counts.cancelled,1);assert.equal(d.page_load.counts.ready,1);assert.equal(d.page_load.success_rate,1);assert.equal(d.page_load.dimensions.load_type[0].value,'spa')
})
test('card click attribution requires same identity, page, exposure and ordering, capped at one click per exposure',()=>{
 const expose=e('token_card_exposed',2000,{item_exposure_id:'x',page_visit_id:'p',list_type:'signals',entry_module:'signals'}),click=e('token_click',3000,{item_exposure_id:'x',page_visit_id:'p'})
 const d=valueDiagnostics([u('a',[expose,click,{...click,t:4000},e('token_click',5000,{item_exposure_id:'x',page_visit_id:'other'})]),u('b',[click])],O).payload.exposure
 assert.equal(d.exposures,1);assert.equal(d.clicked,1);assert.equal(d.rate,1);assert.equal(d.unmatched_clicks,2)
})
test('first observed value uses mature 24h cohorts and excludes automatic analysis and conflicting outcomes',()=>{
 const DAY=86400000,options={start:1000,end:DAY,asOf:2*DAY},users=[u('ok',[home(),start('x'),end('x','success',5000)]),u('automatic',[home(),start('y',2500,{trigger:'initial_load'}),end('y','success',6000)]),u('conflict',[home(),start('z'),end('z','success'),end('z','failed')]),u('late',[home(),start('later',DAY),end('later','success',DAY+5000)])]
 const d=valueDiagnostics(users,options).payload.first_value;assert.equal(d.entered,4);assert.equal(d.converted,1);assert.equal(d.eligible,4);assert.equal(d.rate,.25);assert.equal(d.median_ms,3000)
})
test('immature converted users remain outside mature conversion denominator',()=>{
 const d=valueDiagnostics([u('a',[home(),start('x'),end('x','success')])],O).payload.first_value
 assert.equal(d.pending,1);assert.equal(d.eligible,0);assert.equal(d.rate,null)
})

test('entrance conversion requires exact visit/token/chain and strictly increasing detail/completion times',()=>{
 const click=(id,t)=>e('token_click',t,{token_visit_id:id,token_address:'TokenABC',chain:'3',list_type:'signals',entry_module:'signals'})
 const detail=(id,t)=>e('token',t,{token_visit_id:id,token_address:'TokenABC',chain:'3'})
 const users=[u('a',[click('v',2000),detail('v',3000),start('r',4000,{token_visit_id:'v'}),end('r','success',5000)]),u('b',[click('other',2000),detail('other',3000),start('bad',2500,{token_visit_id:'other'}),end('bad','success',3000)])]
 const d=valueDiagnostics(users,O).payload.entrance.rows[0]
 assert.equal(d.visits,2);assert.equal(d.details,2);assert.equal(d.successes,1);assert.equal(d.rate,.5)
})
test('new successful-analysis retention uses mature UTC+7 target days and leaves D7 pending',()=>{
 const DAY=86400000,first=10800000,users=[u('a',[start('first',first),end('first','success',first+1000),start('return',first+DAY),end('return','success',first+DAY+1000)])]
 const d=valueDiagnostics(users,{start:0,end:DAY,asOf:3*DAY}).payload.retention
 assert.deepEqual(d[0],{day:1,eligible:1,returned:1,rate:1,pending:0});assert.equal(d[1].eligible,0);assert.equal(d[1].pending,1);assert.equal(d[1].rate,null)
})
