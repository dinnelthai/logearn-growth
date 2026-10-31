'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {investigateOwner}=require('../src/ai/growth/workspace/executiveInvestigation');
const now=Date.parse('2026-10-31T05:00:00Z'),start=Date.parse('2026-10-29T17:00:00Z'),DAY=86400000;
function setup(){
 const db=new DatabaseSync(':memory:');
 const store=workspaceStore(db,{initialize:true,clock:()=>now});
 return {db,store,close:()=>db.close()};
}
function evidence(id,value,from){
 return {id,source:'hologres-north-star',metricId:'active_users',definitionVersion:'1',
 unit:'users',scope:{source:'all'},state:'verified',value,
 period:{start:from,end:from+DAY,timezone:'Asia/Bangkok'},
 observedAt:now,coverage:{status:'verified'},watermarks:{events:now}};
}
test('owner-scoped autonomous research deduplicates verified snapshot, never uses model or paid tools',async()=>{
 const f=setup();try{
  f.store.saveEvidence('alice',evidence('base',100,start));
  f.store.saveEvidence('alice',evidence('current',50,start+DAY));
  const p=f.store.observeProblem('alice',{type:'business',subject:'analysis decline',
   scope:{source:'all'},description:'已验证下降',priority:5,evidenceIds:['base','current']});
  let calls=0;
  const registry={
   listBusinessModules:()=>['growth.activation','growth.acquisition','growth.quality']
    .map(id=>({moduleId:id,version:'1',status:'available',description:id,
     capabilities:[{id:id==='growth.activation'?'get_funnel':id==='growth.acquisition'?'get_channels':'check_data_quality',
      version:'1',cost:'free'}]})),
   executeBusinessModule:async req=>{calls++;return {status:'ok',evidenceIds:['ext-e1'],
    coverage:{status:'available'}}}
  };
  const run=()=>investigateOwner({store:f.store,ownerId:'alice',now,registry,
   verifyExternalEvidence:(owner,id)=>owner==='alice'&&id==='ext-e1'});
  const first=await run();
  assert.equal(first.status,'evidence-collected');
  assert.equal(first.modelCalls+first.paidCalls+first.externalActions,0);
  assert.equal(calls,3);
  assert.equal(f.store.executiveInvestigationStart('alice',p.id,'current').reused,true);
  const again=await run();assert.equal(again.reused,true);assert.equal(calls,3);
  assert.equal(f.store.run('bob',first.runId),null);
 }finally{f.close()}
});
test('refuse forged cross-owner evidence and do not claim success',async()=>{
 const f=setup();try{
  f.store.saveEvidence('alice',evidence('b',100,start));
  f.store.saveEvidence('alice',evidence('c',50,start+DAY));
  const p=f.store.observeProblem('alice',{type:'business',subject:'decline',scope:{source:'all'},evidenceIds:['b','c']});
  const r=f.store.executiveInvestigationStart('alice',p.id,'c');
  assert.throws(()=>f.store.executiveInvestigationFinish('alice',r.id,{sourceEvidenceId:'c',steps:[{moduleId:'growth.quality',status:'ok'}],evidenceIds:['other-owner']},{
   verifyExternalEvidence:()=>false}),/未授权/);
  assert.equal(f.store.run('alice',r.id).state,'running');
 }finally{f.close()}
});
test('reminders dedupe, can acknowledge only owner records, and learning retains uncertainty',()=>{
 const f=setup();try{
  const p=f.store.observeProblem('alice',{type:'user',subject:'task',scope:{source:'all'}});
  const a=f.store.proposeActionOnce('alice',p.id,{description:'check funnel',assignee:'growth'});
  let r=f.store.executiveReminders('alice',{at:now+2*DAY,record:true});
  assert.equal(r.pending.length,1);
  assert.equal(f.store.executiveReminders('alice',{at:now+2*DAY,record:true}).pending.length,1);
  assert.equal(f.store.executiveReminders('bob',{at:now+2*DAY}).pending.length,0);
  assert.throws(()=>f.store.acknowledgeExecutiveNotice('bob',r.pending[0].id),/不存在/);
  assert.equal(f.store.acknowledgeExecutiveNotice('alice',r.pending[0].id).changed,true);
  assert.equal(f.store.executiveReminders('alice').pending.length,0);
  assert.equal(f.store.executiveLearning('alice').reviewed,0);
 }finally{f.close()}
});
