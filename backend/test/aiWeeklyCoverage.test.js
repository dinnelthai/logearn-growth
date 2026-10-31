'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFINITIONS,initialCoverage,collectWeeklyCoverage,finalizeWeeklyCoverage,
 modelCoverage}=require('../src/ai/growth/weeklyCoverage');

const period={start:1000,end:2000,previousStart:0,previousEnd:1000,timezone:'Asia/Bangkok'};
const baseline={id:'base-1',metricId:'active_users',value:71,
 period,coverage:{status:'partial'}};
const context=()=>({period,evidence:[baseline],business:{scope:{source:'all'}}});
const toolIds=DEFINITIONS.map(x=>x.tool);
test('all thirteen modules are represented, missing sources are never marked analyzed',()=>{
 const result=initialCoverage(context(),{allowedTools:toolIds,availableSpecialties:[]});
 assert.equal(result.modules.length,13);
 assert.equal(new Set(result.modules.map(x=>x.id)).size,13);
 assert.equal(result.modules.find(x=>x.id==='growth-overview').status,'collected');
 assert.equal(result.modules.find(x=>x.id==='content-growth').status,'not-connected');
 assert.equal(result.modules.find(x=>x.id==='kol-impact').status,'not-investigated');
 assert.equal(result.modules.find(x=>x.id==='seo-organic').status,'not-investigated');
});
test('bounded only-read once-per-module collection keeps facts and source IDs',async()=>{
 const ctx=context(),calls=[];
 const outcome=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,
  availableSpecialties:['content-growth'],maxQueries:8,
  investigate:async({tool})=>{
   calls.push(tool);
   if(tool==='get_seo_performance')return {status:'ok',evidence:[{
    id:'seo-1',metricId:'seo_search',value:{metrics:{clicks:14,impressions:180}},
    coverage:{periodMatched:true}
   }]};
   if(tool==='get_retention')return {status:'unavailable',evidence:[]};
   return {status:'ok',evidence:[{
    id:'ev-'+tool,metricId:'funnel',value:{summary:{users:12,rate:.2}},
    coverage:{status:'partial'}
   }]};
  }});
 assert.equal(calls.length,8);
 assert.equal(new Set(calls).size,8);
 assert.equal(outcome.queries,8);
 assert.equal(outcome.modules.length,13);
 assert.equal(outcome.modules.find(x=>x.id==='seo-organic').status,'collected');
 assert.equal(outcome.modules.find(x=>x.id==='seo-organic').facts[0].value,14);
 assert.equal(outcome.modules.find(x=>x.id==='retention').status,'insufficient');
 assert.ok(ctx.evidence.some(x=>x.id==='seo-1'));
 assert.ok(outcome.modules.some(x=>x.status==='not-investigated'));
 const compact=modelCoverage(outcome);
 assert.equal(compact.length,13);
 assert.equal(JSON.stringify(compact).includes('impressions'),false);
});
test('operating timeline is a collected weekly module with separate aggregate layer counts',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,maxQueries:2,
  investigate:async({tool})=>tool==='get_seo_performance'?
   {status:'ok',evidence:[{id:'seo-for-timeline',metricId:'seo_search',
    value:{metrics:{clicks:8}},coverage:{periodMatched:true}}]}:
   {status:'ok',evidence:[{id:'operations-1',metricId:'activities',
    value:{counts:{human_operations:2,channel_observations:1,ai_actions:3,total_records:6},
     humanOperations:[{title:'Campaign'}],channelObservations:[],aiActions:[]},
    coverage:{status:'available'}}]}
 });
 const row=out.modules.find(x=>x.id==='operations-timeline');
 assert.equal(row.status,'collected');
 assert.ok(row.evidenceIds.includes('operations-1'));
 assert.ok(row.facts.some(x=>x.metric==='counts.human_operations_shown'&&x.value===2));
 assert.ok(row.facts.some(x=>x.metric==='counts.ai_actions_shown'&&x.value===3));
 assert.equal(out.queries,2);
});
test('unmatched SEO source stays insufficient, not falsely counted as weekly analyzed',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,maxQueries:1,
  investigate:async()=>({status:'ok',evidence:[{
   id:'seo-reference',metricId:'seo_search',
   value:{available:true,metrics:{clicks:8000}},
   coverage:{periodMatched:false}
  }]})});
 const record=out.modules.find(x=>x.id==='seo-organic');
 assert.equal(record.status,'insufficient');
 const final=finalizeWeeklyCoverage(out,{claims:[{evidenceIds:['seo-reference']}]});
 assert.equal(final.modules.find(x=>x.id==='seo-organic').status,'insufficient');
});
test('only an AI claim with recorded evidence promotes collected data to analyzed',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,maxQueries:1,
  investigate:async()=>({status:'ok',evidence:[{
   id:'seo-verified',metricId:'seo_search',
   value:{available:true,metrics:{clicks:14}},coverage:{periodMatched:true}
  }]})});
 const noClaims=finalizeWeeklyCoverage(out,{claims:[]});
 assert.equal(noClaims.modules.find(x=>x.id==='seo-organic').status,'collected');
 const claimed=finalizeWeeklyCoverage(out,{
  claims:[{kind:'fact',text:'本期搜索点击14次',evidenceIds:['seo-verified']}],
  suggestions:[{action:'下周核查有效搜索页面',
   evidence:{evidenceIds:['seo-verified']}}]
 });
 assert.equal(claimed.modules.find(x=>x.id==='seo-organic').status,'analyzed');
 assert.equal(claimed.modules.find(x=>x.id==='seo-organic').insight,'本期搜索点击14次');
 assert.equal(claimed.modules.find(x=>x.id==='seo-organic').nextAction,'下周核查有效搜索页面');
 assert.equal(claimed.counts.analyzed,1);
});
test('model investigations can fill an uninvestigated module without rerunning tools',()=>{
 const baselineManifest=initialCoverage(context(),{allowedTools:toolIds});
 const later=[{query:{tool:'get_kol_performance'},
  result:{status:'ok',evidence:[{id:'kol-3',metricId:'kol_performance',
   value:{summary:{users:5}}}]}}];
 const result=finalizeWeeklyCoverage(baselineManifest,
  {claims:[{kind:'fact',text:'本期KOL归组用户5人',evidenceIds:['kol-3']}]},{additionalEvidence:later});
 assert.equal(result.modules.find(x=>x.id==='kol-impact').status,'analyzed');
 assert.deepEqual(result.modules.find(x=>x.id==='kol-impact').evidenceIds,['kol-3']);
});
test('a data-gap citation cannot promote channel and funnel modules to analyzed',()=>{
 const base=initialCoverage(context(),{allowedTools:toolIds});
 const later=[
  {query:{tool:'get_channels'},result:{status:'ok',evidence:[
   {id:'channels-1',metricId:'channels',value:{summary:{users:12}}}
  ]}},
  {query:{tool:'get_funnel'},result:{status:'ok',evidence:[
   {id:'funnel-1',metricId:'funnel',value:{summary:{users:12,rate:.2}}}
  ]}}
 ];
 const analysis={claims:[{kind:'fact',text:'渠道和漏斗模块已经采集，但是没有提供分步骤数据',
  evidenceIds:['channels-1','funnel-1']}]};
 const result=finalizeWeeklyCoverage(base,analysis,{additionalEvidence:later});
 assert.equal(result.modules.find(x=>x.id==='channel-growth').status,'collected');
 assert.equal(result.modules.find(x=>x.id==='activation-funnel').status,'collected');
 assert.equal(result.counts.analyzed,0);
});
test('hypotheses, irrelevant numbers and citations without source match are not analysis',()=>{
 const base=initialCoverage(context(),{allowedTools:toolIds});
 const later=[{query:{tool:'get_channels'},result:{status:'ok',evidence:[
  {id:'channels-3',metricId:'channels',value:{summary:{users:12}}}
 ]}}];
 for(const claims of [
  [{kind:'hypothesis',text:'有12名用户可能来自SEO',evidenceIds:['channels-3']}],
  [{kind:'fact',text:'本周总计有71人',evidenceIds:['channels-3']}],
  [{kind:'fact',text:'渠道统计12人',evidenceIds:['different-source']}]
 ]){
  const result=finalizeWeeklyCoverage(base,{claims},{additionalEvidence:later});
  assert.equal(result.modules.find(x=>x.id==='channel-growth').status,'collected');
 }
 const verified=finalizeWeeklyCoverage(base,
  {claims:[{kind:'fact',text:'渠道统计12人',evidenceIds:['channels-3']}]},
  {additionalEvidence:later});
 assert.equal(verified.modules.find(x=>x.id==='channel-growth').status,'analyzed');
});
test('model follow-up statistics supplement an already-collected module instead of being ignored',()=>{
 const initial=initialCoverage(context(),{allowedTools:toolIds});
 const row=initial.modules.find(x=>x.id==='channel-growth');
 row.status='collected';row.evidenceIds=['channels-summary'];
 row.facts=[{metric:'summary.users',value:100,evidenceId:'channels-summary'}];
 const followup=[{query:{tool:'get_channels'},result:{status:'ok',evidence:[
  {id:'channels-drill',metricId:'channels',
   value:{metrics:{clicks:33,impressions:400}}}
 ]}}];
 const data=finalizeWeeklyCoverage(initial,{claims:[{
  kind:'fact',text:'可核对渠道点击33次',
  evidenceIds:['channels-drill']
 }]},{additionalEvidence:followup});
 const channel=data.modules.find(x=>x.id==='channel-growth');
 assert.equal(channel.status,'analyzed');
 assert.ok(channel.evidenceIds.includes('channels-summary'));
 assert.ok(channel.evidenceIds.includes('channels-drill'));
 assert.equal(channel.insight,'可核对渠道点击33次');
});
test('query quota exhaustion does not create zero observations or a model retry',async()=>{
 const ctx=context();let calls=0;
 const result=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,
  maxQueries:8,investigate:async()=>{calls++;
   throw Object.assign(Error('query quota'),{status:429});
  }});
 assert.equal(calls,1);
 assert.equal(result.modules.find(x=>x.id==='seo-organic').status,'insufficient');
 assert.equal(result.modules.find(x=>x.id==='channel-growth').status,'not-investigated');
});

