'use strict';
const {createHash}=require('node:crypto');
const pool=require('../../db/aiPool');
function createAgentOutbox(db=pool){
 async function enqueue({ownerId,briefId,day,status,score,summary},now=Date.now()){
  if(!ownerId||!briefId||!['ready','partial'].includes(status)||
     !/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(now))
   throw Error('日报通知内容无效');
  const id='agent-out-'+createHash('sha256').update(JSON.stringify([
   ownerId,briefId,status,'webhook'])).digest('hex').slice(0,32);
  const payload={version:'growth-daily-brief-v1',briefId,day,status,
   score:score??null,summary:String(summary||'').slice(0,1000),
   requiresHumanApproval:true,causalProof:false};
  const r=await db.query(`INSERT INTO ai_growth_delivery_outbox
    (id,owner_id,channel,source_kind,source_id,state,next_attempt_at,
      payload,created_at,updated_at)
    VALUES($1,$2,'webhook',$3,$4,'pending',$5,$6::jsonb,$5,$5)
    ON CONFLICT(owner_id,channel,source_kind,source_id) DO NOTHING
    RETURNING id`,[id,ownerId,'daily-'+status,briefId,now,JSON.stringify(payload)]);
  return {id,status:r.rows.length?'queued':'existing'};
 }
 // Explicitly authorized owner webhooks only; no private member contents.
 async function enqueueExecutiveNotice({ownerId,notice},now=Date.now()){
  const kinds=['approval','accepted-not-started','execution-stalled','review-due','task-overdue'];
  if(typeof ownerId!=='string'||!ownerId||
   !/^[a-f0-9]{64}$/.test(notice?.id||'')||!kinds.includes(notice.kind)||
   !Number.isSafeInteger(notice.dueAt)||!Number.isSafeInteger(now))
   throw Error('经营提醒身份或类型无效');
  const id='agent-out-'+createHash('sha256').update(JSON.stringify(
   [ownerId,'executive-reminder',notice.id])).digest('hex').slice(0,32);
  const payload={version:'growth-executive-reminder-v1',noticeId:notice.id,
   kind:notice.kind,dueAt:notice.dueAt,
   summary:'LogEarn 有一项已到期的增长运营事项，请登录工作台处理',
   requiresHumanApproval:true,causalProof:false,externalActions:0};
  const result=await db.query(`INSERT INTO ai_growth_delivery_outbox
    (id,owner_id,channel,source_kind,source_id,state,next_attempt_at,
      payload,created_at,updated_at)
    VALUES($1,$2,'webhook','executive-reminder',$3,'pending',$4,$5::jsonb,$4,$4)
    ON CONFLICT(owner_id,channel,source_kind,source_id) DO NOTHING RETURNING id`,
    [id,ownerId,notice.id,now,JSON.stringify(payload)]);
  return {id,status:result.rows.length?'queued':'existing'};
 }
 async function claim(ownerIds,{now=Date.now(),limit=10}={}){
  if(!Array.isArray(ownerIds)||!ownerIds.length||!Number.isSafeInteger(limit)||
     limit<1||limit>20)throw Error('投递出队授权范围无效');
  const r=await db.query(`WITH due AS (
     SELECT id FROM ai_growth_delivery_outbox WHERE owner_id=ANY($1::text[])
       AND channel='webhook' AND attempts<5 AND
       ((state='pending' AND next_attempt_at<=$2) OR
        (state='sending' AND locked_until<$2))
     ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $3
    )UPDATE ai_growth_delivery_outbox o SET
      state='sending',attempts=o.attempts+1,locked_until=$2+30000,updated_at=$2
    FROM due WHERE o.id=due.id
    RETURNING o.id,o.owner_id,o.attempts,o.payload`,[ownerIds,now,limit]);
  return r.rows;
 }
 async function finish(item,{delivered,error=null,httpStatus=null,now=Date.now()}){
  const terminal=!delivered&&Number(item.attempts)>=5;
  const retry=now+Math.min(24*3600000,Math.pow(2,Number(item.attempts))*60000);
  const r=await db.query(`UPDATE ai_growth_delivery_outbox SET
    state=$3,locked_until=NULL,delivered_at=$4,
    last_error=$5,last_http_status=$6,next_attempt_at=$7,updated_at=$8
    WHERE id=$1 AND owner_id=$2 AND state='sending' AND attempts=$9
      AND locked_until>=$8 RETURNING id,state`,
    [item.id,item.owner_id,delivered?'delivered':terminal?'failed':'pending',
      delivered?now:null,delivered?null:String(error||'Delivery error').slice(0,250),
      httpStatus,delivered?now:retry,now,item.attempts]);
  return r.rows[0]||null;
 }
 return {enqueue,enqueueExecutiveNotice,claim,finish};
}
module.exports={createAgentOutbox};
