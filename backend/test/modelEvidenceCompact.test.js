'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {forModel}=require('../src/ai/business/modelEvidence');
test('small tool results are projected without mutating original evidence',()=>{
 const input={status:'ok',evidence:[{id:'e',metricId:'active_users',value:12}]};
 const before=JSON.stringify(input);const projected=forModel(input);
 assert.notEqual(projected,input);
 assert.equal(projected.evidence[0].value,12);
 assert.equal(projected.evidence[0].id,'e');
 assert.equal(JSON.stringify(input),before);
});
test('large tool results are a bounded transport view with provenance and quality',()=>{
 const original={status:'ok',evidence:[{id:'e1',metricId:'funnel',definitionVersion:'1',
  value:{rows:Array.from({length:1000},(_,i)=>({segment:i,data:'a'.repeat(200)})),total:1000},
  period:{start:1,end:2},coverage:{status:'partial'},sourceVersions:{events:'v1'},
  watermarks:{events:'2026-10-27'},warnings:['coverage unknown']}],warnings:[]};
 const before=JSON.stringify(original),after=forModel(original,{maxBytes:6000});
 assert.equal(JSON.stringify(original),before);
 assert.equal(after.evidence[0].id,'e1');
 assert.equal(after.evidence[0].metricId,'funnel');
 assert.equal(after.evidence[0].coverage.status,'partial');
 assert.ok(Buffer.byteLength(JSON.stringify(after))<6000);
 assert.ok(after.warnings.length);
});

test('compact investigation preserves reported source clock while refusing complete-freshness inference',()=>{
 const {makeEvidence}=require('../src/ai/business/evidence');
 const context={ownerId:'alice',scope:{source:'all'},
  period:{start:Date.parse('2026-10-01T00:00:00Z'),
   end:Date.parse('2026-10-08T00:00:00Z'),timezone:'Asia/Bangkok'}};
 const e=makeEvidence({metricId:'seo_search',query:{tool:'get_seo_performance'},
  value:{metrics:{clicks:6}},coverage:{status:'partial',periodMatched:false},
  sourceVersions:{searchConsole:'snapshot-1'},
  watermarks:{searchConsole:'2026-10-08T02:00:00Z',events:null}},context);
 const out=forModel({status:'ok',evidence:[e]},{projectionVersion:'v4',maxBytes:3500});
 assert.equal(out.evidence[0].sourceMetadata.sourceType,'search_source_unknown');
 assert.equal(out.evidence[0].sourceMetadata.clock,'pt_calendar_snapshot');
 assert.equal(out.evidence[0].sourceMetadata.freshness.status,'unverified');
 assert.equal(out.evidence[0].sourceMetadata.freshness.referenceAt,'2026-10-08T02:00:00.000Z');
 assert.equal(out.evidence[0].sourceMetadata.freshness.reportedCompleteThrough,null);
 assert.equal(out.evidence[0].coverage.periodMatched,false);
 assert.ok(Buffer.byteLength(JSON.stringify(out))<=3500);
});

test('weekly projection preserves bounded operations, registration cohorts and source freshness',()=>{
 const privateId='user:private-123';
 const result=forModel({status:'ok',evidence:[{
  id:'weekly-rich',metricId:'activities',unit:'users',
  value:{
   humanOperations:[{kind:'growth_activity',source:'growth_activities',
    assignments:[{group:'treatment',assigned:4,delivered:3,
     sent_unconfirmed:0,not_delivered:0,delivery_unknown:1,cross_exposed:1}],
    outcome:{summary:{completed:2,eligible:4},
     performance:{trade_users:1,transactions:2,volume_usd:12}}}],
   cohorts:{registration:{available:true,
    metrics:{users:20,eligible:15,activated:9,pending:5,rate:.6},
    engagement:{eligible:15,chip_analysis_users:8,holder_view_users:5},
    trade:{available:true,conversion_rate:.25,traders:3,eligible:12,pending:4}}},
   channels:[{source:'seo',users:17,visits:100,memberIds:[privateId]}],
   rows:[{user_id:privateId}]
  },
  period:{start:100,end:200,timezone:'Asia/Bangkok'},
  coverage:{status:'partial',periodMatched:true,historyComplete:false},
  sourceMetadata:{sourceType:'event_snapshot',clock:'event_time',scope:'all',
   coverageStatus:'partial',freshness:{status:'unverified',
    referenceAt:'2026-10-30T00:00:00.000Z',reportedCompleteThrough:null}},
  watermarks:{events:'2026-10-30T00:00:00.000Z',eventsCompleteThrough:null}
 }]},{projectionVersion:'v4',maxBytes:3500});
 const e=result.evidence[0];
 assert.equal(e.value.humanOperations[0].assignments[0].delivered,3);
 assert.equal(e.value.cohorts.registration.metrics.activated,9);
 assert.equal(e.value.cohorts.registration.engagement.chip_analysis_users,8);
 assert.equal(e.value.channels[0].users,17);
 assert.equal(e.sourceMetadata.freshness.status,'unverified');
 assert.equal(e.coverage.periodMatched,true);
 assert.equal(e.watermarks.eventsCompleteThrough,null);
 assert.ok(!JSON.stringify(e).includes(privateId));
});
