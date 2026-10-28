'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareDailySnapshots}=require('../src/ai/growth/crossDay');
const {scanDailyAlerts}=require('../src/ai/growth/monitor');
const DAY=86400000,OFFSET=7*3600000;
const end1=Date.parse('2026-10-25T17:00:00Z'),end2=end1+DAY;
function report(id,start,end,users,overrides={}){
 const context={
  period:{start,end},business:{scope:{source:'all'}},focusGoal:'activation',
  snapshot:{id:'snap-'+id,asOf:new Date(end+3600000).toISOString(),
   eventsCompleteThrough:new Date(end).toISOString(),historyComplete:true},
  current:{totals:{active_users:users,new_users:20,returning_users:20}},
  growth:{quality:{truncated:false}}
 };
 return {id,owner_id:'owner-a',status:'completed',date_range_start:start,date_range_end:end,
  business_scope:{source:'all'},filter_conditions:{dailySchedule:'v1',focusGoal:'activation'},
  data_snapshot:{...context,...overrides}};
}
const p=report('one',end1-DAY,end1,100),c=report('two',end1,end2,55);
test('adjacent completed matching daily snapshots produce bounded evidence-rich signals',()=>{
 const old=JSON.stringify([p,c]);const result=compareDailySnapshots(p,c);
 assert.equal(result.comparable,true);assert.equal(result.signals.length,1);
 assert.equal(result.signals[0].metric,'active_users');
 assert.equal(result.signals[0].priority,'P0');
 assert.equal(result.signals[0].absolute,-45);
 assert.equal(result.signals[0].evidence.currentAnalysisId,'two');
 assert.equal(result.signals[0].causality,'unproven');
 assert.equal(JSON.stringify([p,c]),old);
});
test('missing complete watermark, mismatched source, goal, owner and nonadjacent windows block',()=>{
 const poor=report('poor',end1,end2,50,{snapshot:{...c.data_snapshot.snapshot,historyComplete:false}});
 assert.equal(compareDailySnapshots(p,poor).comparable,false);
 const badWatermark=report('late',end1,end2,50,{snapshot:{...c.data_snapshot.snapshot,
  eventsCompleteThrough:new Date(end2-1000).toISOString()}});
 assert.equal(compareDailySnapshots(p,badWatermark).reason,'incomplete-data-coverage');
 assert.equal(compareDailySnapshots(p,{...c,owner_id:'other'}).reason,'incompatible-period-or-scope');
 assert.equal(compareDailySnapshots(p,{...c,business_scope:{source:'twitter'}}).comparable,false);
 assert.equal(compareDailySnapshots(p,report('skip',end2,end2+DAY,40)).comparable,false);
});
test('small baselines, missing totals and near-zero changes never become a false anomaly',()=>{
 const low=report('low',end1-DAY,end1,8);
 assert.equal(compareDailySnapshots(low,c).signals.length,0);
 const similar=report('same',end1,end2,96);
 assert.equal(compareDailySnapshots(p,similar).signals.length,0);
 const missing=report('missing',end1,end2,65,{current:{totals:{}}});
 assert.equal(compareDailySnapshots(p,missing).signals.length,0);
 assert.throws(()=>compareDailySnapshots(p,c,{minFraction:0}),/阈值/);
});
test('scanner uses existing reports and produces no paid calls or duplicate jobs',async()=>{
 const observed=[],store={
  completedDays:async(owner,source,goal,limit)=>{
   assert.equal(owner,'owner-a');assert.equal(source,'all');
   assert.equal(goal,'activation');assert.equal(limit,2);return [c,p];
  },
  observe:async(owner,signal)=>{observed.push({owner,signal});return {id:'alert-'+observed.length}}
 };
 const result=await scanDailyAlerts({ownerId:'owner-a',store,now:end2+DAY});
 assert.equal(result.status,'scanned');assert.equal(result.newObservations,1);
 assert.equal(observed.length,1);
 assert.equal((await scanDailyAlerts({ownerId:'owner-a',store:{
  ...store,completedDays:async()=>[c]
 }})).status,'insufficient-history');
});

test('activation and retention reports do not mint duplicate alerts for the same count',()=>{
 const base={active_users:120,new_users:60,returning_users:60};
 const observed={active_users:60,new_users:30,returning_users:30};
 const withGoal=(id,start,end,goal,totals)=>{
  const row=report(id,start,end,totals.active_users);
  row.filter_conditions.focusGoal=goal;
  row.data_snapshot.focusGoal=goal;
  row.data_snapshot.current.totals=totals;
  return row;
 };
 const activation=compareDailySnapshots(
  withGoal('a1',end1-DAY,end1,'activation',base),
  withGoal('a2',end1,end2,'activation',observed));
 const retention=compareDailySnapshots(
  withGoal('r1',end1-DAY,end1,'retention',base),
  withGoal('r2',end1,end2,'retention',observed));
 assert.deepEqual(activation.signals.map(s=>s.metric).sort(),['active_users','new_users']);
 assert.deepEqual(retention.signals.map(s=>s.metric),['returning_users']);
 assert.equal(new Set([...activation.signals,...retention.signals].map(s=>s.metric)).size,3);
 assert.ok([...activation.signals,...retention.signals].every(s=>s.causality==='unproven'));
});
