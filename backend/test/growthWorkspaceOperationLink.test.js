'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const {workspaceStore}=require('../src/ai/growth/workspace/store');
test('decision problem can link only to owned existing operations, never invent a cohort',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec('CREATE TABLE operation_tasks(id TEXT,owner_id TEXT,title TEXT,status TEXT)');
 db.prepare('INSERT INTO operation_tasks VALUES(?,?,?,?)').run('t-a','alice','已固定用户的引导任务','open');
 const s=workspaceStore(db,{initialize:true});
 const p=s.observeProblem('alice',{type:'user',subject:'注册后流失',description:'排查',scope:{source:'all'}});
 assert.throws(()=>s.linkOperationTask('alice',p.id,'not-real'),/不存在/);
 assert.equal(s.linkOperationTask('alice',p.id,'t-a').taskId,'t-a');
 assert.equal(s.linkOperationTask('alice',p.id,'t-a').reused,true);
 assert.equal(s.linkedOperationTasks('alice',p.id).length,1);
 assert.throws(()=>s.linkOperationTask('bob',p.id,'t-a'),/不存在/);
 }finally{db.close()}
});

test('adopted AI suggestions link idempotently to existing owner-scoped cohort tasks only',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE operation_tasks(id TEXT,owner_id TEXT,title TEXT,status TEXT,source_json TEXT)');
  db.prepare('INSERT INTO operation_tasks VALUES(?,?,?,?,?)').run('task-1','alice','已固定名单的激活任务','open',JSON.stringify({source:'all'}));
  db.prepare('INSERT INTO operation_tasks VALUES(?,?,?,?,?)').run('task-2','bob','其他用户任务','open',JSON.stringify({source:'all'}));
  db.prepare('INSERT INTO operation_tasks VALUES(?,?,?,?,?)').run('task-direct','alice','指定来源任务','open',JSON.stringify({source:'direct'}));
  const s=workspaceStore(db,{initialize:true});
  const suggestion={id:'suggestion-1',user_status:'adopted',
   business_problem:'注册后首次分析转化偏低',
   action:'优化首次分析引导；执行步骤：检查入口、验证漏斗',
   action_scope:{source:'all'}};
  assert.throws(()=>s.linkAcceptedSuggestionToTask('alice',{...suggestion,user_status:'pending'},'task-1'),/已采纳/);
  assert.throws(()=>s.linkAcceptedSuggestionToTask('alice',suggestion,'missing'),/不存在或无权访问/);
  assert.throws(()=>s.linkAcceptedSuggestionToTask('alice',suggestion,'task-2'),/不存在或无权访问/);
  assert.throws(()=>s.linkAcceptedSuggestionToTask('alice',suggestion,'task-direct'),/来源范围不一致/);
  const first=s.linkAcceptedSuggestionToTask('alice',suggestion,'task-1');
  assert.equal(first.taskId,'task-1');assert.equal(first.taskTitle,'已固定名单的激活任务');
  assert.equal(first.reused,false);
  const second=s.linkAcceptedSuggestionToTask('alice',suggestion,'task-1');
  assert.equal(second.problemId,first.problemId);assert.equal(second.reused,true);
  assert.equal(s.linkedOperationTasks('alice',first.problemId).length,1);
  assert.equal(s.suggestionOperationTasks('alice','suggestion-1')[0].linkedOperationTasks.length,1);
  assert.deepEqual(s.suggestionIdsForOperationTask('alice','task-1'),['suggestion-1']);
  assert.deepEqual(s.suggestionIdsForOperationTask('bob','task-1'),[]);
  assert.equal(s.suggestionOperationTasks('bob','suggestion-1').length,0);
  assert.equal(s.problems('bob').length,0);
 }finally{db.close()}
});
