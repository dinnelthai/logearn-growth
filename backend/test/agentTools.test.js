const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
const {createToolRegistry}=require('../src/ai/business/tools/registry');
const {createEvidenceStore}=require('../src/ai/business/evidence');
const period={start:Date.parse('2026-10-01'),end:Date.parse('2026-10-08'),timezone:'Asia/Bangkok'};
function setup(options={}){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));const seen=[];
 const deps={evidenceStore:createEvidenceStore(db),lookups:{cohort:async(id,owner)=>owner==='alice'?{fixed:true,ids:[]}:null},snapshot:async()=>({snapshot_id:'s',as_of:'2026-10-20T00:00:00Z'}),runAnalysis:async(kind,body,snapshot,audience,owner)=>{seen.push({kind,body,audience,owner});return {payload:{users:12,rows:[{id:'a'},{id:'b'},{id:'c'}],quality:{trades:'unknown'}}}},...options};
 return {db,seen,registry:createToolRegistry(deps),context:{ownerId:'alice',scope:{source:'twitter'},period,runId:'r'}};}
test('tools discover schema, reuse existing analysis, keep empty audience and reject injections/escape',async()=>{
 const t=setup();try{
 assert.ok(t.registry.listCapabilities(t.context).find(t=>t.id==='get_funnel').inputSchema);
 const result=await t.registry.executeTool('get_funnel',{scope:{cohortId:'c'},steps:['token','chip'],limit:2},t.context);
 assert.equal(result.status,'ok');assert.deepEqual(t.seen[0].audience,[]);assert.equal(t.seen[0].kind,'funnel');assert.equal(result.evidence[0].value.users,12);
 assert.equal(result.evidence[0].value.rows,undefined);
 assert.equal(result.cursor,undefined,'row-level pagination is not exposed to the Agent');
 assert.equal(result.evidence[0].value.omittedNonStatisticalFields>0,true);
 const forged=Buffer.from(JSON.stringify({tool:'get_funnel',evidenceId:result.evidence[0].id,offset:1})).toString('base64url');
 await assert.rejects(()=>t.registry.executeTool('get_funnel',{cursor:forged},{...t.context,ownerId:'bob'}),/权限/);
 await assert.rejects(()=>t.registry.executeTool('get_funnel',{scope:{source:'all'}},t.context),/范围/);
 await assert.rejects(()=>t.registry.executeTool('get_funnel',{filters:{sql:'1=1; DROP TABLE users'}},t.context),/字段|过滤|筛选/);
 await assert.rejects(()=>t.registry.executeTool('query_metrics',{metrics:['invented']},t.context),/指标/);
 }finally{t.db.close()}
});
test('tool budgets stop before queries and data faults are unavailable rather than zeros',async()=>{
 const t=setup({maxQueries:1});try{await t.registry.executeTool('get_paths',{},t.context);await assert.rejects(()=>t.registry.executeTool('get_paths',{},t.context),/预算/);assert.equal(t.seen.length,1);}finally{t.db.close()}
 const u=setup({runAnalysis:async()=>{throw Error('data failure')}});try{const result=await u.registry.executeTool('get_retention',{},u.context);assert.equal(result.status,'unavailable');assert.equal(result.evidence.length,0);assert.equal(result.error.type,'data_unavailable');}finally{u.db.close()}
});
test('unsupported source-only tools reject activity scopes and unknown finance never turns into revenue zero',async()=>{
 const t=setup();try{await assert.rejects(()=>t.registry.executeTool('get_channel_economics',{scope:{cohortId:'c'}},t.context),/支持/);}finally{t.db.close()}
});
test('global diagnostic tools cannot pretend to honor a source filter and unused parameters are rejected',async()=>{
 const t=setup();try{
 await assert.rejects(()=>t.registry.executeTool('check_data_quality',{},t.context),/来源|全来源/);
 await assert.rejects(()=>t.registry.executeTool('get_paths',{steps:['chip','trade']},t.context),/字段|参数/);
 }finally{t.db.close()}
});
test('each queried metric keeps its own identity and definition',async()=>{
 const t=setup({metrics:async()=>({metrics:[{metricId:'d7',value:null,numerator:0,denominator:0}]})});try{
 const r=await t.registry.executeTool('query_metrics',{metrics:['d7']},t.context);assert.equal(r.evidence[0].metricId,'d7');assert.equal(r.evidence[0].value,null);assert.equal(r.evidence[0].denominator,0);
 }finally{t.db.close()}
});
test('advertised tool input fields match execution validation',()=>{
 const t=setup();try{const capabilities=t.registry.listCapabilities(t.context);const schema=id=>capabilities.find(x=>x.id===id).inputSchema.properties;
 assert.equal('dimensions' in schema('check_data_quality'),false);
 assert.equal('hours' in schema('get_paths'),false);
 assert.equal('hours' in schema('get_funnel'),true);
 assert.equal('dimensions' in schema('query_metrics'),true);
 }finally{t.db.close()}
});
test('tool schemas advertise the authorized historical time window',()=>{
 const t=setup();try{const p=t.registry.listCapabilities(t.context)[0].inputSchema.properties;assert.equal(p.start.minimum,period.start-(period.end-period.start));assert.equal(p.start.maximum,period.end);assert.equal(p.end.maximum,period.end)}finally{t.db.close()}
});
test('product chain returns bounded aggregate metrics without individual details',async()=>{
 const t=setup({maxResultBytes:5000,runAnalysis:async()=>({payload:{product_chain:{visits:100,users:90,pending:4,stages:[{label:'详情',users:90}],drops:[{users:10}],quality:{detail_events:100},dimensions:{source:Array.from({length:1000},(_,i)=>({value:'source'+i,users:1}))}},first_value:{eligible:80,converted:40,rate:0.5},entrance:{rows:[{user_id:'private'}]},events:[{user_id:'private'}]}})});try{
 const r=await t.registry.executeTool('get_product_chain',{},t.context);const v=r.evidence[0].value;
 assert.equal(v.product_chain.users,90);assert.equal(v.first_value.rate,0.5);assert.equal(v.product_chain.dimensions,undefined);assert.equal(v.events,undefined);assert.doesNotMatch(JSON.stringify(v),/private/);
 }finally{t.db.close()}
});

