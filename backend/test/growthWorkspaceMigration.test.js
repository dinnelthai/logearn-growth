'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
test('normal runtime creates no new tables until explicitly approved migration',()=>{
 const db=new DatabaseSync(':memory:');try{
  workspaceStore(db);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'gw_%'").get().n,0);
  workspaceStore(db,{initialize:true});
  assert.ok(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'gw_%'").get().n>0);
 }finally{db.close()}
});
