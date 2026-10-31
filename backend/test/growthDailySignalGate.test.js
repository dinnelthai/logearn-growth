'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planDailyPaidAnalysis}=require('../src/ai/growth/dailySignalGate');
const {tickAutonomousOwner}=require('../src/ai/growth/agentAutonomy');
const now=Date.parse('2026-10-27T05:00:00Z'),end=Date.parse('2026-10-26T17:00:00Z'),start=end-86400000;
function report(goal,{complete=true,candidates=[],warnings=[]}={}){
 return {version:'business-evidence-v1',focusGoal:goal,business:{scope:{source:'all'}},period:{start,end},candidates,
  snapshot:{id:'s1',historyComplete:complete,
   eventsCompleteThrough:complete?new Date(end).toISOString():null},
  current:{totals:{active_users:100}},previous:{totals:{active_users:100}},
  growth:{channels:[{eligible:40,activation_rate:1,d7:{eligible:40,rate:1}}],
   quality:{truncated:false}},warnings};
}
test('mature quiet days skip core goals but preserve specialist analysis',()=>{
 const goals=['activation','retention','conversion','revenue'];
 const reports=Object.fromEntries(goals.map(g=>[g,report(g)]));
 const plan=planDailyPaidAnalysis({reports,goals,period:{start,end},source:'all'});
 assert.deepEqual(plan.skipped,['activation','retention']);
 assert.deepEqual(plan.dispatched,['conversion','revenue']);
});
test('unknown coverage is deferred; strong observed signal is dispatched',()=>{
 const big=report('activation',{candidates:[{metric:'active_users',id:'active_users',
  priority:'P1',score:85,current:200,previous:100,absolute:100,change:1}]});
 const unknown=report('retention',{complete:false});
 const plan=planDailyPaidAnalysis({reports:{activation:big,retention:unknown},
  goals:['activation','retention'],period:{start,end}});
 assert.equal(plan.decisions.activation.status,'dispatch');
 assert.equal(plan.decisions.retention.status,'deferred');
});
function fixture(){
 const state={rows:[],queued:0,brief:null,preflight:0};
 const store={dailyAnalyses:async()=>state.rows,feedback:async()=>[],
  upsertJudgements:async()=>{},saveStrategy:async()=>{throw Error('unexpected learning')},getStrategy:async()=>null,targets:async()=>[],
  upsertBrief:async(_o,brief)=>{state.brief=brief;return {id:'b',status:brief.status}}};
 const records={createAnalysisRecord:async input=>{
  const row={id:'analysis-'+(state.rows.length+1),status:'pending',
   date_range_start:input.dateRangeStart,date_range_end:input.dateRangeEnd,
   business_scope:input.businessScope,user_question:input.userQuestion,
   filter_conditions:input.filterConditions,data_snapshot:input.dataSnapshot};
  state.rows.push(row);return row;
 }};
 return {state,store,records,enqueue:async()=>{state.queued++;return {id:'job'}}};
}
test('opt-in daily scheduler preflights once and enqueues only eligible goals',async()=>{
 const x=fixture(),goals=['activation','retention','conversion','revenue'];
 const value=await tickAutonomousOwner({ownerId:'alice',now,goals,
  allowPaidDispatch:true,signalGateEnabled:true,
  store:x.store,records:x.records,enqueue:x.enqueue,
  preflight:async params=>{
   x.state.preflight++;assert.equal(params.start,start);assert.equal(params.end,end);
   return Object.fromEntries(goals.map(g=>[g,report(g)]));
  }});
 assert.equal(x.state.preflight,1);assert.equal(x.state.queued,2);
 assert.equal(value.signalDecisions.length,4);
 assert.equal(value.enqueued.filter(e=>e.status==='skipped-no-verified-signal').length,2);
 assert.equal(x.state.brief.report.signalGate.version,'daily-signal-gate-v1');
});
test('preflight failure does not dispatch paid calls or certify a clean day',async()=>{
 const x=fixture();
 const out=await tickAutonomousOwner({ownerId:'alice',now,goals:['activation'],
  allowPaidDispatch:true,signalGateEnabled:true,store:x.store,
  records:x.records,enqueue:x.enqueue,preflight:async()=>{throw Error('source error')}});
 assert.equal(x.state.queued,0);
 assert.equal(out.enqueued[0].status,'deferred-evidence-quality');
 assert.equal(out.status,'blocked');assert.equal(out.score,null);
});

test('missing mature samples defer payment rather than producing a false quiet day',()=>{
 const incomplete=report('activation');
 incomplete.growth.channels=[];
 const plan=planDailyPaidAnalysis({reports:{activation:incomplete},
  goals:['activation'],period:{start,end}});
 assert.equal(plan.decisions.activation.status,'deferred');
 assert.equal(plan.decisions.activation.reason,'insufficient-mature-samples');
});

test('paid autonomy uses fail-closed signal preflight by default',async()=>{
 const x=fixture();
 const previous=process.env.AI_AUTONOMY_SIGNAL_GATE_ENABLED;
 delete process.env.AI_AUTONOMY_SIGNAL_GATE_ENABLED;
 try{
  const out=await tickAutonomousOwner({ownerId:'alice',now,goals:['activation'],
   allowPaidDispatch:true,store:x.store,records:x.records,enqueue:x.enqueue,
   preflight:async()=>{throw Error('missing data')}});
  assert.equal(x.state.queued,0);
  assert.equal(out.enqueued[0].status,'deferred-evidence-quality');
 }finally{
  if(previous===undefined)delete process.env.AI_AUTONOMY_SIGNAL_GATE_ENABLED;
  else process.env.AI_AUTONOMY_SIGNAL_GATE_ENABLED=previous;
 }
});

test('irrelevant optional source warnings do not cancel verified activation signals',()=>{
 const active=report('activation',{warnings:['周核心指标不可用：查询超时'],
  candidates:[{metric:'active_users',id:'a',priority:'P1',absolute:40,change:-0.4}]});
 const scheduled=planDailyPaidAnalysis({reports:{activation:active},goals:['activation'],period:{start,end}});
 assert.equal(scheduled.decisions.activation.status,'dispatch');
 assert.equal(scheduled.decisions.activation.nonBlockingWarningCount,1);
 active.growth.quality.lag_ms=7200000;
 assert.equal(planDailyPaidAnalysis({reports:{activation:active},goals:['activation'],period:{start,end}})
  .decisions.activation.status,'deferred');
});
