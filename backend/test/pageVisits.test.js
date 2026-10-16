const {test}=require('node:test'),assert=require('node:assert/strict')
const {pageVisits,safePage}=require('../src/analytics/pageVisits')
const opts={start:1000,end:3000000,asOf:5000000}
const e=(type,t,extra={})=>({type,t,session_id:'s',...extra})
test('device diagnosis separates context leads, explicit idle and pending with exact user lists',()=>{
 const r=pageVisits([{id:'a',events:[e('app_open',2000,{page_url:'/',device:'mobile',ua:'Mozilla Android Chrome/123.0 Mobile'})]},{id:'b',events:[e('page_view',2000,{page_url:'/',device:'desktop',ua:'Mozilla Windows Chrome/124.0'})]},{id:'c',events:[e('app_open',2999000,{page_url:'/',device:'mobile'})]}],{...opts,asOf:3000000})
 const rows=r.payload.entries[0].device_breakdown.device,mobile=rows.find(r=>r.label==='手机'),desktop=rows.find(r=>r.label==='桌面')
 assert.equal(mobile.context_users,1);assert.equal(mobile.pending_users,1);assert.equal(mobile.mature_users,1);assert.equal(mobile.idle_rate,null);assert.equal(desktop.idle_rate,1);assert.deepEqual(r.lists[mobile.list_key+':context'],['a']);assert.equal(r.members.a.browser,'Chrome')
})
test('wallet detail grouping crosses chains and languages without merging token details',()=>{
 const r=pageVisits([{id:'a',events:[e('page_view',2000,{page_url:'/cn/bsc/address/0x123',session_id:'one'}),e('page_view',3000,{page_url:'/en/robinhood/address/0x456',session_id:'two'})]},{id:'b',events:[e('token',2000,{page_url:'/cn/bsc/tokens/0x123'})]}],opts)
 const wallet=r.payload.entries.find(r=>r.url==='钱包地址详情页');assert.equal(wallet.sessions,2);assert.equal(wallet.users,1);assert.deepEqual(r.lists[wallet.list_key],['a']);assert.equal(r.payload.entries.length,2);assert(r.payload.records.some(r=>r.url==='/cn/bsc/address/0x123'))
})
test('token entry pages group across addresses and chains, deduplicate users and preserve raw visits',()=>{
 const r=pageVisits([{id:'a',events:[e('token',2000,{page_url:'/cn/solana/tokens/ABC',session_id:'one'}),e('token',3000,{page_url:'/cn/bsc/tokens/0x123',session_id:'two'}),e('chip',4000,{session_id:'two'})]},{id:'b',events:[e('token',2000,{page_url:'https://logearn.com/en/solana/tokens/XYZ',session_id:'three'})]}],opts)
 assert.equal(r.payload.entries.length,1);assert.equal(r.payload.entries[0].url,'Token 详情页');assert.equal(r.payload.entries[0].sessions,3);assert.equal(r.payload.entries[0].users,2);assert.equal(r.payload.entries[0].analysis_users,1);assert.deepEqual(r.lists[r.payload.entries[0].list_key],['a','b']);assert(r.payload.records.some(r=>r.url==='/cn/solana/tokens/ABC'))
})
test('token list and unrelated URLs are not merged into token details',()=>{
 const {entryPage}=require('../src/analytics/pageVisits')
 for(const path of ['/cn/solana/tokens','/cn/signals','/cn/solana/tokens/ABC/history'])assert.equal(entryPage(path),path)
})
test('sanitize URL credentials, queries and fragments',()=>{assert.equal(safePage('https://name:secret@x.test/a?key=secret#private'),'https://x.test/a');assert.equal(safePage('/en/signals?a=1'),'/en/signals');assert.equal(safePage('javascript:alert(1)'),null)})
test('single page with passive token rendering is an operational lead; chip is not',()=>{const r=pageVisits([{id:'anonymous:a',events:[e('page_view',2000,{page_url:'/token'}),e('token',3000)]},{id:'user:b',events:[e('page_view',2000,{page_url:'/token'}),e('chip',3000)]}],opts);assert.equal(r.payload.single_users,1);assert.equal(r.payload.token_no_analysis_users,1);assert.equal(r.payload.entries[0].analysis_users,1)})
test('only actual visible duration checkpoints are used and max avoids double counting',()=>{const r=pageVisits([{id:'a',events:[e('page_view',2000,{page_url:'/a',page_visit_id:'p'}),e('page_end',3000,{page_visit_id:'p',duration_ms:100}),e('page_end',4000,{page_visit_id:'p',duration_ms:200})]}],opts);assert.equal(r.payload.records[0].duration_ms,200);assert.equal(r.payload.single_users,1);assert.equal(r.payload.sessions,1)})
test('recent or window-boundary sessions are not declared single-page idle',()=>{for(const events of [[e('page_view',2900000,{page_url:'/a'})],[e('page_view',2000,{page_url:'/a'}),e('chip',3100000)]]){const r=pageVisits([{id:'a',events}],{...opts,asOf:3000000});assert.equal(r.payload.single_users,0)}})
test('missing URL is coverage gap, never classified idle',()=>{const r=pageVisits([{id:'a',events:[e('token',2000)]}],opts);assert.equal(r.payload.missing_sessions,1);assert.equal(r.payload.sessions,0)})
test('first observed session outside period excluded; missing sessions split at thirty minutes',()=>{const r=pageVisits([{id:'a',events:[e('page_view',0,{page_url:'/old',session_id:null}),e('page_view',1800001,{page_url:'/new',session_id:null})]}],opts);assert.equal(r.payload.sessions,1);assert.equal(r.payload.entries[0].url,'/new')})

