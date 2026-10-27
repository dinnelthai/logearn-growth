'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {scoreDaily}=require('../src/ai/growth/agentScore');
const {createDailyBrief}=require('../src/ai/growth/agentBrief');
const {judgeHistory,proposeStrategy}=require('../src/ai/growth/agentLearning');
const END=Date.parse('2026-10-26T17:00:00Z'),DAY=86400000;
const context=()=>({period:{start:END-DAY,end:END},business:{scope:{source:'all'}},
 focusGoal:'activation',snapshot:{id:'s1',historyComplete:true,
 asOf:new Date(END+1000).toISOString(),eventsCompleteThrough:new Date(END+1000).toISOString()},
 current:{totals:{active_users:100,new_users:50,returning_users:50}},
 growth:{channels:[{eligible:20,activated:10,d7:{eligible:10,returned:5}}],quality:{}},
 weekly:{available:true,users:30}});
test('mature KPI scoring requires explicit targets and proven watermark',()=>{
 let c=context();
 const target=[{id:'x',metric:'active_users',target:200,weight:1}];
 assert.equal(scoreDaily(c,target).score,50);
 assert.equal(scoreDaily(c,[]).score,null);
 c.snapshot.eventsCompleteThrough=new Date(END-1).toISOString();
 assert.equal(scoreDaily(c,target).score,null);
});
test('daily AI brief refuses an invented overall grade for incomplete goals',()=>{
 const c=context(),row={id:'run-1',status:'completed',
  filter_conditions:{focusGoal:'activation'},
  date_range_start:END-DAY,date_range_end:END,data_snapshot:c,
  result:{summary:'Observed signals',keyFindings:[],claims:[]}};
 const x=createDailyBrief({ownerId:'a',day:'2026-10-26',
  goals:['activation','retention'],analyses:[row],targets:[]});
 assert.equal(x.status,'partial');assert.equal(x.score.value,null);
 assert.equal(x.report.automatedExternalActions,0);
});
test('strategy policy only refocuses investigation and does not claim causal accuracy',()=>{
 const rows=[1,2,3].map(i=>({
  suggestion_id:'s'+i,retrospective_id:'r'+i,analysis_id:'a'+i,
  user_status:'executed',executed_at:END-10*DAY,reviewed_at:END-5*DAY,
  validation_metrics:{primary:'active_users'},metric_changes:{
   active_users:{available:true,baseline:100,effect:80}},
  confidence:'high',has_improvement:false,has_causality:false,
  filter_conditions:{focusGoal:'activation'},business_scope:{source:'all'}
 }));
 const j=judgeHistory(rows,{now:END});
 assert.equal(j.length,3);
 assert.deepEqual(proposeStrategy(j,{goal:'activation',source:'all'}).policy.focusMetrics,['active_users']);
});
