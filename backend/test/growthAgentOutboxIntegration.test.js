'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createAgentOutbox}=require('../src/ai/growth/agentOutbox');
test('real PostgreSQL: outbound daily summaries dedupe across processes, fence owners and retry safely',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL,max:4});
 const alice='delivery-'+randomUUID(),bob='delivery-'+randomUUID(),
  now=Date.now(),outbox=createAgentOutbox(db);
 const draft={ownerId:alice,briefId:'brief-'+randomUUID(),day:'2026-10-26',
  status:'ready',score:72,summary:'Evidence only'};
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const created=await Promise.all(Array.from({length:4},()=>outbox.enqueue(draft,now)));
  assert.equal(created.filter(x=>x.status==='queued').length,1);
  assert.equal(new Set(created.map(x=>x.id)).size,1);
  assert.deepEqual(await outbox.claim([bob],{now}),[]);
  let claimed=await outbox.claim([alice],{now,limit:4});
  assert.equal(claimed.length,1);
  assert.equal((await outbox.claim([alice],{now,limit:4})).length,0);
  let done=await outbox.finish(claimed[0],{delivered:false,error:'temporary',now:now+1});
  assert.equal(done.state,'pending');
  assert.equal((await outbox.claim([alice],{now:now+5000})).length,0);
  claimed=await outbox.claim([alice],{now:now+200000});
  assert.equal(claimed.length,1);
  done=await outbox.finish(claimed[0],{delivered:true,httpStatus:202,now:now+200001});
  assert.equal(done.state,'delivered');
  assert.equal((await outbox.claim([alice],{now:now+300000})).length,0);
  const rows=await db.query('SELECT count(*)::int AS n FROM ai_growth_delivery_outbox WHERE owner_id=$1',[alice]);
  assert.equal(rows.rows[0].n,1);
 }finally{
  await db.query('DELETE FROM ai_growth_delivery_outbox WHERE owner_id IN ($1,$2)',[alice,bob]).catch(()=>{});
  await db.end();
 }
});
