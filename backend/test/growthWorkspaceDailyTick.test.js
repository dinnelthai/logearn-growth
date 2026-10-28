'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {dailyWorkspaceTick}=require('../src/ai/growth/workspace/dailyTick');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
test('two scheduler days preserve one unresolved source issue and never dispatch paid actions',()=>{
 const db=new DatabaseSync(':memory:');workspaceStore(db,{initialize:true});try{
 const now=Date.parse('2026-10-28T02:00:00Z');
 const a=dailyWorkspaceTick({db,ownerId:'alice',now,sources:[{id:'x-official',state:'not-configured'}]});
 const b=dailyWorkspaceTick({db,ownerId:'alice',now:now+86400000,sources:[{id:'x-official',state:'not-configured'}]});
 assert.equal(a.newProblems,1);assert.equal(b.newProblems,0);
 assert.equal(a.paidCalls,0);assert.equal(b.externalActions,0);
 assert.ok(b.reportId);
 assert.notEqual(a.reportId,b.reportId);
 }finally{db.close()}
});
test('only proven local partial sources produce tracking issues; absent tables do not create fake failures',()=>{
 const db=new DatabaseSync(':memory:');workspaceStore(db,{initialize:true});try{
 db.exec('CREATE TABLE content_growth_items(owner_id TEXT,platform TEXT)');
 db.prepare('INSERT INTO content_growth_items VALUES(?,?)').run('alice','x');
 const now=Date.parse('2026-10-28T02:00:00Z');
 const a=dailyWorkspaceTick({db,ownerId:'alice',now});
 const b=dailyWorkspaceTick({db,ownerId:'bob',now});
 assert.equal(a.newProblems,1);assert.equal(b.newProblems,0);
 }finally{db.close()}
});
