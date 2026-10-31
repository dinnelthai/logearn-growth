'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {loadLinkedTaskEvidence,taskReviewPeriods}=require('../src/ai/growth/operationTaskEvidence');

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE operation_tasks(id TEXT,owner_id TEXT,title TEXT,status TEXT,source_json TEXT,members_json TEXT,baseline_json TEXT,created_at INTEGER,completed_at INTEGER)');
 const completedAt=Date.now()-10*86400000,createdAt=completedAt-20*86400000;
 db.prepare('INSERT INTO operation_tasks VALUES(?,?,?,?,?,?,?,?,?)').run(
  'task-1','alice','Activation cohort','done',JSON.stringify({source:'all',start:createdAt-7*86400000,end:createdAt}),
  JSON.stringify(['1001','1002']),JSON.stringify({total:{users:2}}),createdAt,completedAt);
 const store=workspaceStore(db,{initialize:true});
 const suggestion={id:'suggestion-1',user_status:'executed',business_problem:'activation low',
  action:'improve onboarding',action_scope:{source:'all'}};
 store.linkAcceptedSuggestionToTask('alice',suggestion,'task-1');
 return {db,completedAt};
}
test('retrospective projects equal-window aggregate evidence for the exact fixed cohort',async()=>{
 const {db,completedAt}=fixture();try{
  const now=Date.now(),calls=[];
  const result=await loadLinkedTaskEvidence({db,ownerId:'alice',suggestionId:'suggestion-1',
   executedAt:completedAt,now,snapshot:{snapshot_id:'snap-1',as_of:new Date(now).toISOString(),
    snapshot_cutoff:new Date(now).toISOString()},dependencies:{
    memberFacts:async(_snapshot,ids,period)=>{calls.push({ids,period});return {errors:{analysis:null,trade:null,account:null}}},
    memberMetrics:(_facts,members,period)=>({requested_users:members.length,unmatched_users:0,
     total:{users:2,analysis_users:period.start===calls[0]?.period.start?1:2,
      analysis_events:period.start===calls[0]?.period.start?4:9,analysis_days:3,
      trade_users:1,transactions:2,volume_usd:20,missing_values:0,excluded_trades:0}})
   }});
  assert.equal(result.status,'available');assert.equal(result.task.fixedAudienceCount,2);
  assert.equal(result.periods.days>=3,true);assert.ok(result.periods.baselineEnd<=completedAt-20*86400000);
  assert.ok(result.periods.effectStart>completedAt);
  assert.equal(result.periods.baselineEnd-result.periods.baselineStart,result.periods.effectEnd-result.periods.effectStart);
  assert.equal(result.metricChanges.analysis_events.available,true);
  assert.equal(result.metricChanges.analysis_events.direction,'up');
  assert.equal(calls.length,2);assert.deepEqual(calls[0].ids,['1001','1002']);
  assert.equal(JSON.stringify(result).includes('1001'),false);
 }finally{db.close()}
});
test('cohort evidence refuses a mismatched execution timestamp and never crosses owners',async()=>{
 const {db,completedAt}=fixture();try{
  const snapshot={snapshot_id:'snap-1',as_of:new Date().toISOString(),snapshot_cutoff:new Date().toISOString()};
  const mismatch=await loadLinkedTaskEvidence({db,ownerId:'alice',suggestionId:'suggestion-1',
   executedAt:completedAt+1,now:Date.now(),snapshot});
  assert.equal(mismatch.status,'unavailable');
  assert.equal(mismatch.reason,'task-and-suggestion-execution-time-mismatch');
  const otherOwner=await loadLinkedTaskEvidence({db,ownerId:'bob',suggestionId:'suggestion-1',
   executedAt:completedAt,now:Date.now(),snapshot});
  assert.equal(otherOwner.status,'not-linked');
 }finally{db.close()}
});
test('cohort evidence waits for three complete business days after task completion',async()=>{
 const {db,completedAt}=fixture();try{
  const now=completedAt+86400000;
  const result=await loadLinkedTaskEvidence({db,ownerId:'alice',suggestionId:'suggestion-1',
   executedAt:completedAt,now,snapshot:{snapshot_id:'snap-1',as_of:new Date(now).toISOString(),
    snapshot_cutoff:new Date(now).toISOString()}});
  assert.equal(result.status,'waiting');
  assert.equal(result.reason,'cohort-observation-window-not-mature');
 }finally{db.close()}
});

test('cohort evidence revalidates the suggestion source scope at review time',async()=>{
 const {db,completedAt}=fixture();try{
  const now=Date.now(),result=await loadLinkedTaskEvidence({db,ownerId:'alice',
   suggestionId:'suggestion-1',executedAt:completedAt,expectedSource:'twitter',now,
   snapshot:{snapshot_id:'snap-1',as_of:new Date(now).toISOString(),
    snapshot_cutoff:new Date(now).toISOString()}});
  assert.equal(result.status,'unavailable');
  assert.equal(result.reason,'task-and-suggestion-source-mismatch');
 }finally{db.close()}
});

test('cohort baseline window ends before task creation and effect window begins after completion',()=>{
 const now=Date.now(),task={created_at:now-30*86400000,completed_at:now-10*86400000};
 const periods=taskReviewPeriods(task,now);
 assert.ok(periods.baselineEnd<=task.created_at);
 assert.ok(periods.effectStart>task.completed_at);
 assert.equal(periods.baselineEnd-periods.baselineStart,periods.effectEnd-periods.effectStart);
 assert.equal(periods.baselineAnchor,'before-task-created');
 assert.equal(periods.effectAnchor,'after-task-completed');
});
