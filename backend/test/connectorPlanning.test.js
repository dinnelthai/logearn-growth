'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planGrowthInvestigation}=require('../src/ai/growth/planner');
const {createCapabilityCatalog}=require('../src/ai/business/tools/capabilityCatalog');
const report={business:{scope:{source:'all'}},period:{
 start:Date.parse('2026-10-19T00:00:00Z'),end:Date.parse('2026-10-20T00:00:00Z'),
 timezone:'Asia/Bangkok'},candidates:[],snapshot:{id:'s'},warnings:[]};
test('per-task catalog selects optional OpenSEO only when server authorizes it',()=>{
 const base=['query_metrics','get_seo_performance','get_channels','get_funnel'];
 const x=planGrowthInvestigation({goal:'conversion',report,focusSkillId:'seo-organic',
  availableCapabilityIds:base});
 assert.equal(x.steps[0].skillId,'seo-organic');
 assert.deepEqual(x.steps[0].tools,['get_seo_performance','get_channels','get_funnel']);
 const y=planGrowthInvestigation({goal:'conversion',report,focusSkillId:'seo-organic',
  availableCapabilityIds:[...base,'openseo.saved_rankings']});
 assert.equal(y.steps[0].tools.at(-1),'openseo.saved_rankings');
 assert.equal(x.steps[0].mode,'read-only');
});
test('untrusted source scope excludes specialist entirely',()=>{
 assert.throws(()=>planGrowthInvestigation({goal:'conversion',
  report:{...report,business:{scope:{source:'twitter'}}},
  focusSkillId:'seo-organic',
  availableCapabilityIds:['openseo.saved_rankings']}),/全来源/);
});
test('second direct-protocol connector slots into catalog without changing Agent core',async()=>{
 const schema={type:'object',additionalProperties:false,properties:{}};
 const outputSchema={type:'object',additionalProperties:false,properties:{
  status:{type:'string',maxLength:20}}};
 const item={id:'direct.snapshot',provider:'direct',sourceType:'third_party_observation',
  version:'1.0.0',description:'Second protocol fixture',supportedScopes:['source'],
  permission:'owner-read',cost:'none',inputSchema:schema,outputSchema,
  enabled:()=>true,authorize:()=>true,
  connection:c=>({id:'direct-a',ownerId:c.ownerId,projectId:'bound-project',enabled:true}),
  execute:async()=>({status:'ok',extraSecret:'not-for-model'}),
  project:x=>({status:x.status})};
 const stored=[],catalog=createCapabilityCatalog({
  legacyIds:['get_seo_performance'],extensions:[item],
  assertOwner:c=>{if(!c?.ownerId)throw Error('no owner')},
  evidenceStore:{save:x=>stored.push(x)},
  makeExternalEvidence:input=>({id:'e1',warnings:[],value:input.value,ownerId:'alice'})
 });
 const context={ownerId:'alice',scope:{source:'all'},taskAllowedTools:['direct.snapshot'],
  period:report.period};
 assert.equal(catalog.list(context,()=>[])[0].id,'direct.snapshot');
 const response=await catalog.execute('direct.snapshot',{},context,
  ()=>{throw Error('legacy should not run')});
 assert.equal(response.evidence[0].value.status,'ok');
 assert.equal(JSON.stringify(response).includes('extraSecret'),false);
 assert.equal(stored.length,1);
});
