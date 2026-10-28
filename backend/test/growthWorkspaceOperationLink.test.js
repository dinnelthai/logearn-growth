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
