'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildGrowthInbox}=require('../src/ai/growth/inbox');
const NOW=Date.parse('2026-10-27T12:00:00Z');
test('inbox only lists actionable existing records with deterministic priority',()=>{
 const analyses=[{id:'failed-1',status:'failed',created_at:NOW-10000},{id:'good',status:'completed',created_at:NOW-10000},
  {id:'slow',status:'processing',created_at:NOW-7200000}];
 const suggestions=[
  {id:'approve',analysis_id:'good',priority:'P0',user_status:'pending',business_problem:'激活漏斗'},
  {id:'run',analysis_id:'good',priority:'P1',user_status:'executing',business_problem:'执行活动'},
  {id:'closed',priority:'P0',user_status:'rejected'}];
 const reviewEntries=[{suggestionId:'s',analysisId:'good',priority:'P1',title:'复盘',status:'ready'},
  {suggestionId:'wait',status:'waiting'}];
 const snapshot=JSON.stringify({analyses,suggestions,reviewEntries});
 const result=buildGrowthInbox({analyses,suggestions,reviewEntries,now:NOW});
 assert.equal(result.counts.total,5);
 assert.equal(result.counts.approval,1);
 assert.equal(result.counts.review,1);
 assert.equal(result.counts.failed,1);
 assert.equal(result.tasks[0].priority,'P0');
 assert.equal(result.readOnly,true);
 assert.equal(result.paidCalls,0);
 assert.equal(result.externalActions,0);
 assert.equal(JSON.stringify({analyses,suggestions,reviewEntries}),snapshot);
});
test('failed analyses cannot accidentally restart or mutate records',()=>{
 const tasks=buildGrowthInbox({analyses:[{id:'a',status:'failed'}],now:NOW}).tasks;
 assert.equal(tasks[0].status,'review-required');
 assert.match(tasks[0].guidance,/禁止/);
});
test('invalid inputs are rejected',()=>{
 assert.throws(()=>buildGrowthInbox({analyses:{},now:NOW}),/输入无效/);
 assert.throws(()=>buildGrowthInbox({now:NaN}),/输入无效/);
});

test('current major decline with a draft proposal creates one approval task instead of duplicate alert',()=>{
 const now=NOW;
 const alerts=[{id:'alert-1',status:'open',metric:'active_users',priority:'P0',
   last_period_end:1700000000000,snooze_until:null}];
 const proposals=[{id:'p1',alert_id:'alert-1',status:'proposed',period_end:1700000000000,
   last_period_end:1700000000000,alert_status:'open',priority:'P0',metric:'active_users'}];
 const original=JSON.stringify({alerts,proposals});
 const inbox=buildGrowthInbox({alerts,proposals,now});
 assert.equal(inbox.counts.proposalApprovals,1);
 assert.equal(inbox.counts.alerts,0);
 assert.deepEqual(inbox.tasks.map(t=>t.kind),['investigation-approval']);
 assert.equal(inbox.tasks[0].proposalId,'p1');
 assert.equal(JSON.stringify({alerts,proposals}),original);
});
test('approved proposal without linked analysis requires dispatch review, old proposals do not hide a fresh alert',()=>{
 const alert={id:'a',status:'open',metric:'active_users',priority:'P0',
   last_period_end:200,snooze_until:null};
 const current={id:'new',alert_id:'a',status:'approved',analysis_id:null,
   period_end:200,last_period_end:200,alert_status:'open',metric:'active_users'};
 let inbox=buildGrowthInbox({alerts:[alert],proposals:[current],now:NOW});
 assert.equal(inbox.counts.dispatchReview,1);
 assert.equal(inbox.counts.alerts,0);
 assert.equal(inbox.tasks[0].status,'needs-dispatch-review');
 inbox=buildGrowthInbox({alerts:[alert],proposals:[{...current,period_end:100}],now:NOW});
 assert.equal(inbox.counts.alerts,1);
 assert.equal(inbox.counts.dispatchReview,0);
 inbox=buildGrowthInbox({alerts:[alert],proposals:[{...current,status:'dismissed'}],now:NOW});
 assert.equal(inbox.counts.total,0);
});
test('acknowledged or snoozed proposals cannot request a fresh investigation',()=>{
 const base={id:'p',alert_id:'a',status:'proposed',period_end:200,
   last_period_end:200,alert_status:'acknowledged',metric:'active_users'};
 assert.equal(buildGrowthInbox({proposals:[base],now:NOW}).counts.total,0);
 assert.equal(buildGrowthInbox({proposals:[{...base,alert_status:'open',snooze_until:NOW+86400000}],now:NOW}).counts.total,0);
});
