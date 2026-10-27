'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createToolRegistry}=require('../src/ai/business/tools/registry');
const {planGrowthInvestigation}=require('../src/ai/growth/planner');
const {listSkills}=require('../src/ai/growth/skills');
const start=Date.parse('2026-10-18T00:00:00Z'),end=Date.parse('2026-10-20T00:00:00Z');
const context={ownerId:'alice',scope:{source:'all'},period:{start,end,timezone:'Asia/Bangkok'},runId:'run-a'};
test('specialist tool registry supplies separately identified SEO and KOL evidence, with no paid calls',async()=>{
 const calls=[],seen=[];
 const registry=createToolRegistry({
  evidenceStore:{save:e=>seen.push(e),get:()=>null},lookups:{},
  snapshot:async()=>({snapshot_id:'event-watermark',as_of:'2026-10-22T00:00:00Z'}),
  seoPerformance:async(body,ctx)=>{
   calls.push(['seo',body,ctx.ownerId]);
   return {available:true,snapshotId:'gsc-observation',importedAt:10,
    source:'gsc-manual-export',coverage:{status:'export-limited'},
    metrics:{clicks:2,impressions:100},rows:[],warnings:['manual export']};
  },
  kolPerformance:async(body,ctx,snapshot)=>{
   calls.push(['kol',body,ctx.ownerId,snapshot.snapshot_id]);
   return {available:false,reason:'not connected',rows:[],warnings:['coverage unknown']};
  }
 });
 const capabilities=registry.listCapabilities(context);
 assert.ok(capabilities.some(t=>t.id==='get_seo_performance'));
 assert.ok(capabilities.some(t=>t.id==='get_kol_performance'));
 const seo=await registry.executeTool('get_seo_performance',{siteUrl:'https://logearn.com/'},context);
 assert.equal(seo.status,'ok');assert.equal(seo.evidence[0].metricId,'seo_search');
 assert.equal(seo.evidence[0].sourceVersions.searchConsole,'gsc-observation');
 assert.equal(seo.evidence[0].sourceVersions.events,null);
 const kol=await registry.executeTool('get_kol_performance',{},context);
 assert.equal(kol.status,'ok');assert.equal(kol.evidence[0].metricId,'kol_performance');
 assert.equal(kol.evidence[0].value.available,false);
 assert.equal(seen.length,2);assert.equal(calls.length,2);
 assert.deepEqual(calls.map(c=>c[2]),['alice','alice']);
});
test('specialist tools reject source and arbitrary input scope escape',async()=>{
 const registry=createToolRegistry({evidenceStore:{save(){}},lookups:{},
  snapshot:async()=>({snapshot_id:'s',as_of:'2026-10-22T00:00:00Z'})});
 for(const id of ['get_seo_performance','get_kol_performance']){
  await assert.rejects(registry.executeTool(id,{},{
   ...context,scope:{source:'twitter'}}),/全来源/);
 }
 await assert.rejects(registry.executeTool('get_channels',{siteUrl:'https://logearn.com/'},context),/不支持/);
});
test('user can explicitly select supported specialist Skill without changing core Growth goal definitions',()=>{
 const report={business:{scope:{source:'all'}},period:{start,end},
  snapshot:{id:'wm'},candidates:[{id:'new_users',metric:'new_users',priority:'P1',score:40}],warnings:[]};
 const seo=planGrowthInvestigation({goal:'conversion',report,focusSkillId:'seo-organic'});
 const kol=planGrowthInvestigation({goal:'revenue',report,focusSkillId:'kol-impact'});
 assert.equal(seo.steps[0].skillId,'seo-organic');
 assert.ok(seo.steps[0].tools.includes('get_seo_performance'));
 assert.equal(kol.steps[0].skillId,'kol-impact');
 assert.ok(kol.steps[0].tools.includes('get_kol_performance'));
 assert.equal(seo.requiresApprovalForActions,true);
 assert.ok(listSkills().some(s=>s.id==='seo-organic'));
 assert.ok(listSkills().some(s=>s.id==='kol-impact'));
 assert.throws(()=>planGrowthInvestigation({goal:'retention',report,focusSkillId:'seo-organic'}),/不兼容/);
 assert.throws(()=>planGrowthInvestigation({goal:'conversion',report:{
  ...report,business:{scope:{source:'twitter'}}},focusSkillId:'seo-organic'}),/全来源/);
});
