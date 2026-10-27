'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const {createTraceStore}=require('../src/ai/business/trace');
test('prompt replay looks up the exact archived role and owner-matched run',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE agent_prompts(hash TEXT PRIMARY KEY,role TEXT NOT NULL,content TEXT NOT NULL);
  CREATE TABLE agent_calls(owner_id TEXT NOT NULL,run_id TEXT NOT NULL,trace_id TEXT NOT NULL,
  round INTEGER NOT NULL,status TEXT NOT NULL,prompts TEXT NOT NULL,result TEXT,
  started_at INTEGER NOT NULL,finished_at INTEGER,
  PRIMARY KEY(owner_id,trace_id,round));`);
  const store=createTraceStore(db),content='immutable prompt v1',hash=store.savePrompt('analysis',content);
  const context={ownerId:'alice',runId:'run1',traceId:'trace1',promptVersions:{analysis:hash}};
  store.begin(context,0);
  store.finish(context,0,{responseContent:'{}'});
  assert.equal(store.promptForRun('alice','run1','analysis'),content);
  assert.equal(store.promptForRun('bob','run1','analysis'),null);
  db.prepare('UPDATE agent_prompts SET content=? WHERE hash=?').run('tampered',hash);
  assert.throws(()=>store.promptForRun('alice','run1','analysis'),/哈希不一致/);
 }finally{db.close()}
});
