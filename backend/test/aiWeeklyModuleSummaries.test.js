'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
 loginSummary,economicsSummary,kolSummary,contentSummary,followerSummary
}=require('../src/ai/business/tools/weeklyModuleSummaries');
const {statView,modelContext}=require('../src/ai/business/modelTransport');
const {factsFromEvidence,DEFINITIONS}=require('../src/ai/growth/weeklyCoverage');

const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00'),
 previousStart:Date.parse('2026-10-12T00:00:00+07:00'),
 previousEnd:Date.parse('2026-10-19T00:00:00+07:00'),
 timezone:'Asia/Bangkok'};
const make=(id,value)=>({id:'e-'+id,metricId:id,period,
 value:statView(value),coverage:value.coverage||{status:'partial'}});
function assertMetric(e,metric,value){
 const facts=factsFromEvidence([e]);
 assert.ok(facts.some(f=>f.metric===metric&&f.value===value),
  'expected '+metric+'='+value+' in '+JSON.stringify(facts));
}
test('login preserves observed successes, requests and unknown without event rows',()=>{
 const e=make('login_conversion',loginSummary({
  login:{requests:20,users:15,counts:{success:10,failed:6,pending:4},
   success_rate:.625},
  click_users:23,record_total:20,records:[{user_id:'private-login'}],
  stages:{rows:[{method:'wallet',stage:'sign',started:20,success:10,failed:6}]}
 }));
 assertMetric(e,'conversion.requests',20);
 assertMetric(e,'conversion.success',10);
 assertMetric(e,'conversion.pending',4);
 assert.doesNotMatch(JSON.stringify(e),/private-login/);
});
test('economics exposes ledger entries and ROI but does not cast decimal money',()=>{
 const e=make('trade_revenue',economicsSummary({byCurrency:[
  {currency:'USD',income_entries:4,roi:.4,net_revenue:'999999999999999.99'}
 ]}));
 assertMetric(e,'economics.receivedEntries',4);
 assertMetric(e,'groups.usd.roi',.4);
 assert.doesNotMatch(JSON.stringify(e),/999999999999999/);
 const empty=make('trade_revenue',economicsSummary({byCurrency:[]}));
 assert.equal(empty.value.available,false);
 assert.deepEqual(factsFromEvidence([empty]),[]);
});
test('KOL reveals only cross-profile counters, not CRM names or member overlap',()=>{
 const e=make('kol_performance',kolSummary({available:true,
  rows:[{id:'secret-kol',label:'Private name',observedUsers:13,
   analysisUsers:4,tradeUsers:0},{id:'secret2',observedUsers:5,analysisUsers:2,
   tradeUsers:null}]}));
 assertMetric(e,'summary.measuredProfiles',2);
 assertMetric(e,'summary.maxObservedUsers',13);
 assert.doesNotMatch(JSON.stringify(e),/Private name|secret-kol|secret2/);
 const unmeasured=make('kol_performance',kolSummary({available:true,
  rows:[{id:'kol',observedUsers:null}]}));
 assert.equal(unmeasured.value.available,false);
 assert.deepEqual(factsFromEvidence([unmeasured]),[]);
});
test('X manual and official snapshots remain separate, without post bodies',()=>{
 const e=make('content_growth',contentSummary({available:true,
  summary:{x:{count:2,impressions:110}},
  xOfficial:{accounts:[{account:'logearn',sampledPosts:4,measuredPosts:3,
   measuredImpressions:80,posts:[{text:'MUST NOT BE MODELED'}]}]}}));
 assertMetric(e,'manual.count',2);
 assertMetric(e,'official.measuredPosts',3);
 assertMetric(e,'groups.logearn.sampledPosts',4);
 assert.doesNotMatch(JSON.stringify(e),/MUST NOT BE MODELED/);
 assert.ok(contentSummary({available:true,summary:{x:{count:1}}})
  .warnings.some(x=>x.includes('最近30天')));
});
test('follower rows are aggregated by category, never user identities',()=>{
 const e=make('follower_quality',followerSummary({available:true,
  segments:[{account:'logearn',category:'active',n:10,analyzed:7,reviewed:3},
   {account:'logearn',category:'unknown',n:5,analyzed:1,reviewed:0}],
  progress:[{account:'logearn',user_id:'private-follower'}]}));
 assertMetric(e,'summary.scannedRecords',15);
 assertMetric(e,'groups.active.records',10);
 assert.doesNotMatch(JSON.stringify(e),/private-follower/);
});
test('the five projected modules are model-visible but never imply success without a claim',()=>{
 const entries=[
  ['login-conversion',make('login_conversion',loginSummary({
   login:{requests:5,users:3,counts:{success:2}}}))],
  ['revenue',make('trade_revenue',economicsSummary({byCurrency:[
   {currency:'USD',income_entries:1,roi:.2}]}))],
  ['kol-impact',make('kol_performance',kolSummary({available:true,rows:[
   {observedUsers:8,analysisUsers:2,tradeUsers:null}]}))],
  ['content-growth',make('content_growth',contentSummary({available:true,
   summary:{x:{count:2,impressions:6}}}))],
  ['follower-quality',make('follower_quality',followerSummary({available:true,
   segments:[{category:'active',n:7,analyzed:3,reviewed:2}]}))]
 ];
 const modules=DEFINITIONS.map(x=>({id:x.id,status:'not-investigated',
  evidenceIds:[],facts:[]}));
 for(const [id,e] of entries){
  const row=modules.find(x=>x.id===id);
  row.status='collected';row.evidenceIds=[e.id];
  row.facts=factsFromEvidence([e]);
 }
 const view=modelContext({period,snapshot:{},business:{scope:{source:'all'}},
  evidence:entries.map(x=>x[1]),weeklyCoverage:{version:'weekly-coverage-v1',modules},
  capabilities:[],current:{totals:{}},previous:{totals:{}}},{transportVersion:'v4'});
 for(const [id] of entries){
  const m=view.weeklyCoverage.find(x=>x.id===id);
  assert.equal(m.status,'collected');
  assert.ok(m.stats.length>0);
  assert.ok(m.evidenceIds.length>0);
 }
 assert.ok(Buffer.byteLength(JSON.stringify(view),'utf8')<=22000);
});
