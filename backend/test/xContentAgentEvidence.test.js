'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createContentAdapters}=require('../src/ai/business/tools/contentAdapters');

test('AI content evidence includes observed X action rates and snapshots, scoped by owner',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER);'+
   'CREATE TABLE x_official_account_sync(owner_id TEXT,account TEXT,followers INTEGER,last_synced INTEGER);'+
   'CREATE TABLE x_official_posts(owner_id TEXT,account TEXT,post_id TEXT,published_at TEXT,body TEXT,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER,quotes INTEGER,observed_at INTEGER);'+
   'CREATE TABLE x_official_post_snapshots(owner_id TEXT,account TEXT,post_id TEXT,observed_at INTEGER,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER);');
  const published='2026-10-27T00:00:00.000Z',start=Date.parse(published),observed=start+24*3600000;
  db.prepare('INSERT INTO x_official_account_sync VALUES(?,?,?,?)').run('alice','logearn_cn',1000,observed);
  db.prepare('INSERT INTO x_official_account_sync VALUES(?,?,?,?)').run('bob','logearn_cn',2000,observed);
  const put=db.prepare('INSERT INTO x_official_posts VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  put.run('alice','logearn_cn','101',published,'Public A',100,3,2,1,null,observed);
  put.run('bob','logearn_cn','102',published,'Private B',99999,100,10,10,null,observed);
  db.prepare('INSERT INTO x_official_post_snapshots VALUES(?,?,?,?,?,?,?,?)')
   .run('alice','logearn_cn','101',observed,100,3,2,1);
  const response=createContentAdapters(db).contentGrowth(
   {start:start-1000,end:start+48*3600000},{ownerId:'alice'});
  assert.equal(response.xOfficial.accounts[0].account,'logearn_cn');
  assert.equal(response.xOfficial.accounts[0].sampledPosts,1);
  const post=response.xOfficial.accounts[0].posts[0];
  assert.equal(post.replyRate,2);
  assert.equal(post.repostRate,1);
  assert.equal(post.likeRate,3);
  assert.equal(post.observedAt,observed);
  assert.equal(post.source,'twitterapi.io');
  assert.equal(post.milestones.h24.ageHours,24);
  assert.equal(post.milestones.h48,null);
  assert.equal(response.coverage.conversionAttribution,false);
  assert.equal(JSON.stringify(response).includes('Private B'),false);
  assert.equal(JSON.stringify(response).includes('99999'),false);
 }finally{db.close()}
});

test('historical X follower totals only use daily snapshots observed before cutoff',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER);
   CREATE TABLE x_official_account_sync(owner_id TEXT,account TEXT,followers INTEGER,last_synced INTEGER);
   CREATE TABLE x_official_posts(owner_id TEXT,account TEXT,post_id TEXT,published_at TEXT,body TEXT,impressions INTEGER,likes INTEGER,replies INTEGER,reposts INTEGER,quotes INTEGER,observed_at INTEGER);
   CREATE TABLE x_official_follower_daily(owner_id TEXT,account TEXT,day TEXT,followers INTEGER,observed_at INTEGER);`);
  const cutoff=Date.parse('2026-10-21T00:00:00Z');
  const add=db.prepare('INSERT INTO x_official_follower_daily VALUES(?,?,?,?,?)');
  add.run('alice','logearn_cn','2026-10-19',100,cutoff-7200000);
  add.run('alice','logearn_cn','2026-10-20',999,cutoff+3600000);
  add.run('bob','logearn_cn','2026-10-20',5000,cutoff-3600000);
  db.prepare('INSERT INTO x_official_account_sync VALUES(?,?,?,?)').run(
   'alice','logearn_cn',999,cutoff+3600000);
  const result=createContentAdapters(db).contentGrowth(
   {start:cutoff-86400000,end:cutoff},{ownerId:'alice'});
  const account=result.xOfficial.accounts.find(a=>a.account==='logearn_cn');
  assert.equal(account.followers,100);
  assert.equal(account.followerHistory.length,1);
  assert.equal(account.followerHistory[0].day,'2026-10-19');
  assert.equal(account.followerChange,null);
  assert.equal(result.xOfficial.available,true);
  assert.doesNotMatch(JSON.stringify(result.contentSignals),/5000|999/);
 }finally{db.close()}
});
