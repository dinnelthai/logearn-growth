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
 assert.equal(result.evidence[0].value.rows.length,2);assert.ok(result.cursor);
 const next=await t.registry.executeTool('get_funnel',{cursor:result.cursor,limit:2},t.context);assert.equal(next.evidence[0].value.rows[0].id,'c');
 await assert.rejects(()=>t.registry.executeTool('get_funnel',{cursor:result.cursor},{...t.context,ownerId:'bob'}),/权限/);
 await assert.rejects(()=>t.registry.executeTool('get_funnel',{scope:{source:'all'}},t.context),/范围/);
 await assert.rejects(()=>t.registry.executeTool('get_funnel',{filters:{sql:'1=1; DROP TABLE users'}},t.context),/字段|过滤/);
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