test('a successful but empty tool payload is not business evidence',async()=>{
 const ctx=context();
 const out=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,
  maxQueries:1,investigate:async()=>({status:'ok',evidence:[{
   id:'no-real-metric',metricId:'seo_search',
   value:{available:true,metrics:{clicks:null,impressions:null}},
   coverage:{status:'unknown',periodMatched:true}
  }]})});
 assert.equal(out.modules.find(x=>x.id==='seo-organic').status,'insufficient');
});

test('bounded channel and funnel buckets keep numeric evidence without private rows',()=>{
 const rows=[{id:'channel-safe',metricId:'channels',value:{
  channels:[{source:'direct',users:15,visits:23},{source:'seo',users:6,visits:11}],
  rows:[{user_id:'private-user-123',users:9000}]
 }},{id:'funnel-safe',metricId:'funnel',value:{
  conversion:{stages:[{key:'visit',users:40},{key:'login',users:24}]},
  events:[{user_id:'private-user-456',users:8000}]
 }}];
 const {factsFromEvidence}=require('../src/ai/growth/weeklyCoverage');
 const facts=factsFromEvidence(rows);
 assert.ok(facts.some(f=>f.metric==='channels.direct.users'&&f.value===15&&f.evidenceId==='channel-safe'));
 assert.ok(facts.some(f=>f.metric==='channels.seo.visits'&&f.value===11));
 assert.ok(facts.some(f=>f.metric==='conversion.stages.login.users'&&f.value===24));
 assert.equal(facts.some(f=>f.value===9000||f.value===8000),false);
 assert.equal(JSON.stringify(facts).includes('private-user'),false);
});

