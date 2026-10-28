'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {discover,questionDecision}=require('../src/ai/growth/workspace/discovery');
const start=Date.parse('2026-10-13T17:00:00Z'),end=Date.parse('2026-10-20T17:00:00Z');
function e(id,value,start,end,state='verified'){return {id,state,value,source:'existing-product-rollup',definitionVersion:'1',period:{start,end,timezone:'Asia/Bangkok'},observedAt:end,coverage:{status:'full'},watermarks:{events:end}}}
function fixture(){const db=new DatabaseSync(':memory:');return {db,s:workspaceStore(db,{clock:()=>end+1000,initialize:true})}}
test('business decline becomes a durable problem with evidence and exact owner, not a causal claim',()=>{
 const {db,s}=fixture();try{
 s.saveEvidence('alice',e('old',100,start,start+86400000));s.saveEvidence('alice',e('new',60,end-86400000,end));
 const input={signals:[{subject:'首次有效分析',metricId:'active_users',baselineEvidenceId:'old',currentEvidenceId:'new',threshold:0.2}]};
 const a=discover('alice',s,input);assert.equal(a.created.length,1);assert.equal(s.problems('alice')[0].type,'business');
 const b=discover('alice',s,input);assert.equal(b.created.length,0);assert.equal(b.updated.length,1);
 assert.equal(s.problemEvents('alice',a.created[0].id)[0].evidenceIds.length,2);
 assert.equal(s.problems('bob').length,0);
 }finally{db.close()}
});
test('immature and partial business data cannot generate a false decline',()=>{
 const {db,s}=fixture();try{
 s.saveEvidence('alice',e('old',100,start,start+86400000));s.saveEvidence('alice',e('pending',null,end-86400000,end,'immature'));
 assert.equal(discover('alice',s,{signals:[{subject:'留存',baselineEvidenceId:'old',currentEvidenceId:'pending'}]}).created.length,0);
 assert.equal(s.problems('alice').length,0);
 }finally{db.close()}
});
test('unknown coverage and disconnected API remain trackable data questions without fake zero',()=>{
 const {db,s}=fixture();try{
 const a=discover('alice',s,{sources:[{id:'x',state:'not-configured'},{id:'youtube',state:'unknown'}]});
 assert.equal(a.created.length,1);assert.match(s.problems('alice')[0].description,/不能推断无用户或无转化/);
 assert.equal(s.problems('alice')[0].impact.status,'unknown');
 }finally{db.close()}
});
test('agent asks only if stored facts and authorized tools cannot resolve missing business information',()=>{
 assert.equal(questionDecision({missingBusinessAnswer:true,canLookup:true}).ask,false);
 assert.equal(questionDecision({missingBusinessAnswer:true,previousAnswer:'yes'}).reuseAnswer,true);
 assert.equal(questionDecision({missingBusinessAnswer:true,canLookup:false,blocking:false}).blocking,false);
});