test('product-chain summary preserves conversion denominators and maturity without entry-level details',async()=>{
 const t=setup({maxResultBytes:4500,runAnalysis:async()=>({payload:{
  product_chain:{visits:80,users:70,pending:9,
   stages:[{label:'详情',visits:80,users:70},{label:'分析',visits:36,users:34}],
   drops:[{from:'详情',to:'分析',eligible:50,users:14,unknown:7,rate:0.28}],
   quality:{trade_unknown_visits:12,detail_events:101},
   dimensions:{source:Array.from({length:1000},(_,i)=>({users:1,value:'src'+i}))}},
  first_value:{available:true,entered:70,eligible:50,converted:30,pending:20,rate:0.6},
  exposure:{available:true,exposures:400,clicked:88,clicked_users:60,rate:0.22,
   session_id:'secret-session'},
  entrance:{missing_visit_clicks:15,completion_available:true,rows:[
   {value:'signals',visits:80,details:60,successes:20,rate:0.25,
    user_ids:['secret-user']} ]},
  page_clicks:{rows:[{page_name:'signals',visitor_users:100,clicked_users:40,
   rate:0.4,list_key:'private-list-key'}]},
  retention:[{day:7,eligible:35,returned:9,pending:10,rate:9/35}],
  events:[{user_id:'secret-user'}],lists:{all:['secret-user']},
  coverage:'partial',definition:'业务访客总量'
 }})});
 try{
  const result=await t.registry.executeTool('get_product_chain',{},t.context);
  assert.equal(result.status,'ok');
  const v=result.evidence[0].value;
  assert.equal(v.product_chain.stages[1].users,34);
  assert.equal(v.product_chain.drops[0].eligible,50);
  assert.equal(v.first_value.eligible,50);
  assert.equal(v.exposure.exposures,400);
  assert.equal(v.retention_summary[0].eligible,35);
  assert.equal(v.entrance_breakdown[0].successes,20);
  assert.equal(v.page_clicks_summary[0].visitor_users,100);
  const text=JSON.stringify(v);
  assert.doesNotMatch(text,/secret-user|secret-session|private-list-key/);
  assert.equal(v.product_chain.dimensions,undefined);
 }finally{t.db.close()}
});
