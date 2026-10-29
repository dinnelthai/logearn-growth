'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createOpportunityStore}=require('../src/ai/growth/opportunityStore');
const {scanModuleOpportunities,completedPeriod}=require('../src/ai/growth/moduleOpportunityScan');
const NOW=Date.parse('2026-10-29T10:00:00Z');
test('daily scan creates only evidence-backed gaps and reuses same window',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  createOpportunityStore(db,{initialize:true});
  const registry={
   listBusinessModules:()=>[
    {moduleId:'growth.acquisition',version:'1',status:'available',description:'channels',
      capabilities:[{id:'get_channels',version:'1',cost:'none'}]},
    {moduleId:'growth.activation',version:'1',status:'available',description:'funnel',
      capabilities:[{id:'get_funnel',version:'1',cost:'none'}]}],
   executeBusinessModule:async({moduleId})=>
    moduleId==='growth.acquisition'?{status:'ok',evidenceIds:['ev1'],
      definitionVersions:['1'],coverage:{status:'partial'}}:
     {status:'unavailable',evidenceIds:[],coverage:{status:'unknown'}}
  };
  const args={db,ownerId:'alice',now:NOW,registry,verifyEvidence:()=>true};
  const first=await scanModuleOpportunities(args);
  assert.equal(first.created.length,1);assert.equal(first.paidCalls,0);
  assert.equal(first.modelCalls,0);
  const second=await scanModuleOpportunities(args);
  assert.equal(second.created.length,0);assert.equal(second.updated.length,0);
  assert.equal(createOpportunityStore(db).list('alice').length,1);
  assert.equal(createOpportunityStore(db).list('bob').length,0);
 }finally{db.close()}
});
test('completed scan periods use last seven complete Bangkok days',()=>{
 const p=completedPeriod(NOW);
 assert.equal(p.timezone,'Asia/Bangkok');
 assert.equal(p.end-p.start,7*86400000);
 assert.ok(p.end<=NOW);
});
test('unavailable module with archived evidence creates a data gap, without inventing business impact',async()=>{
 const db=new DatabaseSync(':memory:');try{
  createOpportunityStore(db,{initialize:true});
  const registry={listBusinessModules:()=>[{moduleId:'growth.seo',version:'1',status:'available',description:'SEO',capabilities:[{id:'get_seo_performance',version:'1',cost:'none'}]}],
   executeBusinessModule:async()=>({status:'unavailable',evidenceIds:['ev-missing'],coverage:{status:'not-synced'}})};
  const result=await scanModuleOpportunities({db,ownerId:'alice',now:NOW,goal:'conversion',registry,verifyEvidence:()=>true});
  assert.equal(result.created.length,1);
  const item=createOpportunityStore(db).get('alice',result.created[0]);
  assert.equal(item.impact.affectedUsers,null);assert.match(item.issue,/not-synced/);
 }finally{db.close()}
});