test('drilldown alone qualifies as effective analysis',()=>{const r=pageVisits([{id:'a',events:[e('page_view',2000,{page_url:'/a'}),e('chip_drilldown',3000)]}],opts);assert.equal(r.payload.entries[0].analysis_users,1);assert.equal(r.payload.token_no_analysis_users,0)})
test('existing event page context produces URL records without claiming a single-page visit',()=>{const r=pageVisits([{id:'a',events:[e('app_open',2000,{page_url:'/cn'}),e('token',3000,{page_url:'/cn/token'}),e('token',4000,{page_url:'/cn/token'})]}],opts);assert.equal(r.payload.sessions,1);assert.equal(r.payload.context_sessions,1);assert.equal(r.payload.records.length,2);assert.equal(r.payload.records[0].record_source,'业务事件所在页面');assert.equal(r.payload.single_users,0)})
test('automatic login restore remains passive while manual login counts as interaction',()=>{
 const users=['auto_restore','manual'].map((login_type,i)=>({id:String(i),events:[e('page_view',2000,{page_url:'/cn/signals'}),e('login',3000,{login_type})]}))
 const r=pageVisits(users,opts);assert.deepEqual(r.lists['url:single'],['0'])
})
test('PR26 float visits preserve context and use per-visit maximum duration within snapshot',()=>{
 const r=pageVisits([{id:'a',events:[e('page_view',2000,{page_url:'/cn/signals',page_visit_id:'host',view_mode:'page',viewport_width:1400,viewport_height:900}),e('page_view',3000,{page_url:'/cn/solana/tokens/ABC',page_visit_id:'float',view_mode:'float',page_name:'token_detail',previous_page_visit_id:'host',previous_page_path:'/cn/signals',navigation_source:'internal_click',viewport_width:800,viewport_height:600}),e('page_end',4000,{page_visit_id:'float',duration_ms:100}),e('page_end',4500,{page_visit_id:'float',duration_ms:200}),e('page_end',6000000,{page_visit_id:'float',duration_ms:900})]}],opts)
 const visit=r.payload.records.find(r=>r.page_visit_id==='float');assert.equal(visit.duration_ms,200);assert.equal(visit.view_mode,'float');assert.equal(visit.previous_page_visit_id,'host');assert.equal(visit.viewport_width,800);assert.equal(r.payload.records.find(r=>r.page_visit_id==='host').duration_ms,null)
})
test('visit dimensions use full records before detail cap and exclude business context',()=>{
 const events=Array.from({length:1002},(_,i)=>e('page_view',2000+i,{page_url:'/cn/signals',page_visit_id:'p'+i,view_mode:i%2?'float':'page',navigation_source:'internal_click',viewport_width:400,viewport_height:800}))
 const r=pageVisits([{id:'a',events},{id:'context',events:[e('token',2000,{page_url:'/cn/signals'})]}],opts).payload
 assert.equal(r.records.length,1000);assert.equal(r.records_truncated,true)
 assert.equal(r.visit_dimensions.view_mode.reduce((n,x)=>n+x.visits,0),1002)
 assert.equal(r.visit_dimensions.viewport[0].value,'narrow');assert.equal(r.visit_dimensions.viewport[0].users,1);assert.equal(r.visit_dimensions.viewport[0].average_duration_ms,null)
})
