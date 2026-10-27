'use strict';
const pool=require('../../db/aiPool');
const {bangkokDay}=require('./budget');
function dailyAutonomyLimit(env=process.env){
 const raw=env.AI_AUTONOMY_PAID_CALLS_PER_DAY;
 if(raw==null||raw==='')return 0;
 if(!/^(0|[1-9][0-9]*)$/.test(String(raw)))throw Error('AI_AUTONOMY_PAID_CALLS_PER_DAY 配置无效');
 const value=Number(raw);
 if(!Number.isSafeInteger(value)||value>100)throw Error('AI_AUTONOMY_PAID_CALLS_PER_DAY 只能是0到100');
 return value;
}
function forbidden(message){
 return Object.assign(Error(message),{status:409,reason:'autonomy-paid-budget'});
}
// PostgreSQL serializes all owner/day workers with a transaction advisory lock.
// Counts reserve BEFORE provider I/O; ambiguous requests are never refunded.
async function beginAutonomyPaidCall({
 analysisId,ownerId,token,round,now=Date.now(),limit=dailyAutonomyLimit(),
 connectionPool=pool
}={}){
 if(!analysisId||!ownerId||!token||!Number.isSafeInteger(round)||round<0||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(limit)||limit<0||limit>100)
  throw Error('自主管理付费调用参数无效');
 if(process.env.AI_AUTONOMY_PAID_DAILY_ENABLED!=='1')
  throw forbidden('自动分析付费开关未开启');
 if(limit===0)throw forbidden('每日模型轮次预算默认为0');
 const day=bangkokDay(now),client=await connectionPool.connect();let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[ownerId,day+':autonomy']);
  const eligible=await client.query(`SELECT id FROM ai_analysis_records
   WHERE id=$1 AND owner_id=$2 AND execution_token=$3 AND status='processing'
     AND cancel_requested=false AND lease_expires_at>$4
     AND analysis_type='optimization'
     AND filter_conditions->>'dailySchedule'='v1' FOR UPDATE`,
    [analysisId,ownerId,token,now]);
  if(!eligible.rows.length)throw forbidden('任务不属于当前授权的每日分析，或租约已失效');
  const prior=await client.query(`SELECT 1 FROM ai_growth_autonomy_paid_allocations
    WHERE analysis_id=$1 AND round=$2`,[analysisId,round]);
  if(prior.rows.length)throw forbidden('相同模型轮次已经预留，禁止重复付费');
  const counted=await client.query(`SELECT count(*)::integer AS used
    FROM ai_growth_autonomy_paid_allocations WHERE owner_id=$1 AND bangkok_day=$2`,[ownerId,day]);
  if(Number(counted.rows[0].used)>=limit)throw forbidden('每日自主分析模型轮次预算耗尽');
  const outstanding=await client.query(`SELECT 1 FROM ai_analysis_call_guard
    WHERE analysis_id=$1 AND status IN ('started','unknown') LIMIT 1`,[analysisId]);
  if(outstanding.rows.length)throw forbidden('存在状态不明的远程调用，禁止继续');
  const allocation=await client.query(`INSERT INTO ai_growth_autonomy_paid_allocations
    (analysis_id,round,owner_id,bangkok_day,reserved_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING analysis_id`,
    [analysisId,round,ownerId,day,now]);
  if(!allocation.rows.length)throw forbidden('模型调用配额预留冲突');
  const guard=await client.query(`INSERT INTO ai_analysis_call_guard
    (analysis_id,owner_id,round,execution_token,status,started_at)
    VALUES($1,$2,$3,$4,'started',$5)
    ON CONFLICT (analysis_id,round) DO NOTHING RETURNING analysis_id`,
    [analysisId,ownerId,round,token,now]);
  if(!guard.rows.length)throw forbidden('模型调用防重复标记已存在');
  await client.query('COMMIT');begun=false;
  return {reserved:true,day,round,limit,accounting:'reserved-rounds-not-dollars'};
 }catch(error){if(begun)await client.query('ROLLBACK').catch(()=>{});throw error}
 finally{client.release()}
}
async function autonomyBudgetStatus(ownerId,{now=Date.now(),connectionPool=pool,limit=dailyAutonomyLimit()}={}){
 if(!ownerId)throw Error('缺少用户身份');
 const day=bangkokDay(now);
 const r=await connectionPool.query(`SELECT count(*)::integer AS used FROM
 ai_growth_autonomy_paid_allocations WHERE owner_id=$1 AND bangkok_day=$2`,[ownerId,day]);
 const used=Number(r.rows[0].used);
 return {day,limit,used,remaining:Math.max(0,limit-used),
   paidEnabled:process.env.AI_AUTONOMY_PAID_DAILY_ENABLED==='1',
   accounting:'call-reservations-not-dollar-cost'};
}
module.exports={dailyAutonomyLimit,beginAutonomyPaidCall,autonomyBudgetStatus};
