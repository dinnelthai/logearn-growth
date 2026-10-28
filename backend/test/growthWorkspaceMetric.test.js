'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {atBangkok}=require('../src/ai/growth/workspace/period');
const {refreshWeeklyCore}=require('../src/ai/growth/workspace/weeklyCoreProgress');
const now=Date.parse('2026-10-28T05:00:00Z'),end=atBangkok(2026,9,28),start=end-7*86400000;
const goal={metricId:'weekly_core',definitionVersion:'1',target:200,unit:'users',direction:'increase',aggregation:'rolling-distinct',periodStart:atBangkok(2026,9,1),periodEnd:atBangkok(2026,10,1),scope:{source:'all'}};
function deps(complete=false){return {status:async()=>({snapshot_id:'s1',as_of:new Date(now).toISOString(),history_complete:complete,events_complete_through:complete?new Date(end).toISOString():null}),weekly:async()=>({payload:{available:true,start,end,timezone:'Asia/Bangkok',source:'all',users:27,history_complete:complete,events_complete_through:complete?new Date(end).toISOString():null}})}}
test('weekly core stores an owner-scoped partial observation without claiming completion',async()=>{
 const db=new DatabaseSync(':memory:');try{const store=workspaceStore(db,{clock:()=>now,initialize:true});const g=store.saveGoal('alice',goal);const result=await refreshWeeklyCore({store,owner:'alice',goal:g,now,...deps()});
 assert.equal(result.status,'partial');assert.equal(result.observed,27);assert.equal(result.met,null);assert.equal(store.getEvidence('bob',result.evidenceId),null);assert.equal(store.getEvidence('alice',result.evidenceId).metricId,'weekly_core');
 }finally{db.close()}
});
test('only complete, matching rolling observations can establish goal completion',async()=>{
 const db=new DatabaseSync(':memory:');try{const store=workspaceStore(db,{clock:()=>now,initialize:true});const g=store.saveGoal('alice',goal);const result=await refreshWeeklyCore({store,owner:'alice',goal:g,now,...deps(true)});assert.equal(result.status,'verified');assert.equal(result.observed,27);assert.equal(result.met,false);
 const mismatch=await refreshWeeklyCore({store,owner:'alice',goal:{...g,definition_version:'other'},now,...deps(true)});assert.equal(mismatch.status,'unknown');
 }finally{db.close()}
});
