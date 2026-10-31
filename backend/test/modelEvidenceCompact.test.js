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
