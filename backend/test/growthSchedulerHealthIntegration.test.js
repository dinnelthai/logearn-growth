'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createSchedulerHealth}=require('../src/ai/growth/agentSchedulerHealth');
test('real PostgreSQL: only one scheduler replica owns lease and older workers are fenced',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL,max:4});
 const health=createSchedulerHealth(db),name='test-agent-health-'+randomUUID();
 const now=Date.now();
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const [a,b]=await Promise.all([health.begin({name,now}),health.begin({name,now})]);
  const first=a||b;assert.ok(first);
  assert.equal([a,b].filter(Boolean).length,1);
  assert.equal((await health.status({name,now})).live,true);
  assert.equal(await health.heartbeat(first,{now:now+60000}),true);
  assert.equal(await health.begin({name,now:now+80000}),null);
  assert.equal((await health.status({name,now:now+80000})).live,true);
  const second=await health.begin({name,now:now+370000});
  assert.ok(second);assert.notEqual(second.token,first.token);
  assert.equal(await health.heartbeat(first,{now:now+370001}),false);
  assert.equal(await health.finish(first,{outcome:'succeeded',now:now+370002}),null);
  const summary={items:4,errors:1,ready:2,partial:1,blocked:0,queued:0,deliveries:0};
  const finished=await health.finish(second,{outcome:'partial',
   summary,error:'one owner failed',now:now+370010});
  assert.equal(finished.last_status,'partial');
  const result=await health.status({name,now:now+380000});
  assert.equal(result.live,false);
  assert.equal(result.stale,false);
  assert.equal(result.status,'partial');
  assert.equal(result.runCount,2);
  assert.equal(result.lastSummary.errors,1);
  assert.equal(result.lastError,'one owner failed');
  const next=await health.begin({name,now:now+380001});
  assert.ok(next);
  await health.finish(next,{outcome:'succeeded',
   summary:{items:4,errors:0},now:now+380050});
  const stale=await health.status({name,now:now+380050+91*60000});
  assert.equal(stale.stale,true);
 }finally{
  await db.query('DELETE FROM ai_growth_agent_scheduler_health WHERE name=$1',[name]).catch(()=>{});
  await db.end();
 }
});
