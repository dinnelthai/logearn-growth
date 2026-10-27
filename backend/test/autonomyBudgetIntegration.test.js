'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{Pool}=require('pg'),fs=require('node:fs');
const {beginAutonomyPaidCall,autonomyBudgetStatus}=require('../src/ai/growth/autonomyBudget');
test('PostgreSQL serializes autonomous paid rounds and protects owner scope',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL,max:5});
 const owner='autopaid-'+randomUUID(),time=Date.now(),ids=[];
 const previous=process.env.AI_AUTONOMY_PAID_DAILY_ENABLED;
 process.env.AI_AUTONOMY_PAID_DAILY_ENABLED='1';
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  async function record(){
   const id=randomUUID(),token=randomUUID();ids.push(id);
   await db.query(`INSERT INTO ai_analysis_records
   (id,owner_id,title,analysis_type,date_range_start,date_range_end,
    business_scope,data_snapshot,filter_conditions,status,created_at,request_key,execution_token,lease_expires_at)
    VALUES($1,$2,'daily','optimization',0,100,'{"source":"all"}','{}',
     '{"dailySchedule":"v1","focusGoal":"activation"}','processing',$3,$4,$5,$6)`,
    [id,owner,time,randomUUID(),token,time+120000]);
   return {analysisId:id,ownerId:owner,token,round:0,now:time,limit:1,connectionPool:db};
  }
  const a=await record(),b=await record();
  const outcomes=await Promise.allSettled([beginAutonomyPaidCall(a),beginAutonomyPaidCall(b)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const budget=await autonomyBudgetStatus(owner,{now:time,connectionPool:db,limit:1});
  assert.equal(budget.used,1);
  const winner=outcomes[0].status==='fulfilled'?a:b;
  assert.equal((await db.query('SELECT status FROM ai_analysis_call_guard WHERE analysis_id=$1',[winner.analysisId])).rows[0].status,'started');
  await assert.rejects(beginAutonomyPaidCall({...winner,limit:10}),/预留|状态不明/);
  await assert.rejects(beginAutonomyPaidCall({...b,ownerId:'other',limit:10}),/授权/);
 }finally{
  if(previous==null)delete process.env.AI_AUTONOMY_PAID_DAILY_ENABLED;
  else process.env.AI_AUTONOMY_PAID_DAILY_ENABLED=previous;
  await db.query('DELETE FROM ai_growth_autonomy_paid_allocations WHERE owner_id=$1',[owner]).catch(()=>{});
  await db.query('DELETE FROM ai_analysis_call_guard WHERE owner_id=$1',[owner]).catch(()=>{});
  await db.query('DELETE FROM ai_analysis_records WHERE owner_id=$1',[owner]).catch(()=>{});
  await db.end();
 }
});
