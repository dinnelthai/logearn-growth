'use strict';
const pool=require('../../db/aiPool');
const DAY=86400000,OFFSET=7*3600000;
function budgetLimit(env=process.env){
 const raw=env.AI_GROWTH_PAID_CALLS_PER_DAY;
 if(raw==null||raw==='')return 0; // fail closed by default
 if(!/^(0|[1-9][0-9]*)$/.test(String(raw)))throw Error('AI_GROWTH_PAID_CALLS_PER_DAY 配置无效');
 const n=Number(raw);
 if(!Number.isSafeInteger(n)||n>100)throw Error('AI_GROWTH_PAID_CALLS_PER_DAY 只允许0到100');
 return n;
}
function bangkokDay(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw Error('调用时间无效');
 return new Date(Math.floor((now+OFFSET)/DAY)*DAY).toISOString().slice(0,10);
}
function forbidden(message){
 return Object.assign(Error(message),{status:409,reason:'growth-paid-budget'});
}
// Only approved, owner-matched proposal analyses use the paid anomaly budget.
// A reservation is committed alongside the model-call guard BEFORE provider IO.
// It is never refunded automatically because the remote call might have billed.
async function beginBudgetedPaidCall({analysisId,ownerId,token,round,now=Date.now(),
 limit=budgetLimit(),connectionPool=pool}){
 if(!analysisId||!ownerId||!token||!Number.isSafeInteger(round)||round<0||
    !Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(limit)||limit<0||limit>100)
   throw Error('模型调用配额参数无效');
 if(limit===0)throw forbidden('异常调查付费调用默认关闭：请显式配置每日模型轮次上限');
 const day=bangkokDay(now);
 const client=await connectionPool.connect();
 let started=false;
 try{
  await client.query('BEGIN');started=true;
  // Two-component transaction advisory lock serializes the owner/day counter
  // even when two different analysis jobs run on independent worker replicas.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
   [ownerId,day]);
  const valid=await client.query(`SELECT a.id FROM ai_analysis_records a
    JOIN ai_growth_investigation_proposals p
      ON p.id=a.filter_conditions->>'proposalId' AND p.owner_id=a.owner_id
      AND p.analysis_id=a.id AND p.status='approved'
    WHERE a.id=$1 AND a.owner_id=$2 AND a.execution_token=$3
      AND a.status='processing' AND a.cancel_requested=false AND a.lease_expires_at>$4
      AND a.filter_conditions->>'humanApproved'='true'
      AND a.analysis_type='anomaly' FOR UPDATE OF a`,[analysisId,ownerId,token,now]);
  if(!valid.rows.length)throw forbidden('任务未获人工批准或执行租约无效');
  const counted=await client.query(`SELECT count(*)::integer AS used
    FROM ai_growth_paid_call_allocations
    WHERE owner_id=$1 AND bangkok_day=$2`,[ownerId,day]);
  if(Number(counted.rows[0].used)>=limit)
   throw forbidden('该用户当日异常调查模型轮次配额已用完');
  const previous=await client.query(`SELECT 1 FROM ai_growth_paid_call_allocations
    WHERE analysis_id=$1 AND round=$2`,[analysisId,round]);
  if(previous.rows.length)throw forbidden('该模型轮次已有预留，禁止再次调用');
  const blocked=await client.query(`SELECT 1 FROM ai_analysis_call_guard
    WHERE analysis_id=$1 AND status IN ('started','unknown') LIMIT 1`,[analysisId]);
  if(blocked.rows.length)throw forbidden('存在未知付费调用，禁止继续');
  const allocation=await client.query(`INSERT INTO ai_growth_paid_call_allocations
    (analysis_id,round,owner_id,bangkok_day,reserved_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING analysis_id`,
    [analysisId,round,ownerId,day,now]);
  if(!allocation.rows.length)throw forbidden('模型轮次预留冲突');
  const guard=await client.query(`INSERT INTO ai_analysis_call_guard
    (analysis_id,owner_id,round,execution_token,status,started_at)
    SELECT id,owner_id,$4,$3,'started',$5 FROM ai_analysis_records
    WHERE id=$1 AND owner_id=$2 AND execution_token=$3 AND status='processing'
      AND lease_expires_at>$5 AND cancel_requested=false
    ON CONFLICT(analysis_id,round) DO NOTHING RETURNING analysis_id`,
    [analysisId,ownerId,token,round,now]);
  if(!guard.rows.length)throw forbidden('模型调用重复或执行租约失效');
  await client.query('COMMIT');started=false;
  return {reserved:true,day,limit,round};
 }catch(error){
  if(started)await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release()}
}
async function dailyBudgetStatus(ownerId,{now=Date.now(),connectionPool=pool,limit=budgetLimit()}={}){
 if(!ownerId)throw Error('缺少用户身份');
 const day=bangkokDay(now);
 const r=await connectionPool.query(`SELECT count(*)::integer AS used
   FROM ai_growth_paid_call_allocations WHERE owner_id=$1 AND bangkok_day=$2`,[ownerId,day]);
 const used=Number(r.rows[0].used);
 return {day,limit,reservedCalls:used,remainingCalls:Math.max(0,limit-used),
  accounting:'reserved-paid-call-rounds; not a USD cost ceiling',
  autoPaidEnabled:false};
}
module.exports={bangkokDay,budgetLimit,beginBudgetedPaidCall,dailyBudgetStatus};
