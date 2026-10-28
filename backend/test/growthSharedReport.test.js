'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createService}=require('../src/services/businessReport');
test('four goal reports reuse one snapshot and one set of read-only metric facts',async()=>{
 const start=Date.parse('2026-10-25T17:00:00Z'),end=start+86400000;
 const calls={status:0,north:0,growth:0,weekly:0};
 const snapshot={snapshot_id:'stable',as_of:new Date(end+5000).toISOString(),
  snapshot_cutoff:'cutoff',history_complete:true,events_complete_through:new Date(end).toISOString()};
 const service=createService({remote:{status:async()=>{calls.status++;return snapshot}},
  evidence:{
   fetchNorthStar:async(a,b,source,s)=>{calls.north++;assert.equal(s,snapshot);
    return {totals:{active_users:10,new_users:4,returning_users:6}}},
   fetchGrowthInsights:async()=>{calls.growth++;return {quality:{history_complete:true},channels:[]}},
   fetchWeeklyCore:async()=>{calls.weekly++;return {available:true,users:10}}
  }});
 const goals=['activation','retention','conversion','revenue'];
 const reports=await service.buildMany({start,end,goals,businessScope:{source:'all'}});
 assert.deepEqual(calls,{status:1,north:2,growth:1,weekly:1});
 for(const goal of goals){
  assert.equal(reports[goal].focusGoal,goal);
  assert.equal(reports[goal].business.scope.source,'all');
  assert.equal(reports[goal].snapshot.id,'stable');
  assert.equal(reports[goal].candidates[0].goal,goal);
 }
});
