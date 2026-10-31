'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {listBusinessModules,executeBusinessModule,validateInput}
 =require('../src/ai/business/tools/businessModuleCatalog');
const ctx={ownerId:'alice',runId:'run',scope:{source:'all'},
 period:{start:1,end:2,timezone:'Asia/Bangkok'}};
function registry(result={status:'ok',evidence:[{id:'ev-1',metricId:'channels',
 definitionVersion:'1',value:{count:0},coverage:{status:'partial'},watermarks:{events:null}}]}){
 const calls=[];
 return {calls,
  listCapabilities:()=>['get_channels','get_funnel','get_seo_performance','get_paths','get_operations_timeline']
   .map(id=>({id,version:'1',description:id,supportedScopes:['source'],
    permission:'authenticated owner and scope',inputSchema:{type:'object'}})),
  executeTool:async(...args)=>{calls.push(args);return result;}};
}
test('live discovery respects task permissions and global-only restrictions',()=>{
 const r=registry(),all=listBusinessModules(r,ctx);
 assert.equal(all.find(x=>x.moduleId==='growth.referral').status,'unavailable');
 assert.equal(all.find(x=>x.moduleId==='growth.seo').capabilities[0].id,'get_seo_performance');
 assert.equal(all.find(x=>x.moduleId==='growth.operations').status,'available');
 assert.equal(all.find(x=>x.moduleId==='growth.operations').capabilities[0].id,'get_operations_timeline');
 assert.equal(listBusinessModules(r,{...ctx,scope:{source:'direct'}})
  .find(x=>x.moduleId==='growth.operations').status,'unavailable');
 assert.equal(listBusinessModules(r,{...ctx,taskAllowedTools:['get_channels']})
  .find(x=>x.moduleId==='growth.activation').status,'unavailable');
 assert.equal(listBusinessModules(r,{...ctx,scope:{source:'direct'}})
  .find(x=>x.moduleId==='growth.seo').status,'unavailable');
});
test('valid request delegates to registry and preserves observed numeric zero',async()=>{
 const r=registry();
 const out=await executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels',
   input:{scope:{source:'direct'}}},ctx);
 assert.equal(out.status,'ok');
 assert.equal(out.data.evidence[0].value.count,0);
 assert.deepEqual(out.evidenceIds,['ev-1']);
 assert.equal(r.calls[0][0],'get_channels');
 assert.deepEqual(r.calls[0][2],ctx);
});
test('source belongs in scope.source, not filters, with explicit valid funnel steps',()=>{
 assert.throws(()=>validateInput('get_channels',{filters:{source:'direct'}}),/scope.source/);
 assert.throws(()=>validateInput('get_funnel',{steps:['token','wrong']}),/允许/);
 assert.doesNotThrow(()=>validateInput('get_funnel',{steps:['token','chip'],
  scope:{source:'direct'}}));
});
test('not-synced must not become no_data or a numeric zero',async()=>{
 const r=registry({status:'ok',evidence:[{id:'ev-2',metricId:'channels',
  value:{available:false,coverage:{status:'not-synced'}}}]});
 const out=await executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels'},ctx);
 assert.equal(out.status,'unavailable');
 assert.equal(out.data.status,'unavailable');
});
test('only explicitly observed empty data is no_data',async()=>{
 const r=registry({status:'ok',evidence:[{id:'ev-3',metricId:'channels',
  value:{available:false,dataState:'observed_empty'}}]});
 const out=await executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels'},ctx);
 assert.equal(out.status,'no_data');
});
test('unsupported and unapproved tools never reach the backend',async()=>{
 const r=registry();
 await assert.rejects(executeBusinessModule(r,
  {moduleId:'growth.referral',capabilityId:'unknown'},ctx),e=>e.status===403);
 await assert.rejects(executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels'},
  {...ctx,taskAllowedTools:['get_funnel']}),e=>e.status===403);
 assert.equal(r.calls.length,0);
});
test('existing authorization and input errors remain failures',async()=>{
 const r=registry();
 r.executeTool=async()=>{throw Object.assign(Error('forbidden'),{status:403});};
 await assert.rejects(executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels'},ctx),
  e=>e.status===403);
});
test('unexpected upstream failure is not mistaken for missing or zero data',async()=>{
 const r=registry();
 r.executeTool=async()=>{throw Error('private database error');};
 await assert.rejects(executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels'},ctx),
  e=>e.status===503&&!e.message.includes('private'));
});

