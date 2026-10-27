'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{Pool}=require('pg'),fs=require('node:fs');
const {budgetLimit,bangkokDay,beginBudgetedPaidCall,dailyBudgetStatus}=require('../src/ai/growth/budget');
test('budget disabled and Bangkok calendar boundaries reject calls without db access',async()=>{
 assert.equal(budgetLimit({}),0);
 assert.equal(budgetLimit({AI_GROWTH_PAID_CALLS_PER_DAY:'4'}),4);
 assert.throws(()=>budgetLimit({AI_GROWTH_PAID_CALLS_PER_DAY:'-1'}),/配置/);
 assert.throws(()=>budgetLimit({AI_GROWTH_PAID_CALLS_PER_DAY:'101'}),/0到100/);
 assert.equal(bangkokDay(Date.parse('2026-10-26T16:59:59Z')),'2026-10-26');
 assert.equal(bangkokDay(Date.parse('2026-10-26T17:00:00Z')),'2026-10-27');
 await assert.rejects(beginBudgetedPaidCall({
  analysisId:'x',ownerId:'o',token:'t',round:0,limit:0,
  connectionPool:{connect(){throw Error('should never connect')}}
 }),/默认关闭/);
});
test('real PostgreSQL budget serializes competing worker providers and fences unapproved calls',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const pool=new Pool({connectionString:process.env.AI_DATABASE_URL});
 const owner='budget-'+randomUUID(),ts=Date.now();
 const cleanup={ids:[],alerts:[],proposals:[]};
 async function makeApproved(){
  const id=randomUUID(),alertId=randomUUID(),proposalId=randomUUID(),token=randomUUID();
  cleanup.ids.push(id);cleanup.alerts.push(alertId);cleanup.proposals.push(proposalId);
  const filter={proposalId,humanApproved:true,focusGoal:'activation'};
  await pool.query(`INSERT INTO ai_analysis_records
  (id,owner_id,title,analysis_type,date_range_start,date_range_end,
  business_scope,user_question,data_snapshot,filter_conditions,status,
  created_at,request_key,execution_token,lease_expires_at)
  VALUES($1,$2,'paid proposal','anomaly',0,100,'{"source":"all"}','','{}',$3,
   'processing',$4,$5,$6,$7)`,
   [id,owner,JSON.stringify(filter),ts,randomUUID(),token,ts+120000]);
  await pool.query(`INSERT INTO ai_growth_alerts
   (id,owner_id,fingerprint,source,goal,metric,direction,priority,
    first_period_end,last_period_end,evidence,created_at,updated_at)
   VALUES($1,$2,$3,'all','activation','active_users','decline','P0',100,100,'{}',$4,$4)`,
   [alertId,owner,randomUUID(),ts]);
  await pool.query(`INSERT INTO ai_growth_investigation_proposals
    (id,owner_id,alert_id,period_end,status,analysis_id,evidence,created_at,updated_at)
   VALUES($1,$2,$3,100,'approved',$4,'{}',$5,$5)`,
   [proposalId,owner,alertId,id,ts]);
  return {analysisId:id,ownerId:owner,token,round:0,now:ts,limit:1,connectionPool:pool};
 }
 try{
  await pool.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  const a=await makeApproved(),b=await makeApproved();
  const outcomes=await Promise.allSettled([
    beginBudgetedPaidCall(a),beginBudgetedPaidCall(b)
  ]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
  const cost=await dailyBudgetStatus(owner,{now:ts,connectionPool:pool,limit:1});
  assert.equal(cost.reservedCalls,1);assert.equal(cost.remainingCalls,0);
  const winner=outcomes[0].status==='fulfilled'?a:b;
  const loser=outcomes[0].status==='fulfilled'?b:a;
  // The winning round is already journaled before provider IO.
  const calls=await pool.query('SELECT * FROM ai_analysis_call_guard WHERE analysis_id=$1',[winner.analysisId]);
  assert.equal(calls.rows[0].status,'started');
  await assert.rejects(beginBudgetedPaidCall({...winner,limit:4}),/预留/);
  await assert.rejects(beginBudgetedPaidCall({...loser,limit:4,token:'wrong'}),/未获人工批准/);
  await pool.query('UPDATE ai_growth_investigation_proposals SET status=$2 WHERE id=$1',[loser.analysisId,'approved']).catch(()=>{});
  const noApproval=await makeApproved();
  await pool.query("UPDATE ai_growth_investigation_proposals SET status='dismissed' WHERE analysis_id=$1",[noApproval.analysisId]);
  await assert.rejects(beginBudgetedPaidCall({...noApproval,limit:4}),/未获人工批准/);
 }finally{
  await pool.query('DELETE FROM ai_growth_paid_call_allocations WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_analysis_call_guard WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_growth_investigation_proposals WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_growth_notifications WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_growth_alerts WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.query('DELETE FROM ai_analysis_records WHERE owner_id=$1',[owner]).catch(()=>{});
  await pool.end();
 }
});
