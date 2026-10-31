'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createContentAdapters}=require('../src/ai/business/tools/contentAdapters');
test('content and follower evidence isolate owners without returning profiles',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER);
   CREATE TABLE x_follower_audit(owner_id TEXT,account TEXT,category TEXT,posts_at INTEGER,reviewed INTEGER,seen_at INTEGER);
   CREATE TABLE x_follower_progress(owner_id TEXT,account TEXT,complete INTEGER,state TEXT,updated_at INTEGER);`);
  db.prepare('INSERT INTO content_growth_items VALUES(?,?,?,?,?,?,?)').run('owner-a','x','2026-10-20',5,2,null,0);
  db.prepare('INSERT INTO content_growth_items VALUES(?,?,?,?,?,?,?)').run('owner-b','x','2026-10-20',900,30,2,4);
  const now=Date.parse('2026-10-21T00:00:00Z');
  db.prepare('INSERT INTO x_follower_audit VALUES(?,?,?,?,?,?)').run('owner-a','logearn_cn','crypto',now-1000,1,now-1000);
  db.prepare('INSERT INTO x_follower_audit VALUES(?,?,?,?,?,?)').run('owner-b','logearn_cn','meme',now-1000,1,now-1000);
  db.prepare('INSERT INTO x_follower_progress VALUES(?,?,?,?,?)').run('owner-a','logearn_cn',0,'paused',now);
  const reader=createContentAdapters(db),scope={start:now-86400000,end:now};
  const a=reader.contentGrowth(scope,{ownerId:'owner-a'});
  assert.equal(a.summary.x.impressions,5);assert.equal(a.coverage.conversionAttribution,false);
  assert.equal(reader.contentGrowth(scope,{ownerId:'owner-b'}).summary.x.impressions,900);
  const followers=reader.followerQuality(scope,{ownerId:'owner-a'});
  assert.equal(followers.segments.length,1);assert.equal(followers.segments[0].category,'crypto');
  assert.equal(JSON.stringify(followers).includes('meme'),false);
  assert.equal(followers.coverage.complete,false);
  assert.throws(()=>reader.contentGrowth(scope,{}),/用户范围/);
 }finally{db.close()}
});

test('publication range follows Bangkok calendar day rather than UTC midnight',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER)');
  db.prepare('INSERT INTO content_growth_items VALUES(?,?,?,?,?,?,?)').run('owner-a','x','2026-10-27',7,1,0,0);
  db.prepare('INSERT INTO content_growth_items VALUES(?,?,?,?,?,?,?)').run('owner-a','x','2026-10-28',11,1,0,0);
  const from=Date.parse('2026-10-27T17:00:00Z'),to=Date.parse('2026-10-28T17:00:00Z');
  const result=createContentAdapters(db).contentGrowth({start:from,end:to},{ownerId:'owner-a'});
  assert.equal(result.summary.x.impressions,11);
 }finally{db.close()}
});

test('historical follower view excludes future scan completion, future post review and untimed manual review',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER);
   CREATE TABLE x_follower_audit(owner_id TEXT,account TEXT,category TEXT,posts_at INTEGER,reviewed INTEGER,seen_at INTEGER);
   CREATE TABLE x_follower_progress(owner_id TEXT,account TEXT,complete INTEGER,state TEXT,updated_at INTEGER);`);
  const begin=Date.parse('2026-10-20T00:00:00Z');
  const cutoff=Date.parse('2026-10-21T00:00:00Z');
  const put=db.prepare('INSERT INTO x_follower_audit VALUES(?,?,?,?,?,?)');
  put.run('alice','logearn_cn','crypto',begin+5000,1,begin+1000);
  put.run('alice','logearn_cn','meme',cutoff+2000,1,begin+2000);
  put.run('bob','logearn_cn','other',begin+5000,1,begin+2000);
  db.prepare('INSERT INTO x_follower_progress VALUES(?,?,?,?,?)').run(
   'alice','logearn_cn',1,'complete',cutoff+3000);
  const reader=createContentAdapters(db);
  const result=reader.followerQuality({start:begin,end:cutoff},{ownerId:'alice'});
  assert.equal(result.available,true);
  assert.equal(result.segments.reduce((n,r)=>n+r.n,0),2);
  assert.equal(result.segments.reduce((n,r)=>n+r.analyzed,0),1,
   'future post classification must not become a historical analysis');
  assert.equal(result.segments.find(r=>r.category==='meme'),undefined,
   'future classification must not appear in the old report');
  assert.equal(result.segments.find(r=>r.category==='unknown')?.n,1);
  assert.ok(result.segments.every(r=>r.reviewed===null));
  assert.equal(result.progress.length,0,'future completed state must not leak backward');
  assert.equal(result.coverage.complete,false);
  assert.equal(result.coverage.reviewedHistoricalStatus,'unknown-no-review-timestamp');
  assert.ok(result.warnings.some(x=>x.includes('历史')));
  assert.doesNotMatch(JSON.stringify(result),/bob|other/);
  db.prepare('UPDATE x_follower_progress SET updated_at=?,complete=1').run(cutoff-1000);
  const prior=reader.followerQuality({start:begin,end:cutoff},{ownerId:'alice'});
  assert.equal(prior.progress.length,1);
  assert.equal(prior.coverage.complete,true,'an actual pre-cutoff completion remains visible');
 }finally{db.close()}
});
