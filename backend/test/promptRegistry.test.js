'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {CRITICAL}=require('../src/ai/evaluation/promptGate');
const {createPromptRegistry}=require('../src/ai/optimization/promptRegistry');
const h=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE agent_prompts(hash TEXT PRIMARY KEY,role TEXT NOT NULL,content TEXT NOT NULL);
 CREATE TABLE agent_prompt_candidates(owner_id TEXT NOT NULL,id TEXT NOT NULL,role TEXT NOT NULL,
 baseline_hash TEXT NOT NULL,candidate_hash TEXT NOT NULL,reason TEXT NOT NULL,trace_ids TEXT NOT NULL,
 status TEXT NOT NULL,version INTEGER NOT NULL,created_at INTEGER NOT NULL,evaluated_at INTEGER,
 approved_at INTEGER,approved_by TEXT,evaluation TEXT,suite_hash TEXT,PRIMARY KEY(owner_id,id));
 CREATE TABLE agent_active_prompts(owner_id TEXT NOT NULL,role TEXT NOT NULL,candidate_hash TEXT NOT NULL,
 previous_hash TEXT NOT NULL,version INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,role));`);
 return {db,registry:createPromptRegistry(db)};
}
const baseline='Do not invent business facts; preserve owner scope.';
const pass=()=>CRITICAL.map(id=>({id,passed:true,quality:0.9,cost:0.01,latencyMs:100}));
const limits={baselineQuality:0.8,maxCost:1,maxLatencyMs:1000};
test('prompt candidate requires independent evaluation and owner approval',()=>{
 const {db,registry}=fixture();
 try{
  const v=registry.propose('alice',{role:'analysis',baseline,appendix:'Always report missing denominators.',reason:'Review failures'});
  assert.equal(registry.resolve('alice','analysis',baseline,{env:{AI_PROMPT_RUNTIME_ENABLED:'1'}}),baseline);
  assert.equal(registry.getCandidate('bob',v.id),null);
  assert.throws(()=>registry.approve('alice',v.id,1),/评估/);
  const result=registry.recordEvaluation('alice',v.id,{results:pass(),limits,suiteHash:h('hidden-eval-v1')});
  assert.equal(result.evaluation.eligible,true);
  assert.throws(()=>registry.activate('alice',v.id,2,{env:{AI_PROMPT_AUTO_PUBLISH:'1'}}),/审批/);
  assert.equal(registry.approve('alice',v.id,2).version,3);
  assert.throws(()=>registry.activate('alice',v.id,3,{env:{}}),/disabled/);
  const active=registry.activate('alice',v.id,3,{env:{AI_PROMPT_AUTO_PUBLISH:'1'}});
  assert.equal(active.status,'active');
  assert.match(registry.resolve('alice','analysis',baseline,{env:{AI_PROMPT_RUNTIME_ENABLED:'1'}}),/missing denominators/);
  assert.equal(registry.resolve('bob','analysis',baseline,{env:{AI_PROMPT_RUNTIME_ENABLED:'1'}}),baseline);
  const rolled=registry.rollback('alice','analysis',1);
  assert.equal(rolled.status,'rolled-back');
  assert.equal(registry.resolve('alice','analysis',baseline,{env:{AI_PROMPT_RUNTIME_ENABLED:'1'}}),baseline);
 }finally{db.close()}
});
test('failed hard gate never becomes publishable',()=>{
 const {db,registry}=fixture();
 try{
  const v=registry.propose('alice',{role:'analysis',baseline,appendix:'Validate unknowns.',reason:'Safety'});
  const bad=pass();bad[0].passed=false;
  const result=registry.recordEvaluation('alice',v.id,{results:bad,limits,suiteHash:h('hidden')});
  assert.equal(result.evaluation.eligible,false);
  assert.throws(()=>registry.approve('alice',v.id,2),/评估/);
  assert.throws(()=>registry.propose('alice',{role:'analysis',baseline,appendix:'password = secret',reason:'bad'}),/密钥/);
 }finally{db.close()}
});
