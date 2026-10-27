'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const enabled=process.env.AI_P0_INTEGRATION==='1';
test('Postgres fencing and real Bull/Redis duplicate delivery', {skip:!enabled}, async()=>{
 const pool=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const Bull=require('bull'), name='ai-p0-'+randomUUID();
 const queue=new Bull(name,process.env.REDIS_URL);
 const id=randomUUID(),owner='ci-owner';
 const records=require('../src/db/aiRecords');
 try {
  await pool.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  await pool.query(`INSERT INTO ai_analysis_records
    (id,owner_id,title,analysis_type,date_range_start,date_range_end,business_scope,
     user_question,data_snapshot,filter_conditions,status,created_at,request_key)
    VALUES ($1,$2,'integration','optimization',0,100,'{}','', '{}','{}','pending',$3,$4)`,
    [id,owner,Date.now(),randomUUID()]);
  let success=0,rejected=0;
  queue.process('analysis',2,async job=>{
    const {claimSafeAnalysis}=require('../src/ai/business/workerStart');
    try{
      const claimed=await claimSafeAnalysis({analysisId:id,ownerId:owner,records,traceStore:{list:()=>[]}});
      if(claimed.action==='claimed'){success++;return claimed.token}
    }catch(e){if(/其他 Worker|正在执行/.test(e.message)){rejected++;return null}throw e}
  });
  await queue.isReady();
  await Promise.all([queue.add('analysis',{id},{jobId:'a'}),queue.add('analysis',{id},{jobId:'b'})]);
  const until=Date.now()+12000;
  while(success+rejected<2 && Date.now()<until)await new Promise(r=>setTimeout(r,50));
  assert.equal(success,1);assert.equal(rejected,1);
  const active=await records.getAnalysisRecord(id,owner);
  assert.equal(active.status,'processing');assert.equal(typeof active.execution_token,'string');
  const oldToken='other-lease-token';
  assert.equal(await records.renewAnalysisLease(id,owner,oldToken),false);
  await assert.rejects(records.assertAnalysisLease(id,owner,oldToken),/失效/);
  await assert.rejects(records.updateAnalysisSnapshot(id,{invalid:true},owner,oldToken),/失效/);
  assert.equal(await records.renewAnalysisLease(id,owner,active.execution_token),true);
  await records.assertAnalysisLease(id,owner,active.execution_token);
  await assert.rejects(
    records.completeAnalysis(id,owner,[],{summary:'stale'},{provider:'mock',model:'mock',cost:0},oldToken),
    /租约失效/
  );
  assert.equal(await records.failClaimedAnalysis(id,owner,oldToken,'stale worker'),false);
  assert.equal((await records.getAnalysisRecord(id,owner)).status,'processing');
  assert.equal(await records.failClaimedAnalysis(id,owner,active.execution_token,'test shutdown'),true);
  assert.equal((await records.getAnalysisRecord(id,owner)).status,'failed');
 }finally{
  await queue.close();
  await pool.query('DELETE FROM ai_analysis_records WHERE id=$1',[id]).catch(()=>{});
  await pool.end();
 }
});
