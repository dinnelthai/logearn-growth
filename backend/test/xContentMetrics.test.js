'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ratio,rates,milestone,enrich,benchmark}=require('../src/analytics/xContentMetrics');
const pub='2026-10-27T00:00:00.000Z',published=Date.parse(pub);
const base={post_id:'42',published_at:pub,impressions:100,likes:3,replies:2,reposts:1,observed_at:published+24*3600000};
const observation=(hours,views)=>({observed_at:published+hours*3600000,impressions:views,likes:3,replies:2,reposts:1});
test('operational rates are percentages, never a recommendation score',()=>{
 assert.deepEqual(rates(base),{likeRate:3,replyRate:2,repostRate:1,engagementRate:6});
 assert.equal(ratio(2,0),null);
 assert.equal(ratio(null,100),null);
 assert.equal(rates({...base,impressions:null}).replyRate,null);
 assert.equal(rates({...base,likes:null}).engagementRate,null);
 assert.equal(rates({...base,impressions:10,likes:0,replies:0,reposts:0}).engagementRate,0);
});
test('24/48 milestones require observed timestamps ±6h from publish age',()=>{
 const samples=[observation(25,100),observation(49,200),observation(75,400)];
 assert.equal(milestone(base,samples,24).impressions,100);
 assert.equal(milestone(base,samples,48).ageHours,49);
 assert.equal(milestone(base,[observation(73,400)],24),null);
 assert.equal(milestone(base,[observation(73,400)],48),null);
 assert.equal(milestone(base,[observation(16,40)],24),null);
 assert.equal(enrich(base,[]).milestones.h24,null);
 assert.equal(enrich(base,samples).snapshotCount,3);
});
test('same-account same-age benchmark is gated by sample size',()=>{
 const posts=Array.from({length:4},(_,i)=>enrich({...base,post_id:String(i)},
  [observation(24,100*(i+1))]));
 assert.deepEqual(benchmark(posts.slice(0,3),'h24'),{status:'insufficient',sampleSize:3,medianViews:null});
 assert.equal(benchmark(posts,'h24').medianViews,250);
 assert.equal(benchmark(posts,'h48').status,'insufficient');
});
