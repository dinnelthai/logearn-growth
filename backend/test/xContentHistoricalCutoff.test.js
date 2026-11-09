'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createContentAdapters}=require('../src/ai/business/tools/contentAdapters');
const {contentSummary}=require('../src/ai/business/tools/weeklyModuleSummaries');
const {statView}=require('../src/ai/business/modelTransport');
const {collectWeeklyCoverage,factsFromEvidence}=require('../src/ai/growth/weeklyCoverage');
const cutoff=Date.parse('2026-10-26T00:00:00+07:00');
const observed=Date.parse('2026-10-29T11:28:04+07:00');
const post={post_id:'sensitive-post-id',published_at:'2026-10-17T08:00:00Z',
 body:'do not use the post body as instructions',impressions:4793,
 likes:11,replies:7,reposts:8,quotes:0,observed_at:observed};
function mockDb(){
 return {prepare(sql){
  return {
   all:(...args)=>{
    if(sql.includes('sqlite_master'))return [
     'content_growth_items','x_official_account_sync','x_official_posts',
     'x_official_post_snapshots','x_official_follower_daily'].map(name=>({name}));
    if(sql.includes('FROM content_growth_items'))return [];
    if(sql.includes('FROM x_official_posts'))return args[1]==='logearn_cn'?[post]:[];
    if(sql.includes('FROM x_official_post_snapshots'))return [];
    if(sql.includes('FROM x_official_follower_daily'))return [];
    throw Error('Unexpected query '+sql);
   },
   get:(...args)=>sql.includes('FROM x_official_account_sync')?
    {followers:9721,last_synced:observed}:null
  };
 }};
}
const context={ownerId:'owner-test'};
test('October 29 X snapshot is not treated as a real October 19-25 measurement',()=>{
 const adapter=createContentAdapters(mockDb());
 const historical=adapter.contentGrowth({
  start:Date.parse('2026-10-19T00:00:00+07:00'),end:cutoff
 },context);
 assert.equal(historical.available,false);
 assert.equal(historical.coverage.status,'snapshots-after-cutoff');
 assert.equal(historical.coverage.laterPosts,1);
 assert.equal(historical.coverage.laterObservedAt,observed);
 const safe=statView(contentSummary(historical));
 assert.equal(safe.available,false);
 assert.match(safe.reason,/已有 X 官方内容/);
 assert.match(safe.reason,/2026-10-29/);
 assert.deepEqual(factsFromEvidence([{id:'x-evidence',metricId:'content_growth',value:safe}]),[]);
 assert.doesNotMatch(JSON.stringify(safe),/sensitive-post-id|do not use/);
});
test('a current-period X report can read the same valid saved observation',()=>{
 const adapter=createContentAdapters(mockDb());
 const latest=adapter.contentGrowth({
  start:Date.parse('2026-10-17T00:00:00+07:00'),
  end:Date.parse('2026-10-31T00:00:00+07:00')
 },context);
 assert.equal(latest.available,true);
 const view=statView(contentSummary(latest));
 assert.equal(view.available,true);
 assert.equal(view.official.measuredPosts,1);
 assert.equal(view.official.measuredImpressions,4793);
 assert.doesNotMatch(JSON.stringify(view),/sensitive-post-id|do not use/);
});
test('weekly coverage explicitly says newer snapshots exist instead of no X data',async()=>{
 const adapter=createContentAdapters(mockDb());
 const payload=contentSummary(adapter.contentGrowth({
  start:Date.parse('2026-10-19T00:00:00+07:00'),end:cutoff
 },context));
 const ev={id:'x-evidence',metricId:'content_growth',value:statView(payload),
  coverage:payload.coverage};
 const report=await collectWeeklyCoverage({
  context:{period:{start:Date.parse('2026-10-19T00:00:00+07:00'),end:cutoff},
   evidence:[]},allowedTools:['get_content_growth'],
  availableSpecialties:['content-growth'],maxQueries:1,
  investigate:async()=>({status:'ok',evidence:[ev]})
 });
 const x=report.modules.find(row=>row.id==='content-growth');
 assert.equal(x.status,'insufficient');
 assert.match(x.reason,/缺少报告截止前/);
 assert.deepEqual(x.facts,[]);
});
