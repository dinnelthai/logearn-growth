'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {checkCanary}=require('../src/ai/optimization/canarySafety');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE agent_calls(owner_id TEXT,run_id TEXT,status TEXT,prompts TEXT,result TEXT,started_at INTEGER);
 CREATE TABLE agent_active_prompts(owner_id TEXT,role TEXT,candidate_hash TEXT,previous_hash TEXT,version INTEGER,updated_at INTEGER);
 CREATE TABLE agent_prompt_rollouts(owner_id TEXT,role TEXT,candidate_hash TEXT,percent INTEGER,version INTEGER);`);
 db.prepare('INSERT INTO agent_active_prompts VALUES(?,?,?,?,?,?)').run('alice','analysis','candidate','baseline',4,100);
 db.prepare('INSERT INTO agent_prompt_rollouts VALUES(?,?,?,?,?)').run('alice','analysis','candidate',5,1);
 return db;
}
test('canary cannot take action while flag is disabled or sample is too small',()=>{
 const db=fixture();
 try{
  assert.equal(checkCanary(db,'alice',{now:200,env:{}}).status,'disabled');
  assert.equal(checkCanary(db,'alice',{now:200,env:{AI_PROMPT_AUTO_ROLLBACK_ENABLED:'1',AI_PROMPT_RUNTIME_ENABLED:'1'}}).action,'none');
 }finally{db.close()}
});
test('canary evidence is scoped by owner and immutable archived prompt hashes',()=>{
 const db=fixture();
 try{
  db.prepare('INSERT INTO agent_calls VALUES(?,?,?,?,?,?)').run('bob','r1','unknown',JSON.stringify({analysis:'candidate'}),null,150);
  db.prepare('INSERT INTO agent_calls VALUES(?,?,?,?,?,?)').run('alice','r2','received',JSON.stringify({analysis:'baseline'}),JSON.stringify({validatedAnalysis:{summary:'fine'}}),150);
  const {evidenceFor}=require('../src/ai/optimization/canarySafety');
  assert.equal(evidenceFor(db,'alice','candidate',100).runs,0);
  assert.equal(evidenceFor(db,'alice','baseline',100).validated,1);
 }finally{db.close()}
});

test('validated-analysis completion regression can trigger safety-only rollback',()=>{
 const db=fixture();
 try{
  for(let i=0;i<20;i++){
   db.prepare('INSERT INTO agent_calls VALUES(?,?,?,?,?,?)').run('alice','base-'+i,'received',JSON.stringify({analysis:'baseline'}),JSON.stringify({validatedAnalysis:{summary:'ok'}}),150);
   db.prepare('INSERT INTO agent_calls VALUES(?,?,?,?,?,?)').run('alice','new-'+i,'received',JSON.stringify({analysis:'candidate'}),JSON.stringify({responseContent:'invalid response'}),150);
  }
  const out=checkCanary(db,'alice',{now:200,minRuns:20,env:{
   AI_PROMPT_RUNTIME_ENABLED:'1',AI_PROMPT_AUTO_ROLLBACK_ENABLED:'1'
  }});
  assert.equal(out.action,'rollback');
  assert.equal(out.reason,'validated-analysis-rate-collapse');
  assert.equal(db.prepare("SELECT candidate_hash FROM agent_active_prompts WHERE owner_id='alice'").get().candidate_hash,'baseline');
  assert.equal(db.prepare("SELECT percent FROM agent_prompt_rollouts WHERE owner_id='alice'").get().percent,0);
 }finally{db.close()}
});
