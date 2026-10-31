'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {runExecutiveCycle}=require('../src/ai/growth/workspace/executiveCycle');
const {previousBangkokDay}=require('../src/ai/growth/daily');
const {currentMonth}=require('../src/ai/growth/workspace/period');
const now=Date.parse('2026-10-31T05:00:00Z');
const d=previousBangkokDay(now);
function fixture(owner='alice'){
 const db=new DatabaseSync(':memory:');
 const store=workspaceStore(db,{initialize:true,clock:()=>now});
 return {db,store,owner,close:()=>db.close()};
}
function snapshot({complete=true,current=60,old=100}={}){
 const ts=new Date(d.end+1000).toISOString();
 return {baseline:{start:d.start-86400000,end:d.start,totals:{active_users:old,new_users:40,returning_users:60}},
  current:{start:d.start,end:d.end,totals:{active_users:current,new_users:31,returning_users:29}},
  health:{complete,historyComplete:complete,snapshotId:'immutable-s1',
   cutoff:ts,eventsCompleteThrough:complete?ts:null}};
}
test('verified North Star decline creates one owner-scoped durable problem and one approval-only draft',async()=>{
 const f=fixture();try{
  const run=()=>runExecutiveCycle({ownerId:'alice',store:f.store,now,load:async()=>snapshot()});
  const first=await run();
  assert.equal(first.status,'verified');
  assert.ok(first.declineSignals>=2);
  assert.equal(first.newProblems,first.declineSignals);
  assert.equal(first.proposedActions,1);
  const p=f.store.problems('alice').find(x=>x.subject.startsWith('active_users:')),
   a=f.store.actions('alice').find(x=>x.metric_id==='active_users');
  assert.equal(p.type,'business');
  assert.equal(p.priority,5);
  assert.equal(a.status,'proposed');
  assert.equal(a.assignee,'AI Growth Agent');
  assert.equal(f.store.problems('bob').length,0);
  assert.equal(f.store.actions('bob').length,0);
  assert.equal((await run()).newProblems,0);
  assert.equal(f.store.actions('alice').length,1);
  assert.equal(f.store.problems('alice').length,first.declineSignals);
  const queue=f.store.executiveQueue('alice',{at:now});
  assert.equal(queue.northStar.metricId,'active_users');
  assert.equal(queue.waitingApproval,1);
  assert.equal(queue.priorities[0].id,p.id);
  assert.equal(first.modelCalls+first.paidCalls+first.externalActions,0);
 }finally{f.close()}
});
test('uncertain source creates only a data-quality issue and never an unverified action',async()=>{
 const f=fixture();try{
  const result=await runExecutiveCycle({ownerId:'alice',store:f.store,now,load:async()=>snapshot({complete:false,current:1})});
  assert.equal(result.status,'coverage-unverified');
  assert.equal(f.store.problems('alice').length,1);
  assert.equal(f.store.problems('alice')[0].type,'data-quality');
  assert.equal(f.store.actions('alice').length,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gw_evidence').get().n,0);
 }finally{f.close()}
});
test('query failure is isolated, later trusted recovery resolves only its matching source issue',async()=>{
 const f=fixture();try{
  const unavailable=await runExecutiveCycle({ownerId:'alice',store:f.store,now,load:async()=>{throw Error('provider secret')}});
  assert.equal(unavailable.status,'source-unavailable');
  assert.equal(JSON.stringify(unavailable).includes('provider secret'),false);
  assert.equal(f.store.problems('alice')[0].status,'open');
  await runExecutiveCycle({ownerId:'alice',store:f.store,now,load:async()=>snapshot()});
  assert.equal(f.store.problems('alice').find(x=>x.type==='data-quality').status,'resolved');
 }finally{f.close()}
});
test('month goal is linked without minting fictitious targets; problem and action are isolated',async()=>{
 const f=fixture();try{
  const month=currentMonth(now);
  const goal=f.store.saveGoal('alice',{metricId:'active_users',definitionVersion:'1',
   target:100,unit:'users',aggregation:'rolling-distinct',kind:'north',
   periodStart:month.start,periodEnd:month.end,scope:{source:'all'}});
  const result=await runExecutiveCycle({ownerId:'alice',store:f.store,now,load:async()=>snapshot()});
  assert.equal(result.northStarTargetConfigured,true);
  assert.equal(f.store.problems('alice')[0].goal_id,goal.id);
  assert.equal(f.store.executiveQueue('alice').northStar.goalId,goal.id);
  const daily=f.store.executiveQueue('alice').latestVerifiedNorthStar;
  assert.equal(daily.value,60);
  assert.equal(daily.period.end,d.end);
  assert.equal(f.store.progress('alice',goal.id).progress.status,'unknown',
   'daily unique viewers cannot be compared with a monthly distinct target');
  assert.equal(f.store.executiveQueue('bob').northStar.targetStatus,'not-configured');
 }finally{f.close()}
});
test('bad time windows or invalid counts cannot be accepted as verified evidence',async()=>{
 const f=fixture();try{
  const bad=snapshot();bad.current.end+=86400000;
  const result=await runExecutiveCycle({ownerId:'alice',store:f.store,now,load:async()=>bad});
  assert.equal(result.status,'source-unavailable');
  assert.equal(f.store.actions('alice').length,0);
 }finally{f.close()}
});

test('leased workspace tick integrates the trusted Executive observation without paid AI',async()=>{
 const f=fixture();try{
  const {dailyWorkspaceTickWithMetrics}=require('../src/ai/growth/workspace/dailyTick');
  let scans=0;
  const result=await dailyWorkspaceTickWithMetrics({db:f.db,ownerId:'alice',now,
   metricProviders:{status:async()=>{throw Error('unexpected weekly fetch')},weekly:async()=>{throw Error('unexpected weekly fetch')}},
   executiveObservation:async()=>{scans++;return snapshot()}});
  assert.equal(scans,1);
  assert.equal(result.executive.status,'verified');
  assert.equal(result.executive.proposedActions,1);
  assert.ok(result.reportId);
  assert.equal(f.store.actions('alice').length,1);
 }finally{f.close()}
});
