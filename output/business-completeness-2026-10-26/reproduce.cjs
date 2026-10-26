const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),web=path.resolve(root,'../logearn-web-growth-instrumentation'),ts=require(path.join(web,'node_modules/typescript')),dir=path.join(web,'src/plugins/logearn_growth')
const {productChain}=require(path.join(root,'backend/src/analytics/productChain')),{requestDiagnostics}=require(path.join(root,'backend/src/analytics/requestDiagnostics')),{decodePathRows,PATH_PROPERTY_KEYS}=require(path.join(root,'backend/src/data/behaviorPaths'))
function runtime(){let now=1000,id=0;const modules=new Map(),events=[];class Clock extends Date{static now(){return now}}
 function load(relative){const file=path.resolve(dir,relative)+'.ts';if(modules.has(file))return modules.get(file);const mod={exports:{}};modules.set(file,mod.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module:mod,exports:mod.exports,Date:Clock,console,require:name=>name==='uuid'?{v4:()=>`test-${++id}`} : load(path.relative(dir,path.resolve(path.dirname(file),name)))});return mod.exports}
 const state=load('state'),analysis=load('events/analysisRequests').analysisRequestAdapters,trade=load('events/trade').tradeAdapters
 const emit=(name,p)=>{if(p)events.push({event_name:name,client_ts:now++,event_id:'event-'+events.length,user_key:'user:1',session_id:'s',source:'direct',device:'desktop',properties:JSON.parse(JSON.stringify({diagnostics_version:'web-core-chain-v1',...p}))})}
 const track=(name,p)=>{const adapter=analysis[name]||trade[name];if(adapter){const props=adapter(p,emit);if(props)emit(name,props)}}
 state.beginVisit({token_address:'token',chain:'56',entry_module:'signals'});state.presentPageVisit(state.reservePageVisit({token_address:'token',chain:'56',page_path:'/cn/bsc/tokens/token',page_name:'token_detail',view_mode:'page',navigation_source:'internal_click'}))
 const visit=state.getCurrentVisit().token_visit_id;emit('token_detail_viewed',{token_address:'token',chain:'56',token_visit_id:visit})
 const attempt={drilldown:{type:'ai',token_address:'token',currentChain:{id_number:56},filters:{chart_id:'kline_cost_distribution'},from_time:{time:10},end_time:{time:100}},fresh:false,was_cached:false,had_cache:true};track('analysis_requested',attempt);track('analysis_request_finished',{request:attempt})
 function chain(asOf=2*86400000){const users=decodePathRows(structuredClone(events)),options={start:0,end:86400000,asOf};return productChain(users,options,requestDiagnostics(users,options).analysis_rows)}
 return {state,analysis,trade,track,events,chain,advance:ms=>{now+=ms},emit,load}
}
;(async()=>{
 const reports=[]
 // Actual swap entry point; TEE authorization exits without sending the order.
 {
  const r=runtime(),source=fs.readFileSync(path.join(web,'src/components/ui/trade/full_modal/service.ts'),'utf8'),start=source.indexOf('export const swap_with_backend'),end=source.indexOf('const prepareTradePrams',start),mod={exports:{}};let requests=0
  const script=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  vm.runInNewContext(script,{module:mod,exports:mod.exports,console:{log(){}},loginCheck:()=>true,window:{logearn_growth_track:r.track},all_support_chains:{56:{protocol:'swap'}},prepareTradePrams:()=>({}),dateYMDHmsFormat:()=>'',Date,isEvm:()=>true,isSolana:()=>false,submitEvmSwapWithTeeAuth:async()=>undefined,estimateTradeUsd:()=>100,estimateMinOut:()=>undefined,api:{copyTrade:{operatePosition:async()=>{requests++;return {}}}}})
  await mod.exports.swap_with_backend({chain:56,token_address:'token',trade_type:'swap',token_op_type:'buy',trade_wallet:'wallet'})
  const c=r.chain();assert.equal(requests,0);assert.equal(c.payload.stages[3].visits,1)
  reports.push({case:'TEE exits before order submission',actual_order_requests:requests,reported_submission_visits:c.payload.stages[3].visits,expected_submission_visits:0})
 }
 // Actual WS adapter after its 5-minute association window, still inside 24h.
 {
  const r=runtime();r.track('trade_submitted',{chain:56,token_address:'token',trade_type:'swap',token_op_type:'buy',trade_wallet:'wallet'});r.advance(6*60000);r.track('trade_terminal',{res:{id:'notice',hash:'fixture-hash',status:4,chain:56,token_address:'token',address:'wallet'},notification:{trade_type:'manual_trade'}})
  const terminal=r.events.find(e=>e.event_name==='trade_succeeded'),c=r.chain();assert(terminal);assert.equal(terminal.properties.trade_attempt_id,undefined);assert.equal(c.payload.stages[4].visits,0)
  reports.push({case:'Success confirmed after 6 minutes',terminal_emitted:true,terminal_attempt_id_present:!!terminal.properties.trade_attempt_id,terminal_visit_id_present:!!terminal.properties.token_visit_id,submission_visits:c.payload.stages[3].visits,confirmed_trade_visits:c.payload.stages[4].visits,expected_confirmed_trade_visits:1})
  const {productChainMarkup}=await import(path.join(root,'frontend/src/pages/productChain.js'));const html=productChainMarkup({esc:String,fmt:String,table:(h,rows)=>rows.map(r=>r.join('|')).join('\n')},{value_diagnostics:{product_chain:c.payload}})
  assert(html.includes('100.0%'));assert(!html.includes('采集待核对'))
  reports.push({case:'All details versioned but terminal context missing',versioned_details:c.payload.quality.versioned_detail_events,detail_events:c.payload.quality.detail_events,trades_missing_visit:c.payload.quality.trades_missing_visit,shows_100_percent_gap:true,hides_rate_for_missing_trade_context:false})
 }
 // Updated product field exists, but the actual growth projection drops it.
 {
  const r=runtime(),p=r.events.find(e=>e.event_name==='analysis_requested').properties,projected=Object.fromEntries(Object.entries(p).filter(([k])=>PATH_PROPERTY_KEYS.includes(k)));assert.equal(p.had_cache,true);assert.equal(projected.had_cache,undefined)
  reports.push({case:'had_cache contract alignment',sent_had_cache:p.had_cache,growth_projection_retains_had_cache:Object.hasOwn(projected,'had_cache'),audit_contract_retains_had_cache:require(path.join(root,'frontend/src/analytics/trackingContract.json')).properties.includes('had_cache')})
 }
 // Actual transport: HTTP success with a rejected application body is forgotten.
 {
  const mod={exports:{}},storage=new Map(),handlers={};let tick,fetches=0,jsonReads=0
  const source=ts.transpileModule(fs.readFileSync(path.join(dir,'transport.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const dependencies={
   pako:{default:{gzip:x=>new Uint8Array(Buffer.from(x))}},
   'src/plugins/browser/window':{default:{addEventListener:(name,fn)=>{handlers[name]=fn},document:{visibilityState:'visible'}}},
   'src/config/ssr':{IsBrowser:()=>true},
   'src/utils/logearn_localstorage':{default:{get:(k,f)=>storage.get(k)??f,remove:k=>storage.delete(k),set:(k,v)=>storage.set(k,v)}}
  }
  vm.runInNewContext(source,{module:mod,exports:mod.exports,Uint8Array,Blob,setInterval:fn=>{tick=fn;return 1},fetch:async()=>{fetches++;return {ok:true,json:async()=>{jsonReads++;return {code:500,message:'rejected'}}}},require:name=>dependencies[name]})

  mod.exports.enqueue({event_id:'fixture',event_name:'analysis_requested'});tick();await new Promise(resolve=>setImmediate(resolve));tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(fetches,1);assert.equal(storage.size,0)
  reports.push({case:'Transport HTTP/application acknowledgment boundary',http_status:200,simulated_business_code:500,response_body_checked:jsonReads>0,retained_outbox_batches:storage.size,note:'Collector application-response contract must be verified; this is a local rejection fixture, not evidence that the live collector behaves this way.'})
 }
 const report={web_head:execFileSync('git',['rev-parse','HEAD'],{cwd:web,encoding:'utf8'}).trim(),pr:'https://github.com/js-kingdata/logearn-web/pull/29',reports,scope:'Actual current product functions/adapters and growth modules, isolated local fixtures; no collector calls, source writes, orders, PR edits or operational tasks created.'}
 fs.writeFileSync(path.join(__dirname,'reproductions.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
})().catch(e=>{console.error(e);process.exitCode=1})
