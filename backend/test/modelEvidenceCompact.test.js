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
