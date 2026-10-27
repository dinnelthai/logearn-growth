'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {sourceChanges}=require('../src/ai/growth/sourceChanges');
test('source changes are owner-scoped, deterministic and do not infer missing metrics as zero',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  assert.deepEqual(sourceChanges(db,'owner-a',{now:1000}),[]);
  db.exec(`CREATE TABLE content_growth_items(owner_id TEXT,created_at TEXT);
   CREATE TABLE x_follower_progress(owner_id TEXT,account TEXT,complete INTEGER,state TEXT,updated_at INTEGER);`);
  const date='2026-10-28T00:00:00Z',now=Date.parse(date)+10000;
  db.prepare('INSERT INTO content_growth_items VALUES (?,?)').run('owner-a',date);
  db.prepare('INSERT INTO content_growth_items VALUES (?,?)').run('owner-b',date);
  db.prepare('INSERT INTO x_follower_progress VALUES(?,?,?,?,?)').run('owner-a','logearn_cn',0,'paused',now-1000);
  db.prepare('INSERT INTO x_follower_progress VALUES(?,?,?,?,?)').run('owner-b','logearn_cn',0,'paused',now-1000);
  const a=sourceChanges(db,'owner-a',{now});
  assert.equal(a.length,2);
  assert.deepEqual(a,sourceChanges(db,'owner-a',{now}));
  assert.ok(a.some(x=>x.kind==='content'));
  assert.ok(a.some(x=>x.kind==='audience'));
  assert.notDeepEqual(a,sourceChanges(db,'owner-b',{now}));
 }finally{db.close()}
});
