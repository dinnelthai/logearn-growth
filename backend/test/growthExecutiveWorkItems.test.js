'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const now=Date.parse('2026-10-31T05:00:00Z'),DAY=86400000;
test('accepted actions produce durable, ordered, owner-scoped internal work items',()=>{
 const db=new DatabaseSync(':memory:');try{
  const s=workspaceStore(db,{initialize:true,clock:()=>now});
  const p=s.observeProblem('alice',{type:'business',subject:'Investigate source decline',
   scope:{source:'all'},priority:5});
  const action=s.proposeActionOnce('alice',p.id,{description:'Check activation',assignee:'growth'});
  assert.equal(s.ensureExecutiveWorkItems('alice',action.id).length,0,'cannot plan unapproved external execution');
  s.updateAction('alice',action.id,'accepted');
  const steps=s.ensureExecutiveWorkItems('alice',action.id);
  assert.equal(steps.length,3);
  assert.equal(steps.filter(x=>x.status==='ready').length,1);
  assert.equal(s.ensureExecutiveWorkItems('alice',action.id).length,3);
  assert.equal(s.workItems('bob').length,0);
  const first=steps.find(x=>x.step==='verify-evidence');
  assert.throws(()=>s.completeExecutiveWorkItem('alice',first.id),/证据/);
  s.saveEvidence('alice',{id:'evidence',source:'test',metricId:'active_users',
   unit:'users',definitionVersion:'1',state:'verified',value:42,scope:{source:'all'},
   period:{start:now-2*DAY,end:now-DAY,timezone:'Asia/Bangkok'},observedAt:now});
  assert.equal(s.completeExecutiveWorkItem('alice',first.id,{evidenceId:'evidence'}).status,'completed');
  assert.equal(s.workItems('alice').filter(x=>x.status==='ready').length,1);
  const prep=s.workItems('alice').find(x=>x.step==='prepare-execution');
  assert.throws(()=>s.completeExecutiveWorkItem('alice',prep.id),/不能为空/);
  assert.equal(s.completeExecutiveWorkItem('alice',prep.id,{note:'Ready to approve'}).status,'completed');
  assert.equal(s.workItems('alice').find(x=>x.step==='record-outcome').status,'ready');
  const r=s.executiveReminders('alice',{at:now+6*DAY,record:true});
  assert.ok(r.pending.some(x=>x.kind==='workitem-overdue'));
  assert.equal(s.executiveReminders('alice',{at:now+6*DAY,record:true}).pending.length,r.pending.length);
 }finally{db.close()}
});

test('the final outcome step requires a real executed action and after-execution evidence',()=>{
 const db=new DatabaseSync(':memory:');try{
  const s=workspaceStore(db,{initialize:true,clock:()=>now});
  const p=s.observeProblem('alice',{type:'business',subject:'decline',scope:{source:'all'}});
  const a=s.proposeActionOnce('alice',p.id,{description:'Investigation',assignee:'growth',
   metricId:'active_users',definitionVersion:'1'});
  s.updateAction('alice',a.id,'accepted');
  s.ensureExecutiveWorkItems('alice',a.id);
  const evidence={id:'e',source:'test',metricId:'active_users',unit:'users',definitionVersion:'1',
   state:'verified',value:42,scope:{source:'all'},
   period:{start:now-2*DAY,end:now-DAY,timezone:'Asia/Bangkok'},observedAt:now};
  s.saveEvidence('alice',evidence);
  const get=step=>s.workItems('alice').find(x=>x.step===step);
  s.completeExecutiveWorkItem('alice',get('verify-evidence').id,{evidenceId:'e'});
  s.completeExecutiveWorkItem('alice',get('prepare-execution').id,{note:'Reviewed'});
  assert.throws(()=>s.completeExecutiveWorkItem('alice',get('record-outcome').id,{evidenceId:'e'}),/真实行动执行事实/);
 }finally{db.close()}
});
test('stale approval reminder disappears after action acceptance and is not regenerated',()=>{
 const db=new DatabaseSync(':memory:');try{
  const s=workspaceStore(db,{initialize:true,clock:()=>now});
  const p=s.observeProblem('alice',{type:'user',subject:'example',scope:{source:'all'}});
  const a=s.proposeActionOnce('alice',p.id,{description:'Check',assignee:'growth'});
  const original=s.executiveReminders('alice',{at:now+2*DAY,record:true});
  assert.equal(original.pending.length,1);
  s.updateAction('alice',a.id,'accepted');
  const next=s.executiveReminders('alice',{at:now+2*DAY,record:true});
  assert.equal(next.pending.filter(x=>x.kind==='approval').length,0);
  assert.equal(s.executiveReminders('alice',{at:now+2*DAY,record:true}).pending.filter(x=>x.kind==='approval').length,0);
 }finally{db.close()}
});
