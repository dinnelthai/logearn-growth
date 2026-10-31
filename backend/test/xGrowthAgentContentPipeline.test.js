'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createContentAdapters}=require('../src/ai/business/tools/contentAdapters');
const {statView,modelEvidence}=require('../src/ai/business/modelTransport');
const {getSkill}=require('../src/ai/growth/skills');
const {availableDailySpecialties}=require('../src/ai/growth/dailySpecialties');

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER);'+
  'CREATE TABLE x_official_account_sync(owner_id TEXT,account TEXT,followers INTEGER,last_synced INTEGER);'+
  'CREATE TABLE x_official_posts(owner_id TEXT,account TEXT,post_id TEXT,published_at TEXT,body TEXT,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER,quotes INTEGER,observed_at INTEGER);'+
  'CREATE TABLE x_official_post_snapshots(owner_id TEXT,account TEXT,post_id TEXT,observed_at INTEGER,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER);'+
  'CREATE TABLE x_official_follower_daily(owner_id TEXT,account TEXT,day TEXT,followers INTEGER,observed_at INTEGER);');
 return db;
}
const start=Date.parse('2026-10-29T00:00:00Z');
const end=Date.parse('2026-10-30T00:00:00Z');
const posted='2026-10-17T00:00:00.000Z';
test('daily conversion includes last 30-day X sample with as-of metric, not only daily posts',()=>{
 const db=setup();
 try{
  const future=end+3600000,observed=start+3600000;
  db.prepare('INSERT INTO x_official_account_sync VALUES(?,?,?,?)').run('alice','logearn_cn',9999,future);
  db.prepare('INSERT INTO x_official_posts VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',posted,'SOL strategy example',99999,999,999,999,null,future);
  db.prepare('INSERT INTO x_official_posts VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('bob','logearn_cn','102',posted,'private-user@example.com',88888,88,88,88,null,observed);
  db.prepare('INSERT INTO x_official_post_snapshots VALUES(?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',observed,980,3,4,8);
  db.prepare('INSERT INTO x_official_post_snapshots VALUES(?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',future,99999,999,999,999);
  db.prepare('INSERT INTO x_official_follower_daily VALUES(?,?,?,?,?)')
   .run('alice','logearn_cn','2026-10-29',9721,observed);
  const reader=createContentAdapters(db);
  assert.deepEqual(availableDailySpecialties(db,'alice'),['content-growth']);
  const report=reader.contentGrowth({start,end},{ownerId:'alice'});
  assert.equal(report.available,true);
  assert.equal(report.xOfficial.lookback.days,30);
  assert.equal(report.xOfficial.accounts[0].sampledPosts,1);
  assert.equal(report.xOfficial.accounts[0].measuredImpressions,980);
  assert.equal(report.xOfficial.accounts[0].followers,9721);
  assert.equal(report.xOfficial.accounts[0].posts[0].observedAt,observed);
  assert.equal(report.xOfficial.accounts[0].posts[0].likeRate,0.31);
  assert.equal(report.xOfficial.accounts[0].posts[0].milestones.h24,null);
  assert.equal(report.xOfficial.accounts[1].sampledPosts,0);
  const projection=statView(report);
  const outbound=modelEvidence({id:'ev-x',metricId:'content_growth',value:projection});
  const encoded=JSON.stringify(outbound);
  assert.equal(outbound.value.contentSignals[0].impressions,980);
  assert.equal(outbound.value.contentSignals[0].sampleSize,1);
  assert.equal(outbound.value.contentSignals[0].followers,9721);
  assert.equal(outbound.value.contentSignals[1].repostRate,0.82);
  assert.equal(outbound.value.xOfficial.accounts[0].posts,undefined);
  for(const forbidden of ['99999','88888','private-user@example.com','owner_id','post_id'])
   assert.equal(encoded.includes(forbidden),false,forbidden);
  assert.equal(getSkill('content-growth').tools.includes('get_content_growth'),true);
  assert.match(getSkill('content-growth').instructions,/24\/48/);
 }finally{db.close()}
});
test('no snapshots before report cutoff does not transmit future observations',()=>{
 const db=setup();
 try{
  db.prepare('INSERT INTO x_official_posts VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',posted,'Only observed tomorrow',123,3,2,1,null,end+1000);
  db.prepare('INSERT INTO x_official_post_snapshots VALUES(?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',end+1000,123,3,2,1);
  const report=createContentAdapters(db).contentGrowth({start,end},{ownerId:'alice'});
  assert.equal(report.xOfficial.available,false);
  assert.equal(report.xOfficial.accounts[0].sampledPosts,0);
  assert.equal(report.xOfficial.accounts[0].measuredImpressions,null);
  assert.equal(report.xOfficial.accounts[0].posts.length,0);
 }finally{db.close()}
});

test('the existing daily brief carries a bounded source-only X summary without model calls',()=>{
 const db=setup();
 try{
  const observed=Date.parse('2026-10-29T01:00:00Z');
  db.prepare('INSERT INTO x_official_account_sync VALUES(?,?,?,?)').run('alice','logearn_cn',1000,observed);
  db.prepare('INSERT INTO x_official_posts VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',posted,'Example',500,5,3,2,null,observed);
  db.prepare('INSERT INTO x_official_post_snapshots VALUES(?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',observed,500,5,3,2);
  const brief=require('../src/ai/growth/channelObservations').collectChannelObservations('alice','2026-10-29',{db});
  assert.equal(brief.x_content_30d.available,true);
  assert.equal(brief.x_content_30d.accounts[0].sampledPosts,1);
  assert.equal(brief.x_content_30d.accounts[0].measuredImpressions,500);
  assert.equal(brief.x_content_30d.accounts[0].measuredEngagementRate,2);
  assert.equal(brief.x_content_30d.accounts[1].sampledPosts,0);
  assert.equal(brief.causalProof,false);
  assert.match(brief.x_content_30d.interpretation,/不是AI/);
 }finally{db.close()}
});
