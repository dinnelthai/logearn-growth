'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createAgentStore}=require('../src/ai/growth/agentStore');
test('real PostgreSQL: targets, multi-worker brief dedupe and strategy history are owner-scoped',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL,max:5});
 const owner='agent-'+randomUUID(),other='agent-'+randomUUID(),now=Date.now();
 const store=createAgentStore(db);
 const brief={day:'2026-10-26',source:'all',status:'partial',
  score:{value:null},report:{overview:'Incomplete data'},
  analysisIds:[],quality:{complete:false},strategyVersion:null};
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const saved=await store.setTarget(owner,{goal:'activation',metric:'active_users',
   target:100,weight:2},{now});
  assert.equal(saved.version,1);
  await assert.rejects(store.setTarget(owner,{goal:'activation',
   metric:'active_users',target:200,weight:2},{now:now+1}),/版本/);
  const modified=await store.setTarget(owner,{goal:'activation',metric:'active_users',
   target:200,weight:1,expectedVersion:1},{now:now+2});
  assert.equal(modified.version,2);
  assert.equal((await store.targets(owner))[0].target,200);
  assert.equal((await store.targets(other)).length,0);
  const savedBriefs=await Promise.all(Array.from({length:4},
   ()=>store.upsertBrief(owner,brief,{now})));
  assert.equal(new Set(savedBriefs.map(x=>x.id)).size,1);
  assert.equal((await store.listBriefs(other)).length,0);
  brief.status='ready';brief.score={value:75};
  brief.report={overview:'Complete reviewed model brief'};
  const complete=await store.upsertBrief(owner,brief,{now:now+1});
  assert.equal(complete.status,'ready');
  await store.upsertBrief(owner,brief,{now:now+2});
  const revisedTargetBrief={...brief,status:'ready',score:{value:5},
   report:{overview:'Later KPI changes must not silently rewrite history'}};
  const frozen=await store.upsertBrief(owner,revisedTargetBrief,{now:now+3});
  assert.equal(frozen.score.value,75);
  assert.equal(frozen.report.overview,'Complete reviewed model brief');
  const downgrade=await store.upsertBrief(owner,{
   ...revisedTargetBrief,status:'partial',score:{value:null}
  },{now:now+4});
  assert.equal(downgrade.status,'ready');
  assert.equal(downgrade.score.value,75);
  const notices=await db.query(`SELECT kind,message FROM ai_growth_notifications
    WHERE owner_id=$1 AND kind='daily-brief'`,[owner]);
  assert.equal(notices.rows.length,1);
  assert.equal(notices.rows[0].kind,'daily-brief');
  const choice={digest:'a'.repeat(64),policy:{version:'evidence-first-strategy-v3',
   focusMetrics:[],requireHumanApproval:true},
   evidence:{judgementCount:3}};
  const versions=await Promise.all(Array.from({length:3},
   ()=>store.saveStrategy(owner,'activation','all',choice,{now})));
  assert.equal(new Set(versions.map(x=>x.version)).size,1);
  assert.equal((await store.getStrategy(owner,'activation','all')).version,1);
  assert.equal(await store.getStrategy(other,'activation','all'),null);
  const next=await store.saveStrategy(owner,'activation','all',{
   ...choice,digest:'b'.repeat(64)},{now:now+3});
  assert.equal(next.version,2);
  assert.equal((await store.listBriefs(owner,{limit:10})).length,1);
  assert.equal((await store.feedback(other)).length,0);
 }finally{
  await db.query('DELETE FROM ai_growth_notifications WHERE owner_id IN ($1,$2)',[owner,other]).catch(()=>{});
  for(const table of ['ai_growth_agent_strategy','ai_growth_agent_briefs','ai_growth_agent_targets']){
   await db.query('DELETE FROM '+table+' WHERE owner_id IN ($1,$2)',[owner,other]).catch(()=>{});
  }
  await db.end();
 }
});
