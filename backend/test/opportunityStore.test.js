'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createOpportunityStore}=require('../src/ai/growth/opportunityStore');
const period={start:100,end:200,timezone:'Asia/Bangkok'};
const original={moduleId:'growth.activation',subject:'激活成熟分母待核查',issue:'部分流量未成熟',
 action:'先确认关联和成熟分母',hypothesis:'事件覆盖不完整',period,
 scope:{source:'all'},goalId:'goal',goalVersion:'1',metricId:'activation_rate',definitionVersion:'1',
 evidenceIds:['ev-a'],confidence:'unknown',impact:{affectedUsers:null},effort:{hours:null}};
test('upsert deduplicates repeated scans, retains revisions and isolates owners',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE gw_goals(owner_id TEXT,id TEXT,version INTEGER);INSERT INTO gw_goals VALUES(\'alice\',\'goal\',1),(\'alice\',\'goal\',2);');
  const store=createOpportunityStore(db,{initialize:true,clock:()=>1200,
   verifyEvidence:(owner,id)=>owner==='alice'&&id==='ev-a'});
  const first=store.upsert('alice',original);
  assert.equal(first.created,true);
  assert.equal(store.upsert('alice',original).reused,true);
  assert.equal(store.history('alice',first.id).length,1);
  const newer=store.upsert('alice',{...original,issue:'成熟分母仍未知'});
  assert.equal(newer.id,first.id);assert.equal(newer.version,2);
  assert.equal(store.history('alice',first.id).length,2);
  assert.equal(store.list('bob').length,0);
  assert.equal(store.get('bob',first.id),null);
  assert.throws(()=>store.history('bob',first.id),/不存在/);
  const status=store.decide('alice',first.id,{status:'investigating',expectedVersion:2,reason:'需核对埋点覆盖'});
  assert.equal(status.version,3);
  assert.equal(store.history('alice',first.id).length,3);
  assert.throws(()=>store.decide('alice',first.id,{status:'accepted',expectedVersion:2,reason:'旧版本'}),/版本/);
  const changedGoal=store.upsert('alice',{...original,goalVersion:'2'});
  assert.notEqual(changedGoal.id,first.id);
  assert.throws(()=>store.upsert('bob',original),/权限/);
 }finally{db.close()}
});
test('schema only created on explicit approved migration',()=>{
 const db=new DatabaseSync(':memory:');
 try{const store=createOpportunityStore(db);
 assert.throws(()=>store.list('alice'),/no such table/);
 }finally{db.close()}
});
