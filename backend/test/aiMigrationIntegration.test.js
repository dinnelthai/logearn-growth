'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{Client}=require('pg'),{randomUUID}=require('node:crypto');

test('AI migration upgrades legacy data, rolls back transaction, and is idempotent', {skip:process.env.AI_P0_INTEGRATION!=='1'}, async()=>{
 const db=new Client({connectionString:process.env.AI_DATABASE_URL});
 const schema='migration_'+randomUUID().replaceAll('-','');
 const sql=fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8');
 const legacy=sql.split('-- Worker execution fencing;')[0];
 await db.connect();
 try{
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET search_path TO "${schema}"`);
  await db.query(legacy);
  await db.query(`INSERT INTO ai_analysis_records (id,owner_id,title,analysis_type,date_range_start,date_range_end,business_scope,user_question,data_snapshot,filter_conditions,status,created_at) VALUES ('legacy','owner','old','optimization',0,100,'{}','','{}','{}','completed',1)`);
  await db.query('BEGIN');
  await db.query(sql);
  await db.query('ROLLBACK');
  let cols=await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='ai_analysis_records'",[schema]);
  assert.equal(cols.rows.some(x=>x.column_name==='execution_token'),false);
  await db.query(sql);
  await db.query(sql);
  cols=await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='ai_analysis_records'",[schema]);
  for(const name of ['context_payload','cancel_requested','execution_token','lease_expires_at'])assert.ok(cols.rows.some(x=>x.column_name===name),name);
  const record=await db.query("SELECT id,title,status,cancel_requested FROM ai_analysis_records WHERE id='legacy'");
  assert.deepEqual(record.rows,[{id:'legacy',title:'old',status:'completed',cancel_requested:false}]);
  assert.ok((await db.query("SELECT to_regclass('ai_analysis_call_guard') AS name")).rows[0].name);
 }finally{
  await db.query('ROLLBACK').catch(()=>{});
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
  await db.end();
 }
});
