'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{Pool}=require('pg'),{randomUUID}=require('node:crypto');
const {createAlertStore}=require('../src/ai/growth/alertStore');
const {scanDailyAlerts}=require('../src/ai/growth/monitor');
const DAY=86400000,cutoff=Date.parse('2026-10-25T17:00:00Z');
test('real PostgreSQL: concurrent scans dedupe, stale approvals reject and events audit all changes',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const pool=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const owner='alert-test-'+randomUUID(),store=createAlertStore((sql,args)=>pool.query(sql,args));
 async function daily(id,end,count){
  const context={version:'business-evidence-v1',
   business:{scope:{source:'all'},focusGoal:'activation'},
   focusGoal:'activation',period:{start:end-DAY,end,timezone:'Asia/Bangkok'},
   snapshot:{id:'watermark-'+id,asOf:new Date(end+3600000).toISOString(),
    eventsCompleteThrough:new Date(end).toISOString(),historyComplete:true},
   current:{totals:{active_users:count,new_users:20,returning_users:20}},
   growth:{quality:{truncated:false}}};
  await pool.query(`INSERT INTO ai_analysis_records
    (id,owner_id,title,analysis_type,date_range_start,date_range_end,
    business_scope,user_question,data_snapshot,filter_conditions,status,created_at,request_key)
    VALUES ($1,$2,'daily','optimization',$3,$4,$5,'',$6,$7,'completed',$8,$9)`,
   [id,owner,end-DAY,end,JSON.stringify({source:'all'}),JSON.stringify(context),
    JSON.stringify({dailySchedule:'v1',focusGoal:'activation'}),Date.now(),randomUUID()]);
 }
 try{
  await pool.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  await daily(randomUUID(),cutoff,100);
  await daily(randomUUID(),cutoff+DAY,55);
  const results=await Promise.all(Array.from({length:4},()=>scanDailyAlerts({
   ownerId:owner,store,now:cutoff+3*DAY
  })));
  assert.equal(results.reduce((n,r)=>n+r.newObservations,0),1);
  let alerts=await store.list(owner);
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].occurrences,1);
  assert.equal(alerts[0].status,'open');
  const first=alerts[0];
  assert.equal((await store.transition(owner,first.id,{action:'acknowledge',expectedVersion:first.version})).status,'acknowledged');
  assert.equal(await store.transition(owner,first.id,{action:'resolve',expectedVersion:first.version}),null);
  let ack=(await store.list(owner))[0];
  const snooze=await store.transition(owner,ack.id,{action:'snooze',expectedVersion:ack.version,
   snoozeUntil:Date.now()+DAY,note:'Waiting for funnel QA'});
  assert.ok(Number(snooze.snooze_until)>Date.now());
  const resolved=await store.transition(owner,first.id,{action:'resolve',
   expectedVersion:snooze.version});
  assert.equal(resolved.status,'resolved');
  assert.equal((await store.list(owner)).length,0);
  // Same day must not reopen resolved alert.
  assert.equal((await scanDailyAlerts({ownerId:owner,store,now:cutoff+3*DAY})).newObservations,0);
  await daily(randomUUID(),cutoff+2*DAY,30);
  const newDay=await scanDailyAlerts({ownerId:owner,store,now:cutoff+3*DAY});
  assert.equal(newDay.newObservations,1);
  alerts=await store.list(owner);
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].status,'open');
  assert.equal(alerts[0].occurrences,2);
  assert.equal(alerts[0].snooze_until,null);
  assert.equal(await store.transition('other-owner',first.id,{
   action:'acknowledge',expectedVersion:alerts[0].version}),null);
  const events=await store.history(owner,first.id);
  assert.deepEqual(events.map(e=>e.event_type),['observed','resolved','snoozed','acknowledged','observed']);
 }finally{
  await pool.query('DELETE FROM ai_growth_alerts WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_analysis_records WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.end();
 }
});