test('every built-in tool has an explicit audited origin, clock and attribution boundary',()=>{
 const {SOURCE_CONTRACTS}=require('../src/ai/business/tools/sourceContracts');
 const {listToolIds}=require('../src/ai/business/tools/registry');
 assert.deepEqual(Object.keys(SOURCE_CONTRACTS).sort(),listToolIds().sort());
 assert.equal(Object.keys(SOURCE_CONTRACTS).length,18);
 for(const [id,c]of Object.entries(SOURCE_CONTRACTS)){
  assert.match(id,/^[a-z][a-z0-9_]+$/);
  assert.match(c.sourceType,/^[a-z][a-z0-9_]+$/);
  assert.match(c.clock,/^[a-z][a-z0-9_]+$/);
  assert.ok(c.limitation.length>=20);
 }
 assert.equal(SOURCE_CONTRACTS.get_channel_economics.clock,'manual_records');
 assert.equal(SOURCE_CONTRACTS.get_referral.clock,'cumulative_asof');
 assert.equal(SOURCE_CONTRACTS.get_seo_performance.clock,'pt_calendar_snapshot');
 assert.equal(SOURCE_CONTRACTS.get_content_growth.clock,'bounded_post_observation');
 assert.equal(SOURCE_CONTRACTS.get_invite_conversion.clock,'event_and_relationship');
 assert.equal(SOURCE_CONTRACTS.get_product_chain.clock,'event_and_trade');
 assert.notEqual(SOURCE_CONTRACTS.get_kol_performance.sourceType,
  SOURCE_CONTRACTS.get_channels.sourceType);
});
test('business module exposes its actual source contract rather than a generic business source label',async()=>{
 const r=registry(),modules=listBusinessModules(r,ctx);
 const seo=modules.find(m=>m.moduleId==='growth.seo').capabilities[0];
 assert.equal(seo.sourceContract.clock,'pt_calendar_snapshot');
 const out=await executeBusinessModule(r,
  {moduleId:'growth.acquisition',capabilityId:'get_channels'},ctx);
 assert.deepEqual(out.sources,['hologres_observed_source']);
 assert.equal(out.sourceContract.clock,'event_snapshot');
 assert.match(out.sourceContract.limitation,/not verified acquisition/);
 const gsc=registry({status:'ok',evidence:[{id:'seo-e',metricId:'seo_search',
   definitionVersion:'1',value:{source:'gsc-manual-export',metrics:{clicks:2}},
   coverage:{status:'export-limited'},watermarks:{searchConsole:null}}]});
 const manual=await executeBusinessModule(gsc,
  {moduleId:'growth.seo',capabilityId:'get_seo_performance'},ctx);
 assert.deepEqual(manual.sources,['manual_search_observation']);
 assert.equal(manual.sourceContract.clock,'pt_calendar_snapshot');
});

test('all eighteen built-in tools archive independently labeled source, scope, coverage and version',()=>{
 const {SOURCE_CONTRACTS}=require('../src/ai/business/tools/sourceContracts');
 const {makeEvidence}=require('../src/ai/business/evidence');
 const {modelEvidence}=require('../src/ai/business/modelTransport');
 const metric={
  query_metrics:'active_users',get_funnel:'funnel',get_paths:'paths',
  get_product_chain:'product_chain',get_retention:'retention',
  get_channels:'channels',get_segments:'segments',get_activity:'activities',
  get_operations_timeline:'activities',get_channel_economics:'collaboration_economics',
  check_data_quality:'quality',get_seo_performance:'seo_search',
  get_kol_performance:'kol_performance',get_content_growth:'content_growth',
  get_follower_quality:'follower_quality',get_referral:'referral',
  get_login_conversion:'login_conversion',get_invite_conversion:'invite_conversion'
 };
 assert.deepEqual(Object.keys(metric).sort(),Object.keys(SOURCE_CONTRACTS).sort());
 for(const [tool,metricId] of Object.entries(metric)){
  const e=makeEvidence({metricId,query:{tool},value:null,
   coverage:{status:'partial'},watermarks:{events:null,registrations:null,trades:null}},ctx);
  const contract=SOURCE_CONTRACTS[tool],model=modelEvidence(e);
  assert.equal(e.definitionVersion,require('../src/ai/business/metricRegistry')
   .describeMetric(metricId).version,tool);
  assert.equal(e.sourceMetadata.sourceType,tool==='query_metrics'?
   'hologres_observed_events':contract.sourceType,tool);
  assert.equal(model.sourceMetadata.scope,'all',tool);
  assert.equal(model.sourceMetadata.coverageStatus,'partial',tool);
  assert.equal(model.sourceMetadata.freshness.status,'unknown',tool);
  assert.equal(model.sourceMetadata.freshness.referenceAt,null,tool);
  assert.equal(model.sourceMetadata.freshness.reportedCompleteThrough,null,tool);
  assert.equal(model.period.start,ctx.period.start,tool);
  assert.equal(model.period.end,ctx.period.end,tool);
  assert.equal(model.value,null,tool);
  assert.equal(typeof e.queryFingerprint,'string',tool);
 }
});
