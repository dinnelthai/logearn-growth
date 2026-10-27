'use strict';
const {randomUUID}=require('node:crypto');
const aiPool=require('../../db/aiPool');
const VALID_GOALS=new Set(['activation','retention','conversion','revenue']);
const METRICS=new Set(['active_users','new_users','returning_users']);
function createAlertStore(query=(sql,args)=>aiPool.query(sql,args)){
 async function completedDays(ownerId,source,goal,limit=3){
  if(typeof ownerId!=='string'||!ownerId||typeof source!=='string'||!source||
   !VALID_GOALS.has(goal)||!Number.isInteger(limit)||limit<2||limit>30)throw Error('日报查询参数无效');
  const result=await query(`SELECT id,owner_id,status,business_scope,filter_conditions,
    data_snapshot,date_range_start,date_range_end
    FROM ai_analysis_records WHERE owner_id=$1 AND status='completed'
     AND filter_conditions->>'dailySchedule'='v1'
     AND business_scope->>'source'=$2
     AND filter_conditions->>'focusGoal'=$3
    ORDER BY date_range_end DESC LIMIT $4`,[ownerId,source,goal,limit]);
  return result.rows;
 }
 async function observe(ownerId,signal,now=Date.now()){
  if(!signal||typeof ownerId!=='string'||!ownerId||
   !/^[a-f0-9]{64}$/.test(signal.fingerprint)||!METRICS.has(signal.metric)||
   !VALID_GOALS.has(signal.goal)||!['increase','decline'].includes(signal.direction)||
   !['P0','P1'].includes(signal.priority)||!Number.isSafeInteger(signal.periodEnd)||
   !Number.isSafeInteger(now))throw Error('异常信号输入无效');
  const id=randomUUID();
  const payload=JSON.stringify({baseline:signal.baseline,observed:signal.observed,
   absolute:signal.absolute,fraction:signal.fraction,periodStart:signal.periodStart,
   periodEnd:signal.periodEnd,evidence:signal.evidence,causality:'unproven'});
  const result=await query(`WITH changed AS (
    INSERT INTO ai_growth_alerts
     (id,owner_id,fingerprint,source,goal,metric,direction,priority,
      first_period_end,last_period_end,occurrences,status,version,evidence,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,1,'open',1,$10::jsonb,$11,$11)
    ON CONFLICT(owner_id,fingerprint) DO UPDATE SET
      last_period_end=EXCLUDED.last_period_end,occurrences=ai_growth_alerts.occurrences+1,
      evidence=EXCLUDED.evidence,updated_at=EXCLUDED.updated_at,
      priority=CASE WHEN EXCLUDED.priority='P0' THEN 'P0' ELSE ai_growth_alerts.priority END,
      status=CASE WHEN ai_growth_alerts.status='resolved' THEN 'open' ELSE ai_growth_alerts.status END,
      snooze_until=CASE WHEN ai_growth_alerts.status='resolved' THEN NULL ELSE ai_growth_alerts.snooze_until END,
      version=ai_growth_alerts.version+1
    WHERE ai_growth_alerts.last_period_end<EXCLUDED.last_period_end
    RETURNING *
   ), audit AS (
    INSERT INTO ai_growth_alert_events(alert_id,owner_id,event_type,details,created_at)
    SELECT id,owner_id,'observed',evidence,$11 FROM changed RETURNING id
   )
   SELECT changed.* FROM changed CROSS JOIN (SELECT count(*) AS n FROM audit) checked`,
   [id,ownerId,signal.fingerprint,signal.source,signal.goal,signal.metric,signal.direction,
    signal.priority,signal.periodEnd,payload,now]);
  return result.rows[0]||null;
 }
 async function list(ownerId,{limit=50,includeResolved=false}={}){
  if(typeof ownerId!=='string'||!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>100)
   throw Error('告警查询参数无效');
  const result=await query(`SELECT id,fingerprint,source,goal,metric,direction,priority,
    first_period_end,last_period_end,occurrences,status,snooze_until,reviewed_at,
    operator_note,version,evidence,created_at,updated_at
    FROM ai_growth_alerts
    WHERE owner_id=$1 AND ($3::boolean OR status<>'resolved')
    ORDER BY CASE priority WHEN 'P0' THEN 0 ELSE 1 END,updated_at DESC
    LIMIT $2`,[ownerId,limit,includeResolved===true]);
  return result.rows;
 }
 async function history(ownerId,id,limit=50){
  if(!ownerId||!id||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('告警历史参数无效');
  const r=await query(`SELECT e.id,e.event_type,e.details,e.created_at FROM ai_growth_alert_events e
    JOIN ai_growth_alerts a ON a.id=e.alert_id AND a.owner_id=e.owner_id
    WHERE a.id=$1 AND a.owner_id=$2 ORDER BY e.id DESC LIMIT $3`,[id,ownerId,limit]);
  return r.rows;
 }
 async function transition(ownerId,id,{action,expectedVersion,snoozeUntil=null,note=null}){
  if(!ownerId||!id||!['acknowledge','snooze','resolve','reopen'].includes(action)||
   !Number.isSafeInteger(expectedVersion)||expectedVersion<1||
   (note!=null&&(typeof note!=='string'||note.length>1000)))throw Error('告警操作无效');
  const now=Date.now();
  if(action==='snooze'&&(!Number.isSafeInteger(snoozeUntil)||snoozeUntil<=now||
    snoozeUntil>now+30*86400000))throw Error('延后时间必须在未来30天内');
  const event={acknowledge:'acknowledged',snooze:'snoozed',resolve:'resolved',reopen:'reopened'}[action];
  const result=await query(`WITH changed AS (
   UPDATE ai_growth_alerts SET
     status=CASE WHEN $4='acknowledge' THEN 'acknowledged'
        WHEN $4='resolve' THEN 'resolved' WHEN $4='reopen' THEN 'open' ELSE status END,
     snooze_until=CASE WHEN $4='snooze' THEN $5 ELSE NULL END,
     operator_note=COALESCE($6,operator_note),reviewed_at=$7,updated_at=$7,
     version=version+1
   WHERE id=$1 AND owner_id=$2 AND version=$3
    AND (($4='acknowledge' AND status='open') OR
      ($4='snooze' AND status IN ('open','acknowledged')) OR
      ($4='resolve' AND status IN ('open','acknowledged')) OR
      ($4='reopen' AND status='resolved'))
   RETURNING *
  ), audit AS (
   INSERT INTO ai_growth_alert_events(alert_id,owner_id,event_type,details,created_at)
   SELECT id,owner_id,$8,jsonb_build_object('note',$6,'snoozeUntil',$5),$7
   FROM changed RETURNING id
  )
  SELECT changed.* FROM changed CROSS JOIN (SELECT count(*) AS n FROM audit) checked`,
  [id,ownerId,expectedVersion,action,snoozeUntil,note,now,event]);
  return result.rows[0]||null;
 }
 return {completedDays,observe,list,history,transition};
}
module.exports={createAlertStore};
