'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {createMonitorControl}=require('../src/ai/growth/monitorControl');
test('real PG: default-off, CAS and owner isolation survive restarts',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const alice='monitor-'+randomUUID(),bob='monitor-'+randomUUID(),now=Date.now();
 const control=createMonitorControl((sql,args)=>db.query(sql,args));
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const before=await control.get(alice,{now});
  assert.equal(before.enabled,false);
  assert.equal(before.version,0);
  const enabled=await control.set(alice,{enabled:true,expectedVersion:0,now});
  assert.equal(enabled.version,1);
  assert.equal(enabled.enabled,true);
  await assert.rejects(control.set(alice,{enabled:false,expectedVersion:0,now}),e=>e.status===409);
  await assert.rejects(control.set(bob,{enabled:true,expectedVersion:5,now}),e=>e.status===409);
  assert.equal((await control.get(bob,{now})).enabled,false);
  await control.recordScan(alice,{status:'scanned',summary:{goals:[{goal:'activation'}]},now});
  const after=await control.get(alice,{now:now+100});
  assert.equal(after.lastScanStatus,'scanned');
  assert.deepEqual(after.lastScanSummary.goals,[{goal:'activation'}]);
  const disabled=await control.set(alice,{enabled:false,expectedVersion:1,now:now+100});
  assert.equal(disabled.enabled,false);
  assert.equal(disabled.version,2);
  assert.equal((await control.get(bob,{now})).lastScanStatus,null);
  assert.deepEqual(await control.enabledOwners(),[]);
 }finally{
  await db.query('DELETE FROM ai_growth_monitor_settings WHERE owner_id=ANY($1)',[[alice,bob]]).catch(()=>{});
  await db.end();
 }
});
