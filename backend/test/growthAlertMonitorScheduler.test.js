'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {monitorConfig,tick}=require('../src/queues/workers/growthAlertMonitor');
const NOW=Date.parse('2026-10-28T02:00:00Z');
test('monitor defaults to the two core goal families, preserving legacy single-goal env',()=>{
 const base={AI_DAILY_OWNER_IDS:'alice,bob',AI_DAILY_SOURCE:'all'};
 assert.deepEqual(monitorConfig(base).goals,['activation','retention']);
 assert.deepEqual(monitorConfig({...base,AI_DAILY_GOAL:'activation'}).goals,['activation']);
 assert.deepEqual(monitorConfig({...base,AI_DAILY_GOAL:'activation',
  AI_GROWTH_ALERT_GOALS:'activation,retention'}).goals,['activation','retention']);
 assert.throws(()=>monitorConfig({...base,AI_GROWTH_ALERT_GOALS:'activation,activation'}),/只支持/);
 assert.throws(()=>monitorConfig({...base,AI_GROWTH_ALERT_GOALS:'revenue'}),/只支持/);
 assert.throws(()=>monitorConfig({...base,AI_DAILY_OWNER_IDS:'alice,alice'}),/唯一/);
});
test('daily monitor visits authorized owners and both goal families independently, without paid work',async()=>{
 const env={AI_DAILY_OWNER_IDS:'alice,bob',AI_GROWTH_ALERT_GOALS:'activation,retention',
  AI_DAILY_SOURCE:'seo'};
 const calls=[];
 const scanner=async({ownerId,goal,source,now,store,proposalStore})=>{
  calls.push({ownerId,goal,source,now});
  assert.equal(store.marker,'store');
  assert.equal(proposalStore.marker,'proposals');
  if(ownerId==='alice'&&goal==='retention')throw Error('temporary failure');
  return {status:'scanned',observed:1,newObservations:0};
 };
 const results=await tick({env,now:NOW,scanner,store:{marker:'store'},
  proposalStore:{marker:'proposals'}});
 assert.equal(results.length,4);
 assert.deepEqual(calls.map(x=>[x.ownerId,x.goal]),[
  ['alice','activation'],['alice','retention'],['bob','activation'],['bob','retention']
 ]);
 assert.equal(results.filter(x=>x.status==='error').length,1);
 assert.ok(results.every(x=>x.source==='seo'||x.status==='error'));
 assert.equal(results.filter(x=>x.newObservations>0).length,0);
});
test('dry-run never reads the database or starts a scanner',async()=>{
 let calls=0;
 const results=await tick({dryRun:true,now:NOW,
  env:{AI_DAILY_OWNER_IDS:'alice',AI_GROWTH_ALERT_GOALS:'activation,retention'},
  scanner:async()=>{calls++;throw Error('must not scan')}});
 assert.equal(calls,0);
 assert.deepEqual(results.map(x=>x.goal),['activation','retention']);
 assert.ok(results.every(x=>x.status==='dry-run'));
});
