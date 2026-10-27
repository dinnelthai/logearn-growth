'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {collectChannelObservations}=require('../src/ai/growth/channelObservations');
test('daily content/follower sidecar is owner-scoped, keeps unknown attribution',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT,published_at TEXT,impressions INTEGER);
   CREATE TABLE x_follower_audit(owner_id TEXT,account TEXT,category TEXT);
   CREATE TABLE x_follower_progress(owner_id TEXT,account TEXT,complete INTEGER,state TEXT);`);
  db.prepare('INSERT INTO content_growth_items VALUES(?,?,?,?)').run('alice','x','2026-10-27',12);
  db.prepare('INSERT INTO content_growth_items VALUES(?,?,?,?)').run('bob','blog','2026-10-27',900);
  db.prepare('INSERT INTO x_follower_audit VALUES(?,?,?)').run('bob','logearn_global','meme');
  const a=collectChannelObservations('alice','2026-10-27',{db});
  assert.equal(a.content.platforms.length,1);
  assert.equal(a.content.platforms[0].impressions,12);
  assert.equal(a.followers.available,false);
  assert.equal(a.attribution.registeredUsers,null);
  assert.equal(a.attribution.trades,null);
  assert.equal(a.causalProof,false);
 }finally{db.close()}
});
