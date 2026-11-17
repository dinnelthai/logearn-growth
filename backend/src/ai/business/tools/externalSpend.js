'use strict';
const {randomUUID}=require('node:crypto');
const defaultPool=require('../../../db/aiPool');
const CAPABILITY='openseo.keyword_research';
const deny=(message,status=409)=>{throw Object.assign(Error(message),{status,code:'external_spend_denied'})};
const micro=n=>Number.isSafeInteger(n)&&n>0&&n<=1000000000;
const name=s=>typeof s==='string'&&/^[a-zA-Z0-9:._-]{1,128}$/.test(s);
const bangkokDay=ms=>new Date(ms+7*60*60*1000).toISOString().slice(0,10);
function validate(args){
 const a=args||{};
 if(![a.ownerId,a.workspaceId,a.connectionId,a.taskId,a.callKey].every(name)||
  a.capabilityId!==CAPABILITY||!name(a.executionToken)||!micro(a.reserveMicrousd)||
  !Number.isSafeInteger(a.now)||a.now<=0)deny('无效的外部付费预留身份或金额',400);
}
// Never return "free" when price, provider receipt, or outcome is unknown.
// Committed reservation survives timeout/crash and forbids the same call key.
async function reserveExternalSpend(args,{pool=defaultPool}={}){
 validate(args);
 const {ownerId,workspaceId,connectionId,capabilityId,taskId,
  callKey,executionToken,reserveMicrousd,now}=args;
 const day=bangkokDay(now),client=await pool.connect();let transaction=false;
 try{
  await client.query('BEGIN');transaction=true;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
   [ownerId,workspaceId+':'+connectionId+':'+capabilityId+':'+day]);
  const task=await client.query(`SELECT id FROM ai_analysis_records
   WHERE id=$1 AND owner_id=$2 AND execution_token=$3
     AND status='processing' AND cancel_requested=FALSE AND lease_expires_at>$4
   FOR UPDATE`,[taskId,ownerId,executionToken,now]);
  if(!task.rows.length)deny('付费任务租约已失效或不属于当前 owner',403);
  const policy=await client.query(`SELECT enabled,currency,day_timezone,
    daily_limit_microusd,per_call_reserve_microusd
   FROM ai_external_spend_policy
   WHERE owner_id=$1 AND workspace_id=$2 AND connection_id=$3
     AND capability_id=$4 FOR UPDATE`,
   [ownerId,workspaceId,connectionId,capabilityId]);
  const p=policy.rows[0];
  if(!p||p.enabled!==true||p.currency!=='USD'||p.day_timezone!=='Asia/Bangkok')
   deny('外部研究付费策略未授权');
  const limit=Number(p.daily_limit_microusd);
  const perCall=Number(p.per_call_reserve_microusd);
  if(!micro(limit)||!micro(perCall)||reserveMicrousd>perCall||reserveMicrousd>limit)
   deny('没有可用且充分的费用额度');
  const previous=await client.query(`SELECT id FROM ai_external_spend_reservations
   WHERE owner_id=$1 AND workspace_id=$2 AND connection_id=$3
    AND capability_id=$4 AND task_id=$5 AND call_key=$6`,
   [ownerId,workspaceId,connectionId,capabilityId,taskId,callKey]);
  if(previous.rows.length)deny('付费调用已预留或结果未知，禁止重试');
  // Keep unknown reservations in the spent amount until supplier reconciliation.
  const used=await client.query(`SELECT COALESCE(SUM(
   GREATEST(reserved_microusd,COALESCE(actual_microusd,0))),0) AS used
   FROM ai_external_spend_reservations
   WHERE owner_id=$1 AND workspace_id=$2 AND connection_id=$3
    AND capability_id=$4 AND bangkok_day=$5`,
   [ownerId,workspaceId,connectionId,capabilityId,day]);
  const consumed=Number(used.rows[0]?.used);
  if(!Number.isSafeInteger(consumed)||consumed+reserveMicrousd>limit)
   deny('本日外部研究预算不足');
  const id=randomUUID();
  const created=await client.query(`INSERT INTO ai_external_spend_reservations
   (id,owner_id,workspace_id,connection_id,capability_id,task_id,
    call_key,bangkok_day,state,reserved_microusd,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'unknown',$9,$10)
   ON CONFLICT DO NOTHING RETURNING id`,
   [id,ownerId,workspaceId,connectionId,capabilityId,taskId,
    callKey,day,reserveMicrousd,now]);
  if(!created.rows.length)deny('付费预留发生并发冲突');
  await client.query('COMMIT');transaction=false;
  return {id,day,currency:'USD',reserveMicrousd,costStatus:'unknown'};
 }catch(error){
  if(transaction)await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release()}
}
// Invoice reconciliation is a deliberate admin action, NEVER triggered by an
// ambiguous network response. No automatic "free" or refund after timeouts.
async function settleFromInvoice({ownerId,reservationId,actualMicrousd,
 providerReceipt,now=Date.now()}, {pool=defaultPool}={}){
 if(!name(ownerId)||!name(reservationId)||!Number.isSafeInteger(actualMicrousd)||
    actualMicrousd<0||actualMicrousd>1000000000||
    !name(providerReceipt)||!Number.isSafeInteger(now))
   deny('无效的供应商对账信息',400);
 const result=await pool.query(`UPDATE ai_external_spend_reservations
  SET state='settled',actual_microusd=$3,provider_receipt=$4,settled_at=$5
  WHERE id=$1 AND owner_id=$2 AND state='unknown' RETURNING id`,
  [reservationId,ownerId,actualMicrousd,providerReceipt,now]);
 if(!result.rows.length)deny('已结算或没有权限访问该预留',409);
 return {reservationId,costStatus:'settled',actualMicrousd};
}
module.exports={reserveExternalSpend,settleFromInvoice,bangkokDay};
