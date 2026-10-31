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
test('daily scan brings an observed incomplete weekly source into one owner-scoped gap across days',async()=>{
 const db=new DatabaseSync(':memory:');const now=Date.parse('2026-10-28T02:00:00Z');const store=workspaceStore(db,{clock:()=>now,initialize:true});try{
 const {currentMonth,dayStart}=require('../src/ai/growth/workspace/period');const month=currentMonth(now),end=dayStart(now);
 store.saveGoal('alice',{metricId:'weekly_core',definitionVersion:'1',target:200,unit:'users',aggregation:'rolling-distinct',periodStart:month.start,periodEnd:month.end,scope:{source:'all'}});
 const providers={status:async()=>({snapshot_id:'s',as_of:new Date(now).toISOString(),history_complete:false,events_complete_through:null}),weekly:async()=>({payload:{available:true,start:end-7*86400000,end,timezone:'Asia/Bangkok',source:'all',users:27}})};
 const {dailyWorkspaceTickWithMetrics}=require('../src/ai/growth/workspace/dailyTick');
 const executiveObservation=async()=>({status:'unavailable'});
 const a=await dailyWorkspaceTickWithMetrics({db,ownerId:'alice',now,metricProviders:providers,executiveObservation});const b=await dailyWorkspaceTickWithMetrics({db,ownerId:'alice',now:now+86400000,metricProviders:providers,executiveObservation});
 assert.equal(a.newProblems,1);assert.equal(b.newProblems,0);const gaps=store.problems('alice').filter(p=>p.subject==='source:weekly-core-events');
 assert.equal(gaps.length,1);assert.equal(store.problems('bob').length,0);
 assert.equal(store.problemEvents('alice',gaps[0].id)[0].evidenceIds.length,1);
 }finally{db.close()}
});