test('raw-only tool results cannot be counted as collected statistics',async()=>{
 const ctx=context();
 const result=await collectWeeklyCoverage({context:ctx,allowedTools:toolIds,maxQueries:3,
  investigate:async({tool})=>tool==='get_seo_performance'?
   {status:'ok',evidence:[{id:'seo-unmatched',metricId:'seo_search',
    value:{metrics:{clicks:8}},coverage:{periodMatched:false}}]}:
   {status:'ok',evidence:[{id:'channel-raw',metricId:'channels',
    value:{rows:[{user_id:'secret',users:999}]}}]}
 });
 assert.equal(result.modules.find(m=>m.id==='seo-organic').status,'insufficient');
 assert.equal(result.modules.find(m=>m.id==='channel-growth').status,'insufficient');
 assert.equal(JSON.stringify(result).includes('999'),false);
});

test('real channel aggregate shape survives safe transport and preserves breakdown',()=>{
 const {statView}=require('../src/ai/business/modelTransport');
 const {factsFromEvidence}=require('../src/ai/growth/weeklyCoverage');
 const safe=statView({
  total:{users:200,new_users:80,analysis:110,logged:140},
  groups:[
   {source:'direct',users:120,new_users:50,analysis:60,logged:90},
   {source:'seo',users:60,new_users:25,analysis:30,logged:40},
   {source:'x',users:20,new_users:5,analysis:20,logged:10}
  ],
  members:{secret:{user_id:'private'}},
  rows:[{email:'not-for-model@example.com',users:9999}]
 });
 const facts=factsFromEvidence([{id:'channel-real',metricId:'channels',value:safe}]);
 assert.ok(facts.some(x=>x.metric==='groups.seo.new_users'&&x.value===25));
 assert.ok(facts.some(x=>x.metric==='groups.x.analysis'&&x.value===20));
 assert.ok(facts.some(x=>x.metric==='total.new_users'&&x.value===80));
 assert.equal(JSON.stringify(safe).includes('not-for-model'),false);
 assert.equal(facts.some(x=>x.value===9999),false);
});

