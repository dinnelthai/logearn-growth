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

test('a failed read-only investigation is not blindly retried against the same immutable evidence',()=>{
 const f=setup();try{
  f.store.saveEvidence('alice',evidence('base',100,start));
  f.store.saveEvidence('alice',evidence('current',50,start+DAY));
  const p=f.store.observeProblem('alice',{type:'business',subject:'decline',
   scope:{source:'all'},evidenceIds:['base','current']});
  const first=f.store.executiveInvestigationStart('alice',p.id,'current');
  assert.equal(first.state,'running');
  assert.equal(f.store.executiveInvestigationFail('alice',first.id).state,'failed');
  const again=f.store.executiveInvestigationStart('alice',p.id,'current');
  assert.equal(again.reused,true);
  assert.equal(again.id,first.id);
  assert.equal(again.state,'failed');
 }finally{f.close()}
});
test('success requires verified external evidence, not only status=ok',()=>{
 const f=setup();try{
  f.store.saveEvidence('alice',evidence('base',100,start));
  f.store.saveEvidence('alice',evidence('current',50,start+DAY));
  const p=f.store.observeProblem('alice',{type:'business',subject:'decline',
   scope:{source:'all'},evidenceIds:['base','current']});
  const run=f.store.executiveInvestigationStart('alice',p.id,'current');
  const saved=f.store.executiveInvestigationFinish('alice',run.id,
   {sourceEvidenceId:'current',steps:[{moduleId:'growth.activation',status:'ok'}],evidenceIds:[]},
   {verifyExternalEvidence:()=>true});
  assert.equal(saved.result.status,'partial');
 }finally{f.close()}
});

test('investigation plans differ for new versus returning analysis users',()=>{
 const {investigationQuestions}=require('../src/ai/growth/workspace/executiveInvestigation');
 assert.deepEqual(investigationQuestions('new_users').map(x=>x.moduleId),
  ['growth.acquisition','growth.activation','growth.login']);
 assert.deepEqual(investigationQuestions('returning_users').map(x=>x.moduleId),
  ['growth.retention','growth.activation','growth.quality']);
 assert.deepEqual(investigationQuestions('unknown_metric'),[]);
});
test('source comparisons reject mismatched provenance and non-adjacent windows',()=>{
 const {evidenceForProblem}=require('../src/ai/growth/workspace/executiveInvestigation');
 const f=setup();try{
  f.store.saveEvidence('alice',evidence('one',100,start));
  f.store.saveEvidence('alice',{...evidence('two',50,start+DAY),source:'other-source'});
  const p=f.store.observeProblem('alice',{type:'business',subject:'incompatible',
   scope:{source:'all'},evidenceIds:['one','two']});
  assert.equal(evidenceForProblem(f.store,'alice',p.id),null);
  f.store.saveEvidence('alice',evidence('three',50,start+5*DAY));
  const q=f.store.observeProblem('alice',{type:'business',subject:'non-adjacent',
   scope:{source:'all'},evidenceIds:['one','three']});
  assert.equal(evidenceForProblem(f.store,'alice',q.id),null);
 }finally{f.close()}
});
test('investigations retain the module-linked hypothesis evidence without claiming causality',async()=>{
 const f=setup();try{
  f.store.saveEvidence('alice',evidence('baseline',100,start));
  f.store.saveEvidence('alice',evidence('recent',50,start+DAY));
  const p=f.store.observeProblem('alice',{type:'business',subject:'active_users:drop',
   scope:{source:'all'},evidenceIds:['baseline','recent'],priority:5});
  const reg={
   listBusinessModules:()=>['growth.acquisition','growth.activation','growth.quality']
    .map(id=>({moduleId:id,status:'available',version:'1',description:id,
     capabilities:[{id:id==='growth.acquisition'?'get_channels':id==='growth.activation'?
       'get_funnel':'check_data_quality',cost:'free',version:'1'}]})),
   executeBusinessModule:async req=>({
    status:req.moduleId==='growth.quality'?'unavailable':'ok',
    evidenceIds:req.moduleId==='growth.quality'?[]:[req.moduleId+'-e'],
    coverage:{status:'partial'}})
  };
  const result=await investigateOwner({store:f.store,ownerId:'alice',now,registry:reg,
   verifyExternalEvidence:(_owner,id)=>id.endsWith('-e')});
  assert.equal(result.status,'partial');
  const saved=f.store.run('alice',result.runId).result;
  assert.equal(saved.hypotheses.length,3);
  assert.equal(saved.hypotheses[0].status,'observed-not-causal');
  assert.equal(saved.hypotheses[0].causalityEstablished,false);
  assert.equal(saved.hypotheses[2].status,'blocked');
  assert.equal(saved.hypotheses[0].agentEvidenceIds.length,1);
  assert.equal(f.store.executiveQueue('alice').investigations.length,1);
 }finally{f.close()}
});
