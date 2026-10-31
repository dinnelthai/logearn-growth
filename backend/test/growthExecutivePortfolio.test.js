'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {goalAlignment,opportunityPortfolio,shouldRepeatCandidate}=require('../src/ai/growth/workspace/executivePortfolio');
const {currentMonth}=require('../src/ai/growth/workspace/period');
const now=Date.parse('2026-10-31T05:00:00Z'),DAY=86400000;
test('monthly distinct target and independent daily Agent target are never equated or silently synced',()=>{
 const period=currentMonth(now);
 const goal={id:'g',metric_id:'active_users',definition_version:'1',kind:'north',
  target_value:1000,scope:{source:'all'},period_start:period.start,period_end:period.end};
 const x=goalAlignment([goal],[{metric:'active_users',source:'all',active:true,target:50}]);
 assert.equal(x.status,'distinct-period-goals');
 assert.equal(x.monthlyTarget,1000);
 assert.equal(x.dailyTarget,50);
 assert.equal(goalAlignment([goal],null).status,'agent-target-source-unavailable');
 assert.equal(goalAlignment([goal,goal],[]).status,'ambiguous-monthly-goal');
});
test('portfolio prioritizes verified North Star problems but never fabricates ROI or affected population',()=>{
 const db=new DatabaseSync(':memory:');try{
  const s=workspaceStore(db,{clock:()=>now,initialize:true});
  const gap=s.observeProblem('a',{type:'data-quality',subject:'GSC stale',scope:{source:'gsc'}});
  const p=s.observeProblem('a',{type:'business',subject:'active_users:decline',
   scope:{source:'all'},priority:5});
  const got=opportunityPortfolio('a',s);
  assert.equal(got.items[0].problemId,p.id);
  assert.equal(got.items[0].affectedUsers,null);
  assert.equal(got.items[0].expectedROI,null);
  assert.equal(got.items[1].problemId,gap.id);
  assert.deepEqual(opportunityPortfolio('b',s).items,[]);
 }finally{db.close()}
});
test('repeated negative outcomes only suppress the SAME action, not every experiment on a metric',()=>{
 const lessons=[
  {metricId:'active_users',action:'Repeat old action',outcome:'observed-decline'},
  {metricId:'active_users',action:'Repeat old action',outcome:'observed-decline'}];
 assert.equal(shouldRepeatCandidate('active_users',{lessons},'Repeat old action').propose,false);
 assert.equal(shouldRepeatCandidate('active_users',{lessons},'Investigate a new hypothesis').propose,true);
 assert.equal(shouldRepeatCandidate('active_users',{lessons},'').propose,true);
});
