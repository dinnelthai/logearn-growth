'use strict';
const {randomUUID}=require('node:crypto');
const pool=require('../../db/aiPool');
const {validateScope}=require('../../analytics/businessPriorities');

function createInvestigationStore(query=(sql,args)=>pool.query(sql,args)){
 async function propose(ownerId,alert,{now=Date.now()}={}){
  if(typeof ownerId!=='string'||!ownerId||!alert?.id||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(Number(alert.last_period_end)))
   throw Error('调查提案输入无效');
  // No new model job is created; a P0 decline must still be open, unsnoozed
  // and refer to the exact newest complete observed period.
  const result=await query(`WITH candidate AS (
    SELECT id,owner_id,last_period_end,evidence
      FROM ai_growth_alerts WHERE id=$1 AND owner_id=$2
      AND priority='P0' AND direction='decline' AND status='open'
      AND (snooze_until IS NULL OR snooze_until<=$4)
      AND last_period_end=$3
  ), inserted AS (
    INSERT INTO ai_growth_investigation_proposals
      (id,owner_id,alert_id,period_end,evidence,created_at,updated_at)
    SELECT $5,c.owner_id,c.id,c.last_period_end,c.evidence,$4,$4 FROM candidate c
    ON CONFLICT (owner_id,alert_id,period_end) DO NOTHING
    RETURNING *
  ), notice AS (
    INSERT INTO ai_growth_notifications
      (id,owner_id,kind,resource_id,period_end,message,created_at)
    SELECT $6,owner_id,'proposal',id,period_end,
      '重大增长异常需要人工审阅调查提案',$4 FROM inserted
    ON CONFLICT (owner_id,kind,resource_id,period_end) DO NOTHING RETURNING id
  )
  SELECT inserted.* FROM inserted CROSS JOIN (SELECT count(*) AS count FROM notice) n`,
  [alert.id,ownerId,Number(alert.last_period_end),now,randomUUID(),randomUUID()]);
  return result.rows[0]||null;
 }
 async function list(ownerId,{limit=50}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>100)
   throw Error('调查列表参数无效');
  const result=await query(`SELECT p.*,a.source,a.goal,a.metric,a.direction,
      a.priority,a.status AS alert_status,a.snooze_until,a.last_period_end
    FROM ai_growth_investigation_proposals p
    JOIN ai_growth_alerts a ON a.id=p.alert_id AND a.owner_id=p.owner_id
    WHERE p.owner_id=$1 ORDER BY
      CASE p.status WHEN 'proposed' THEN 0 ELSE 1 END,p.created_at DESC LIMIT $2`,[ownerId,limit]);
  return result.rows;
 }
 async function get(ownerId,id){
  if(!ownerId||!id)throw Error('调查提案 ID 无效');
  const result=await query(`SELECT p.*,a.source,a.goal,a.metric,a.direction,
      a.priority,a.status AS alert_status,a.snooze_until,a.last_period_end
    FROM ai_growth_investigation_proposals p
    JOIN ai_growth_alerts a ON a.id=p.alert_id AND a.owner_id=p.owner_id
    WHERE p.owner_id=$1 AND p.id=$2`,[ownerId,id]);
  return result.rows[0]||null;
 }
 async function decide(ownerId,id,expectedVersion,action,now=Date.now()){
  if(!ownerId||!id||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
   !['approve','dismiss'].includes(action)||!Number.isSafeInteger(now))
   throw Error('调查审批操作无效');
  const status=action==='approve'?'approved':'dismissed';
  const result=await query(`UPDATE ai_growth_investigation_proposals p
     SET status=$4,version=version+1,updated_at=$5
    FROM ai_growth_alerts a
    WHERE p.owner_id=$1 AND p.id=$2 AND p.version=$3 AND p.status='proposed'
      AND a.id=p.alert_id AND a.owner_id=p.owner_id
      AND ( $4='dismissed' OR (
        a.status='open' AND a.priority='P0' AND a.direction='decline'
        AND (a.snooze_until IS NULL OR a.snooze_until<=$5)
        AND a.last_period_end=p.period_end
      ))
    RETURNING p.*`,[ownerId,id,expectedVersion,status,now]);
  return result.rows[0]||null;
 }
 async function attachAnalysis(ownerId,id,analysisId){
  if(!ownerId||!id||!analysisId)throw Error('调查关联信息无效');
  const r=await query(`UPDATE ai_growth_investigation_proposals
    SET analysis_id=$3,updated_at=$4
    WHERE owner_id=$1 AND id=$2 AND status='approved'
      AND (analysis_id IS NULL OR analysis_id=$3) RETURNING *`,
    [ownerId,id,analysisId,Date.now()]);
  return r.rows[0]||null;
 }
 function analysisRequest(proposal,ownerId){
  if(!proposal||proposal.owner_id!==ownerId||proposal.status!=='approved'||
    proposal.alert_status!=='open'&&proposal.analysis_id==null)
   throw Error('调查提案不允许执行');
  const scope=validateScope({source:proposal.source});
  const end=Number(proposal.period_end),start=end-86400000;
  if(!Number.isSafeInteger(end)||!Number.isSafeInteger(start)||start<86400000)
   throw Error('原始异常时间范围无效');
  const evidence=proposal.evidence||{};
  const question='人工批准的跨日异常调查；原告警ID='+proposal.alert_id+
    '，指标='+proposal.metric+'，仅观测变化，未经因果验证。'+
    '已存证据：'+JSON.stringify({
      previous:evidence.baseline,current:evidence.observed,
      fraction:evidence.fraction,baselineAnalysisId:evidence.evidence?.baselineAnalysisId,
      currentAnalysisId:evidence.evidence?.currentAnalysisId
    })+'。先核对采集覆盖和原始数据，禁止自动操作外部系统。';
  return {ownerId,requestKey:'growth-investigate:'+proposal.id,
   title:'跨日异常调查 · '+proposal.metric,
   analysisType:'anomaly',dateRangeStart:start,dateRangeEnd:end,
   businessScope:scope,userQuestion:question.slice(0,5000),
   dataSnapshot:{},filterConditions:{businessScope:scope,focusGoal:proposal.goal,
     modelMode:'auto',sourceAlertId:proposal.alert_id,sourceAlertPeriodEnd:end,
     humanApproved:true,proposalId:proposal.id}};
 }
 return {propose,list,get,decide,attachAnalysis,analysisRequest};
}
module.exports={createInvestigationStore};