test('retention projection keeps only complete, mature all-cohort D1/D7 statistics',()=>{
 const {retentionSummary}=require('../src/ai/business/tools/registry');
 const {statView}=require('../src/ai/business/modelTransport');
 const {factsFromEvidence}=require('../src/ai/growth/weeklyCoverage');
 const payload={history_complete:false,curve_groups:{all:[{id:'all:selected',periods:[
  {period:1,complete:true,eligible_users:50,retained_users:20,
   retention_rate:0.4,pending_users:0},
  {period:7,complete:false,eligible_users:10,retained_users:null,
   retention_rate:null,pending_users:40}
 ]}]},retention_store:{users:[{id:'private-user'}]}};
 const safe=statView(retentionSummary(payload));
 const facts=factsFromEvidence([{id:'retention-real',metricId:'retention',value:safe}]);
 assert.deepEqual(safe.retention.days.map(x=>x.day),[1]);
 assert.ok(facts.some(x=>x.metric==='retention.days.0.returned'&&x.value===20));
 assert.equal(JSON.stringify(safe).includes('private-user'),false);
 const immature=retentionSummary({curve_groups:{all:[{id:'all:selected',periods:[
  {period:1,complete:false,eligible_users:1,retained_users:null}
 ]}]}});
 assert.equal(immature.retention.available,false);
 assert.deepEqual(immature.retention.days,[]);
});
