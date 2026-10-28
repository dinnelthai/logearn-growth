'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {importExistingEvidence}=require('../src/ai/growth/workspace/legacyEvidenceBridge');
test('archive existing owner-scoped evidence without promoting missing coverage to verified',()=>{
 const db=new DatabaseSync(':memory:');try{
 const s=workspaceStore(db,{initialize:true}),old={id:'e1',ownerId:'a',value:60,definitionVersion:'1',period:{start:1000,end:2000,timezone:'Asia/Bangkok'},
  coverage:{events:'partial'},watermarks:{events:'2026-10-27T00:00:00Z'},generatedAt:'2026-10-27T05:00:00Z'};
 assert.equal(importExistingEvidence(s,'a',old).value,null);
 assert.equal(importExistingEvidence(s,'a',old).state,'partial');
 assert.throws(()=>importExistingEvidence(s,'b',old),/不属于/);
 }finally{db.close()}
});
