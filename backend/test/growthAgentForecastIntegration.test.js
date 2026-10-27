'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
test('real PostgreSQL preserves structured AI forecast with original suggestion before any execution',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const owner='forecast-'+randomUUID(),analysis=randomUUID(),suggestion=randomUUID();
 const now=Date.now(),forecast={metric:'active_users',direction:'increase',
  horizonDays:3,minRelativeChangePct:10,confidence:'low',evidenceIds:['ev-1']};
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  await db.query(`INSERT INTO ai_analysis_records
    (id,owner_id,title,analysis_type,date_range_start,date_range_end,
     business_scope,data_snapshot,filter_conditions,status,created_at,request_key)
    VALUES($1,$2,'forecast','optimization',$3,$4,'{"source":"all"}','{}','{}',
     'completed',$5,$6)`,[analysis,owner,now-2*86400000,now-86400000,now,randomUUID()]);
  const records=require('../src/db/aiRecords');
  const row=await records.createSuggestion({
   analysisId:analysis,ownerId:owner,businessProblem:'Activation risk',
   dataEvidence:{evidenceIds:['ev-1']},hypothesis:'Review measurable change',
   uncertainties:[],action:'Inspect onboarding',priority:'P1',
   priorityReason:'Observed segment movement',applicableScope:{source:'all'},
   validationMetrics:{primary:'active_users',secondary:[]},forecast
  });
  const saved=await db.query('SELECT forecast,user_status FROM ai_suggestions WHERE id=$1 AND owner_id=$2',
   [row.id,owner]);
  assert.deepEqual(saved.rows[0].forecast,forecast);
  assert.equal(saved.rows[0].user_status,'pending');
 }finally{
  await db.query('DELETE FROM ai_suggestions WHERE owner_id=$1',[owner]).catch(()=>{});
  await db.query('DELETE FROM ai_analysis_records WHERE owner_id=$1',[owner]).catch(()=>{});
  await db.end();
 }
});
