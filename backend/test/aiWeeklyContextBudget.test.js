'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {modelContext}=require('../src/ai/business/modelTransport');
const {DEFINITIONS,initialCoverage}=require('../src/ai/growth/weeklyCoverage');

const BUDGET=22000;
const p={start:1792362000000,end:1792966800000,
 previousStart:1791757200000,previousEnd:1792362000000,
 timezone:'Asia/Bangkok'};
const sample=(metricId,id,value,period={start:p.start,end:p.end})=>({
 id,metricId,value,unit:'users',period,
 numerator:120,denominator:200,sampleSize:200,
 coverage:{status:'partial',periodMatched:true},
 sourceVersions:{events:'event-version-20261028'},
 watermarks:{events:'2026-10-28T00:00:00.000Z'},
 warnings:['历史覆盖未知，不能将缺失指标视为 0'],
 rows:[{email:'private@example.test',wallet:'0x123'}]
});
function fixture(capabilityCount=17){
 const tools=Array.from({length:capabilityCount},(_,i)=>({
  id:'read_only_growth_module_'+i,
  description:'查询已授权的只读增长统计数据。'.repeat(7),
  supportedScopes:['source'],
  inputSchema:{type:'object',required:['start','end'],
   properties:{start:{type:'integer',minimum:0,maximum:2000000000000},
    end:{type:'integer'},
    scope:{type:'object',properties:{source:{type:'string'}}},
    metrics:{type:'array',items:{type:'string'}},limit:{type:'integer',minimum:1,maximum:100},
    dimensions:{type:'array',items:{type:'string'}},cohort:{type:'string'}}}
 }));
 // Many KPI rows used to crowd out SEO facts in the old position-based fallback.
 const facts=[
  sample('active_users','current-active',71),
  sample('active_users','prior-active',82,{start:p.previousStart,end:p.previousEnd}),
  sample('new_users','current-new',18),
  sample('new_users','prior-new',40,{start:p.previousStart,end:p.previousEnd}),
  sample('returning_users','current-returning',53),
  sample('returning_users','prior-returning',42,{start:p.previousStart,end:p.previousEnd})
 ];
 const other=Array.from({length:68},(_,i)=>sample(
  i%3===0?'active_users':'funnel','noncritical-'+i,
  {totals:{users:120+i,active_users:70,new_users:18,converted:22},
   metrics:{clicks:100,impressions:1200,ctr:0.08},
   channels:Array.from({length:12},(_,j)=>({users:j+1,visits:j*100,rate:j/100}))}
 ));
 const seo=sample('seo_search','gsc-source-evidence',
  {available:true,metrics:{clicks:14,impressions:180,ctr:.0777,position:9.2}});
 const evidence=[...other,...facts,seo];
 const coverage=initialCoverage({period:p,evidence:[]},{
  allowedTools:DEFINITIONS.map(x=>x.tool)});
 for(const row of coverage.modules){
  if(row.id==='seo-organic'){
   row.status='collected';row.evidenceIds=[seo.id];
   row.reason='GSC 已取得匹配日期的只读统计';
  }
  if(row.id==='growth-overview'){
   row.status='collected';
   row.evidenceIds=['current-active','prior-active'];
  }
 }
 return {
  business:{scope:{source:'all'},question:'分析本周用户和 SEO 变化'},
  period:p,snapshot:{id:'snap',asOf:'2026-10-29T00:00:00.000Z'},
  current:{totals:{active_users:71,new_users:18,returning_users:53}},
  previous:{totals:{active_users:82,new_users:40,returning_users:42}},
  growth:{channels:Array.from({length:12},(_,j)=>({channel:'organic',users:j*10,visits:200}))},
  weekly:{summary:{users:71}},
  weeklyCoverage:coverage,
  weeklySources:{seo:{status:'period-matched',periodMatched:true,
   evidenceIds:[seo.id]}},
  evidence,capabilities:tools,
  growthPlan:{steps:DEFINITIONS.map(x=>({skillId:x.id,tools:[x.tool],
   reason:'覆盖核心增长模块，对已采集聚合证据做对照分析'.repeat(3)}))},
  definitions:Object.fromEntries(Array.from({length:20},(_,i)=>
   ['definition_'+i,'周报指标定义和归因说明'.repeat(20)])),
  candidates:Array.from({length:12},(_,i)=>({users:100+i,visits:200+i})),
  warnings:Array.from({length:12},()=>'来源水位不完全一致，不可无证据归因'),
  weeklyOperations:{goalsCount:6,executedActionCount:2}
 };
}
test('12-module weekly v3 fits 22KB with 17 tools while retaining core KPI and GSC',()=>{
 const raw=fixture(),view=modelContext(raw,{transportVersion:'v3'});
 assert.ok(Buffer.byteLength(JSON.stringify(view),'utf8')<=BUDGET);
 assert.equal(view.transportVersion,'aggregated-business-v3');
 assert.equal(view.weeklyCoverage.length,12);
 assert.equal(view.capabilities.length,17);
 assert.equal(view.growthPlan.steps.length,12);
 assert.equal(view.current.totals.active_users,71);
 assert.equal(view.previous.totals.new_users,40);
 assert.deepEqual(view.evidence.slice(0,6).map(x=>x.id),
  ['current-active','prior-active','current-new','prior-new',
   'current-returning','prior-returning']);
 assert.ok(view.evidence.some(x=>x.id==='gsc-source-evidence'));
 assert.equal(view.weeklySources.seo.periodMatched,true);
 assert.ok(view.omissions.weeklyModelInput.availableEvidence>view.evidence.length);
 assert.equal(JSON.stringify(view).includes('private@example.test'),false);
});
test('one cited observation from each collected module is selected before surplus facts',()=>{
 const raw=fixture(17);
 const additions=raw.weeklyCoverage.modules.filter(x=>
  !['growth-overview','seo-organic'].includes(x.id)).map((x,i)=>{
   const id='covered-'+x.id;
   x.status='collected';x.evidenceIds=[id];
   return sample('module_stat',id,{metrics:{users:20+i,clicks:11+i}});
  });
 raw.evidence.unshift(...additions);
 const projected=modelContext(raw,{transportVersion:'v3'});
 assert.ok(Buffer.byteLength(JSON.stringify(projected),'utf8')<=BUDGET);
 const selected=new Set(projected.evidence.map(x=>x.id));
 assert.ok(selected.has('gsc-source-evidence'));
 assert.ok(selected.has('current-active'));
 assert.ok(selected.has('prior-new'));
 for(const item of additions)
  assert.ok(selected.has(item.id),'module must not be evicted by surplus metrics: '+item.id);
 assert.equal(projected.weeklyCoverage.length,12);
});
test('weekly compaction adjusts for larger tool catalogs rather than dropping module status',()=>{
 const view=modelContext(fixture(28),{transportVersion:'v3'});
 assert.ok(Buffer.byteLength(JSON.stringify(view),'utf8')<=BUDGET);
 assert.equal(view.capabilities.length,28);
 assert.equal(view.weeklyCoverage.length,12);
 assert.equal(view.current.totals.new_users,18);
 assert.equal(view.previous.totals.active_users,82);
 assert.ok(view.omissions.weeklyCompression.includes('不是0'));
});
test('unknown KPI and missing SEO stay unknown rather than changing to zeros',()=>{
 const raw=fixture();
 raw.current.totals.new_users=null;
 raw.evidence=raw.evidence.filter(x=>x.id!=='gsc-source-evidence');
 raw.weeklySources.seo={status:'unavailable',periodMatched:false,evidenceIds:[]};
 raw.weeklyCoverage.modules.find(x=>x.id==='seo-organic').status='insufficient';
 raw.weeklyCoverage.modules.find(x=>x.id==='seo-organic').evidenceIds=[];
 const view=modelContext(raw,{transportVersion:'v3'});
 assert.equal(view.current.totals.new_users,null);
 assert.equal(view.weeklySources.seo.status,'unavailable');
 assert.equal(view.weeklyCoverage.find(x=>x.id==='seo-organic').status,'insufficient');
 assert.equal(JSON.stringify(view).includes('private@example.test'),false);
});
test('ordinary transport v3 without a weekly coverage manifest retains existing protocol',()=>{
 const raw=fixture();delete raw.weeklyCoverage;
 raw.capabilities=raw.capabilities.slice(0,6);
 raw.evidence=[sample('active_users','normal-metric',71)];
 raw.definitions={active_users:'独立分析活跃用户定义'};
 raw.candidates=[];
 raw.growth={channels:[]};
 raw.warnings=[];
 const view=modelContext(raw,{transportVersion:'v3'});
 assert.equal(view.omissions.weeklyModelInput,undefined);
 assert.equal(view.weeklyCoverage,null);
 assert.ok(Buffer.byteLength(JSON.stringify(view),'utf8')<=BUDGET);
});

