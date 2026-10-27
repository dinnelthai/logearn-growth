'use strict';
const {randomUUID,createHash}=require('node:crypto');
const pool=require('../../db/aiPool');
const {SUPPORTED}=require('./agentScore');
const GOALS=new Set(['activation','retention','conversion','revenue']);
function bad(message,status=400){throw Object.assign(Error(message),{status})}
function createAgentStore(db=pool){
 async function targets(ownerId,{source='all'}={}){
  if(!ownerId||typeof source!=='string'||!source||source.length>200)bad('目标查询身份或来源无效');
  const r=await db.query(`SELECT id,metric,source,goal,target::float8 AS target,
   weight,version,active,created_at,updated_at
   FROM ai_growth_agent_targets WHERE owner_id=$1 AND source=$2
   ORDER BY goal,metric`,[ownerId,source]);
  return r.rows;
 }
 async function setTarget(ownerId,input,{now=Date.now()}={}){
  const {metric,goal,source='all',target,weight=1,expectedVersion=null,active=true}=input||{};
  if(!ownerId||!SUPPORTED.includes(metric)||!GOALS.has(goal)||
   typeof source!=='string'||!source||source.length>200||
   !Number.isFinite(target)||target<=0||target>100000000||
   ['activation_rate','d7'].includes(metric)&&target>1||
   !Number.isSafeInteger(weight)||weight<1||weight>10||
   expectedVersion!==null&&(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)||
   typeof active!=='boolean'||!Number.isSafeInteger(now))bad('运营目标配置无效');
  // New targets are insert-only; editing requires the exact observed version.
  // Avoid INSERT ... SELECT WHERE version that suppresses conflict updates.
  const result=expectedVersion===null
   ?await db.query(`INSERT INTO ai_growth_agent_targets
     (id,owner_id,metric,source,goal,target,weight,version,active,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$9)
     ON CONFLICT(owner_id,goal,source,metric) DO NOTHING
     RETURNING id,metric,goal,source,target::float8 AS target,weight,version,active`,
    [randomUUID(),ownerId,metric,source,goal,target,weight,active,now])
   :await db.query(`UPDATE ai_growth_agent_targets SET
     target=$5,weight=$6,active=$7,version=version+1,updated_at=$8
     WHERE owner_id=$1 AND goal=$2 AND source=$3 AND metric=$4 AND version=$9
     RETURNING id,metric,goal,source,target::float8 AS target,weight,version,active`,
    [ownerId,goal,source,metric,target,weight,active,now,expectedVersion]);
  if(!result.rows.length)bad('目标版本已变化；请刷新后再保存',409);
  return result.rows[0];
 }
 async function dailyAnalyses(ownerId,day,source){
  const r=await db.query(`SELECT id,owner_id,status,result,data_snapshot,
    filter_conditions,created_at,date_range_start,date_range_end,error_message
    FROM ai_analysis_records
    WHERE owner_id=$1 AND business_scope->>'source'=$2
      AND filter_conditions->>'dailySchedule'='v1'
      AND filter_conditions->>'date'=$3
    ORDER BY created_at DESC LIMIT 24`,[ownerId,source,day]);
  const m=new Map();
  for(const row of r.rows){
   const goal=row.filter_conditions?.focusGoal;
   if(GOALS.has(goal)&&!m.has(goal))m.set(goal,row);
  }
  return [...m.values()];
 }
 async function upsertBrief(ownerId,brief,{now=Date.now()}={}){
  if(!ownerId||!/^\d{4}-\d{2}-\d{2}$/.test(brief?.day)||
   typeof brief.source!=='string'||!['ready','partial','blocked'].includes(brief.status)||
   !Array.isArray(brief.analysisIds)||!brief.score||!brief.report||!brief.quality)
   bad('每日运营汇报格式无效');
  const id='agent-brief-'+createHash('sha256').update(JSON.stringify([
   ownerId,brief.day,brief.source])).digest('hex').slice(0,32);
  const r=await db.query(`INSERT INTO ai_growth_agent_briefs
   (id,owner_id,day,source,status,score,report,analysis_ids,quality,
     strategy_version,generated_at)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)
   ON CONFLICT(owner_id,day,source) DO UPDATE SET
    status=EXCLUDED.status,score=EXCLUDED.score,report=EXCLUDED.report,
    analysis_ids=EXCLUDED.analysis_ids,quality=EXCLUDED.quality,
    strategy_version=EXCLUDED.strategy_version,generated_at=EXCLUDED.generated_at
   WHERE ai_growth_agent_briefs.status='blocked' OR
    (ai_growth_agent_briefs.status='partial' AND EXCLUDED.status IN ('partial','ready'))
   RETURNING *`,[id,ownerId,brief.day,brief.source,brief.status,
    JSON.stringify(brief.score),JSON.stringify(brief.report),
    JSON.stringify(brief.analysisIds),JSON.stringify(brief.quality),
    brief.strategyVersion??null,now]);
  const value=r.rows[0]||await getBrief(ownerId,brief.day,brief.source);
  // Internal daily brief notification; no external delivery.
  if(value&&['ready','partial'].includes(value.status)){
   const dayEnd=Date.parse(brief.day+'T00:00:00+07:00')+86400000;
   const noticeId='notice-'+id;
   await db.query(`INSERT INTO ai_growth_notifications
    (id,owner_id,kind,resource_id,period_end,message,created_at)
    VALUES($1,$2,'daily-brief',$3,$4,$5,$6)
    ON CONFLICT(owner_id,kind,resource_id,period_end) DO NOTHING`,
    [noticeId,ownerId,id,dayEnd,(value.status==='ready'?'LogEarn AI Growth 正式日报 · ':'LogEarn AI Growth 待补证据日报 · ')+brief.day,now]);
  }
  return value;
 }
 async function getBrief(ownerId,day,source='all'){
  const r=await db.query(`SELECT * FROM ai_growth_agent_briefs
   WHERE owner_id=$1 AND day=$2 AND source=$3`,[ownerId,day,source]);
  return r.rows[0]||null;
 }
 async function listBriefs(ownerId,{source='all',limit=30}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>90)bad('日报列表参数无效');
  const r=await db.query(`SELECT * FROM ai_growth_agent_briefs
   WHERE owner_id=$1 AND source=$2 ORDER BY day DESC LIMIT $3`,
   [ownerId,source,limit]);
  return r.rows;
 }
 async function feedback(ownerId,{source='all',limit=100}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>300)
   bad('学习反馈查询参数无效');
  const r=await db.query(`SELECT s.id AS suggestion_id,s.analysis_id,s.user_status,
    s.validation_metrics,s.forecast,s.priority,s.created_at,s.executed_at,
    a.business_scope,a.filter_conditions,
    r.id AS retrospective_id,r.created_at AS reviewed_at,
    r.metric_changes,r.effect_period,r.has_improvement,r.has_causality,r.confidence
   FROM ai_suggestions s
   JOIN ai_analysis_records a ON a.id=s.analysis_id AND a.owner_id=s.owner_id
   JOIN ai_retrospectives r ON r.suggestion_id=s.id AND r.owner_id=s.owner_id
   WHERE s.owner_id=$1 AND s.user_status='executed'
     AND ($2='all' OR a.business_scope->>'source'=$2)
   ORDER BY r.created_at DESC LIMIT $3`,[ownerId,source,limit]);
  return r.rows;
 }
 async function upsertJudgements(ownerId,judgements,{now=Date.now()}={}){
  for(const j of judgements){
   if(!['observed-supported','observed-contradicted','insufficient'].includes(j.assessment))bad('评价状态无效');
   const id='agent-judge-'+createHash('sha256').update(JSON.stringify([
    ownerId,j.suggestionId,j.retrospectiveId])).digest('hex').slice(0,32);
   await db.query(`INSERT INTO ai_growth_agent_judgements
    (id,owner_id,suggestion_id,analysis_id,retrospective_id,
      assessment,metric,evidence,checked_at)
    SELECT $1,s.owner_id,s.id,s.analysis_id,$4,$5,$6,$7::jsonb,$8
    FROM ai_suggestions s JOIN ai_retrospectives r
     ON r.suggestion_id=s.id AND r.owner_id=s.owner_id AND r.id=$4
    WHERE s.id=$3 AND s.owner_id=$2 AND s.user_status='executed'
    ON CONFLICT(owner_id,suggestion_id,retrospective_id) DO NOTHING`,
    [id,ownerId,j.suggestionId,j.retrospectiveId,j.assessment,j.metric,
     JSON.stringify(j.evidence),now]);
  }
 }
 async function getStrategy(ownerId,goal,source='all'){
  if(!GOALS.has(goal)||!ownerId)bad('策略查询参数无效');
  const r=await db.query(`SELECT version,policy,evidence,created_at,feedback_digest
   FROM ai_growth_agent_strategy WHERE owner_id=$1 AND goal=$2 AND source=$3
   ORDER BY version DESC LIMIT 1`,[ownerId,goal,source]);
  return r.rows[0]||null;
 }
 async function saveStrategy(ownerId,goal,source,input,{now=Date.now()}={}){
  if(!ownerId||!GOALS.has(goal)||typeof input?.digest!=='string'||
    !/^[0-9a-f]{64}$/.test(input.digest)||!input.policy||!input.evidence)
   bad('学习策略数据无效');
  // Serialized per owner/source/goal to allocate monotonic policy versions.
  const conn=await db.connect();let started=false;
  try{
   await conn.query('BEGIN');started=true;
   await conn.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
    [ownerId,source+':'+goal+':strategy']);
   const existing=await conn.query(`SELECT id,version,policy,feedback_digest
     FROM ai_growth_agent_strategy WHERE owner_id=$1 AND source=$2 AND goal=$3
     ORDER BY version DESC LIMIT 1`,[ownerId,source,goal]);
   if(existing.rows[0]?.feedback_digest===input.digest){
    await conn.query('COMMIT');started=false;
    return {...existing.rows[0],unchanged:true};
   }
   const version=Number(existing.rows[0]?.version||0)+1,id=randomUUID();
   const result=await conn.query(`INSERT INTO ai_growth_agent_strategy
    (id,owner_id,source,goal,version,feedback_digest,policy,evidence,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING *`,
    [id,ownerId,source,goal,version,input.digest,
     JSON.stringify(input.policy),JSON.stringify(input.evidence),now]);
   await conn.query('COMMIT');started=false;
   return result.rows[0];
  }catch(error){if(started)await conn.query('ROLLBACK').catch(()=>{});throw error}
  finally{conn.release()}
 }
 return {targets,setTarget,dailyAnalyses,upsertBrief,getBrief,listBriefs,
  feedback,upsertJudgements,getStrategy,saveStrategy};
}
module.exports={createAgentStore,GOALS};
