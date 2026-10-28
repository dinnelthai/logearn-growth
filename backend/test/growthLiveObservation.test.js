'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadObservation,scanFreeGrowth,sourceHealth,signals,channelContributions}=require('../src/ai/growth/liveObservation');
const DAY=86400000,now=Date.parse('2026-10-28T04:00:00Z');
const prevStart=Date.parse('2026-10-25T17:00:00Z'),currentStart=prevStart+DAY,end=currentStart+DAY;
const verified={snapshot_id:'snap-verified',snapshot_cutoff:new Date(end+3600000).toISOString(),
 history_complete:true,events_complete_through:new Date(end).toISOString()};
const incomplete={...verified,history_complete:false,events_complete_through:null};
const north={days:[
 {date:'2026-10-26',active_users:100,new_users:70,returning_users:30},
 {date:'2026-10-27',active_users:55,new_users:35,returning_users:20}
]};
const drivers={quality:'observed',rows:[
 {day:'2026-10-26',source:'seo',new_users:45,active_users:60,returning_users:15},
 {day:'2026-10-27',source:'seo',new_users:12,active_users:20,returning_users:7},
 {day:'2026-10-26',source:'x',new_users:25,active_users:40,returning_users:15},
 {day:'2026-10-27',source:'x',new_users:23,active_users:35,returning_users:13}
]};
function fetch(snapshot,channel=drivers){
 let northCalls=0,channelCalls=0;
 return {load:()=>loadObservation({now,remote:{status:async()=>snapshot},
  getNorthStar:async(start,stop,source,context)=>{
   northCalls++;assert.equal(start,prevStart);assert.equal(stop,end);
   assert.equal(source,'all');assert.equal(context.snapshot_id,snapshot.snapshot_id);
   return north;
  },
  getChannels:async()=>{channelCalls++;return channel}
 }),calls:()=>({northCalls,channelCalls})};
}
test('raw Hologres defaults to observational mode; no model or alert is started',async()=>{
 const f=fetch(incomplete),cache=new Map(),saved=[];
 const store={observe:async()=>{throw Error('unverified data cannot create alerts')}};
 const one=await scanFreeGrowth({ownerId:'alice',goal:'activation',now,store,cache,load:f.load});
 const two=await scanFreeGrowth({ownerId:'alice',goal:'retention',now,store,cache,load:f.load});
 assert.equal(one.status,'coverage-unverified');assert.equal(two.status,'coverage-unverified');
 assert.equal(one.observed,0);assert.equal(one.paidCalls,0);
 assert.equal(one.current.new_users,35);assert.equal(one.baseline.new_users,70);
 assert.equal(one.changes[1].delta,-35);
 assert.equal(one.changes[1].bySource[0].source,'seo');
 assert.equal(one.changes[1].bySource[0].delta,-33);
 assert.deepEqual(f.calls(),{northCalls:1,channelCalls:1});
});
test('only attested source days create deduplicable evidence-backed alerts and manual proposals',async()=>{
 const f=fetch(verified),observed=[],proposed=[];
 const result=await scanFreeGrowth({ownerId:'alice',goal:'activation',now,
  store:{observe:async(owner,signal)=>{observed.push(signal);return {id:'alert-'+observed.length,last_period_end:signal.periodEnd}}},
  proposalStore:{propose:async(_,alert)=>{proposed.push(alert);return {id:'proposal'}}},
  load:f.load});
 assert.equal(result.status,'scanned');assert.equal(result.newObservations,2);
 assert.equal(result.proposedInvestigations,1);
 assert.equal(observed[0].metric,'active_users');
 assert.equal(observed[1].metric,'new_users');
 assert.equal(observed[0].evidence.origin,'hologres-source-observation');
 assert.equal(observed[1].evidence.channelBreakdown[0].source,'seo');
 assert.equal(result.paidCalls,0);
});
test('source quality requires both history and a proven complete watermark',()=>{
 assert.equal(sourceHealth(incomplete,end).complete,false);
 assert.equal(sourceHealth({...verified,events_complete_through:new Date(end-1).toISOString()},end).complete,false);
 assert.equal(sourceHealth(verified,end).complete,true);
});
test('day comparison does not mix channels or treat negative/immature counts as valid',async()=>{
 assert.deepEqual(channelContributions({quality:'truncated',rows:drivers.rows},
  '2026-10-26','2026-10-27','new_users'),[]);
 const base={start:prevStart,end:currentStart,totals:{active_users:19,new_users:19,returning_users:0}};
 const curr={start:currentStart,end,totals:{active_users:0,new_users:0,returning_users:0}};
 assert.deepEqual(signals({ownerId:'a',goal:'activation',health:sourceHealth(verified,end),
  baseline:base,current:curr}),[]);
 const loaded=fetch(verified,{quality:'truncated',rows:[]});
 const observation=await loaded.load();
 assert.equal(observation.channels.quality,'truncated');
});
