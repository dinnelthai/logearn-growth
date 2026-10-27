'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const {createInvestigationStore}=require('../src/ai/growth/investigationStore');
const {createNotificationStore}=require('../src/ai/growth/notificationStore');
test('real PostgreSQL: P0 declines create exactly one durable proposal and notice per period',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const pool=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const owner='proposal-'+randomUUID(),id=randomUUID(),now=Date.now();
 const store=createInvestigationStore((sql,args)=>pool.query(sql,args));
 const notices=createNotificationStore((sql,args)=>pool.query(sql,args));
 try{
  await pool.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  await pool.query(`INSERT INTO ai_growth_alerts
   (id,owner_id,fingerprint,source,goal,metric,direction,priority,
     first_period_end,last_period_end,evidence,created_at,updated_at)
   VALUES($1,$2,$3,'all','activation','active_users','decline','P0',
      100,100,$4,$5,$5)`,[id,owner,randomUUID(),JSON.stringify({baseline:100,observed:50}),now]);
  const alert={id,last_period_end:100};
  const races=await Promise.all(Array.from({length:4},()=>store.propose(owner,alert,{now})));
  assert.equal(races.filter(Boolean).length,1);
  let drafts=await store.list(owner);
  assert.equal(drafts.length,1);assert.equal(drafts[0].status,'proposed');
  const proposed=drafts[0];
  let incoming=await notices.list(owner);
  assert.equal(incoming.length,1);
  assert.equal(incoming[0].resource_id,proposed.id);
  assert.equal((await notices.list(owner,{unreadOnly:true})).length,1);
  assert.equal(await notices.markRead('different-owner',incoming[0].id),null);
  assert.ok(await notices.markRead(owner,incoming[0].id,now+1));
  assert.equal((await notices.list(owner,{unreadOnly:true})).length,0);
  const approved=await store.decide(owner,proposed.id,proposed.version,'approve',now+2);
  assert.equal(approved.status,'approved');
  assert.equal(await store.decide(owner,proposed.id,proposed.version,'dismiss',now+3),null);
  assert.equal(await store.decide('other',proposed.id,approved.version,'dismiss',now+4),null);
  // New day produces a distinct proposal but not a second proposal for day 100.
  await pool.query('UPDATE ai_growth_alerts SET last_period_end=200 WHERE id=$1',[id]);
  const created=await store.propose(owner,{id,last_period_end:200},{now:now+DAY});
  assert.ok(created);assert.notEqual(created.id,proposed.id);
  drafts=await store.list(owner);
  assert.equal(drafts.length,2);
  incoming=await notices.list(owner);
  assert.equal(incoming.length,2);
  assert.equal(await store.propose('different-owner',{id,last_period_end:200}),null);
 }finally{
  await pool.query('DELETE FROM ai_growth_notifications WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_growth_investigation_proposals WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_growth_alerts WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.end();
 }
});
const DAY=86400000;