test('v5 weekly context keeps trusted query priorities without pushing out 13 module coverage',()=>{
 const raw=fixture(5);
 raw.evidence=raw.evidence.filter(e=>e.id.startsWith('current-')||
  e.id.startsWith('prior-')||e.id==='gsc-source-evidence');
 raw.definitions={};raw.candidates=[];raw.warnings=[];
 raw.growthPlan.questionRanking={questions:[{
  metric:'new_users',priority:'P0',goalRelevant:true,affectedUsers:null,
  observedChangeMagnitude:22,evidenceConfidence:'unknown',
  authorizedTool:'query_metrics',observedLatency:{medianMs:7,sampleCount:3},
  unrelatedIdentity:'user:private'
 }]};
 const v=modelContext(raw,{transportVersion:'v5'});
 assert.equal(v.questionPriority[0].metric,'new_users');
 assert.equal(v.questionPriority[0].observedMedianMs,7);
 assert.equal(v.questionPriority[0].affectedUsers,null);
 assert.equal(v.questionPriority[0].monetaryQueryCost,'unknown');
 assert.equal(v.questionPriority[0].unrelatedIdentity,undefined);
 assert.equal(v.weeklyCoverage.length,12);
 assert.ok(v.evidence.some(e=>e.id==='gsc-source-evidence'));
 assert.ok(Buffer.byteLength(JSON.stringify(v),'utf8')<=BUDGET);
 assert.ok(!JSON.stringify(v).includes('user:private'));
});
