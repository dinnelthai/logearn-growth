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
test('specialist evidence records measured source times, not a shared event watermark',async()=>{
 const {modelEvidence}=require('../src/ai/business/modelTransport');
 const saved=[],reportedAt=Date.parse('2026-10-19T14:00:00Z');
 const syncedAt=Date.parse('2026-10-21T08:00:00Z');
 const registry=createToolRegistry({
  evidenceStore:{save:e=>saved.push(e),get:()=>null},lookups:{},
  snapshot:async()=>({snapshot_id:'events-v7',as_of:'2026-10-22T00:00:00Z'}),
  seoPerformance:async body=>body.siteUrl==='manual'?
   {available:true,source:'gsc-manual-export',snapshotId:'manual-v2',importedAt:syncedAt,
    coverage:{status:'export-limited',periodMatched:false},warnings:['not API verified']}:
   {available:true,source:'gsc-api',snapshotId:'gsc-v3',syncedAt,
    coverage:{status:'reported-final-dates',periodMatched:true},
    metrics:{clicks:3,impressions:40},warnings:['PT calendar day']},
  kolPerformance:async()=>({available:true,snapshotId:'kol-v4',
   asOf:'2026-10-22T00:00:00Z',rows:[{observedUsers:5,analysisUsers:2}],
   coverage:{status:'partial'},warnings:['CRM matches overlap']}),
  contentGrowth:()=>({available:true,summary:{},xOfficial:{available:true,
   accounts:[{account:'logearn_cn',sampledPosts:1,measuredPosts:1,
    measuredImpressions:40,lastSynced:reportedAt,posts:[]},
    {account:'logearn_en',sampledPosts:0,measuredPosts:0,
     measuredImpressions:null,lastSynced:null,posts:[]}]},
   coverage:{status:'x-public-partial'},warnings:['bounded observations']}),
  followerQuality:()=>({available:true,segments:[{category:'crypto',n:1,analyzed:0,reviewed:null}],
   progress:[{account:'logearn_cn',updated_at:reportedAt}],
   coverage:{status:'partial'},warnings:['mutable scan']})
 });
 const run=async(tool,input={})=>{
  const result=await registry.executeTool(tool,input,context);
  assert.equal(result.status,'ok');
  return result.evidence[0];
 };
 const gsc=await run('get_seo_performance',{siteUrl:'https://logearn.com/'});
 assert.equal(gsc.sourceVersions.searchConsole,'gsc-v3');
 assert.equal(gsc.watermarks.searchConsole,new Date(syncedAt).toISOString());
 assert.equal(gsc.watermarks.events,null);
 assert.equal(modelEvidence(gsc).watermarks.searchConsole,new Date(syncedAt).toISOString());
 const manual=await run('get_seo_performance',{siteUrl:'manual'});
 assert.equal(manual.sourceVersions.searchConsole,'manual-v2');
 assert.equal(manual.watermarks.searchConsole,new Date(syncedAt).toISOString());
 assert.ok(manual.warnings.some(x=>x.includes('manual-import-time-not-google-freshness')));
 assert.equal(manual.coverage.periodMatched,false);
 const kol=await run('get_kol_performance');
 assert.equal(kol.sourceVersions.kol,'kol-v4');
 assert.equal(kol.watermarks.kol,'2026-10-22T00:00:00.000Z');
 assert.equal(kol.watermarks.events,null);
 assert.equal(modelEvidence(kol).sourceVersions.kol,'kol-v4');
 const x=await run('get_content_growth');
 assert.equal(x.sourceVersions.x,'twitterapi.io');
 assert.equal(x.watermarks.x,new Date(reportedAt).toISOString());
 assert.equal(x.watermarks.events,null);
 assert.ok(x.warnings.some(x=>x.includes('not-all-account-freshness')));
 assert.equal(modelEvidence(x).watermarks.x,new Date(reportedAt).toISOString());
 const followers=await run('get_follower_quality');
 assert.equal(followers.watermarks.followerScan,new Date(reportedAt).toISOString());
 assert.equal(followers.watermarks.events,null);
 assert.equal(modelEvidence(followers).watermarks.followerScan,
  new Date(reportedAt).toISOString());
 assert.equal(saved.length,5);
 assert.equal(JSON.stringify(saved).includes('private-user'),false);
});

test('absent specialist observations produce null provenance, not freshness invented from query time',async()=>{
 const registry=createToolRegistry({evidenceStore:{save(){},get:()=>null},lookups:{},
  snapshot:async()=>({snapshot_id:'events-v7',as_of:'2026-10-22T00:00:00Z'}),
  seoPerformance:async()=>({available:false,source:'gsc-api',
   coverage:{status:'not-synced'},warnings:['no snapshot']}),
  kolPerformance:async()=>({available:false,reason:'source unavailable'}),
  contentGrowth:()=>({available:false,xOfficial:{available:false,accounts:[]},
   coverage:{status:'manual-only'}}),
  followerQuality:()=>({available:false,segments:[],progress:[],
   coverage:{status:'partial'}})
 });
 for(const [tool,source] of [['get_seo_performance','searchConsole'],
  ['get_kol_performance','kol'],['get_content_growth','x'],
  ['get_follower_quality','followerScan']]){
  const out=await registry.executeTool(tool,{},context);
  assert.equal(out.status,'ok');
  assert.equal(out.evidence[0].watermarks[source],null);
  assert.equal(out.evidence[0].watermarks.events,null);
 }
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
