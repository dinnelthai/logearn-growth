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
  const logCols=await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='ai_usage_logs'",[schema]);
  for(const name of ['trace_id','round'])assert.ok(logCols.rows.some(x=>x.column_name===name),name);
  await db.query(`INSERT INTO ai_usage_logs
   (owner_id,operation_type,operation_id,model_provider,model_name,
    input_tokens,output_tokens,total_tokens,cost_usd,duration_ms,created_at,trace_id,round)
   VALUES ('alice','analysis','r1','openai','model',10,5,15,0.02,100,1,'trace-1',0)
   ON CONFLICT (owner_id,trace_id) WHERE trace_id IS NOT NULL DO NOTHING`);
  await db.query(`INSERT INTO ai_usage_logs
   (owner_id,operation_type,operation_id,model_provider,model_name,
    input_tokens,output_tokens,total_tokens,cost_usd,duration_ms,created_at,trace_id,round)
   VALUES ('alice','analysis','r1','openai','model',10,5,15,0.02,100,1,'trace-1',0)
   ON CONFLICT (owner_id,trace_id) WHERE trace_id IS NOT NULL DO NOTHING`);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM ai_usage_logs WHERE trace_id='trace-1'")).rows[0].n),1);
  assert.equal(Number((await db.query("SELECT round FROM ai_usage_logs WHERE trace_id='trace-1'")).rows[0].round),0);
  const record=await db.query("SELECT id,title,status,cancel_requested FROM ai_analysis_records WHERE id='legacy'");
  assert.deepEqual(record.rows,[{id:'legacy',title:'old',status:'completed',cancel_requested:false}]);
  assert.ok((await db.query("SELECT to_regclass('ai_analysis_call_guard') AS name")).rows[0].name);
 }finally{
  await db.query('ROLLBACK').catch(()=>{});
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
  await db.end();
 }
});
