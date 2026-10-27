'use strict';
const {randomUUID,createHash}=require('node:crypto');
const pool=require('../../db/aiPool');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function fingerprint(kind,scope,key){
 return createHash('sha256').update(JSON.stringify(['specialist-v1',kind,scope,key])).digest('hex');
}
function createSpecialistStore(query=(sql,args)=>pool.query(sql,args)){
 async function observe(ownerId,signal,now=Date.now()){
  if(typeof ownerId!=='string'||!ownerId||!['seo','kol'].includes(signal?.kind)||
     !['P0','P1','P2'].includes(signal.priority)||
     typeof signal.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(signal.fingerprint)||
     typeof signal.title!=='string'||!signal.title.trim()||signal.title.length>200||
     !Number.isSafeInteger(signal.sourceEnd)||signal.sourceEnd<=0||
     !Number.isSafeInteger(now)||!signal.evidence||typeof signal.evidence!=='object')
   fail('专项运营证据信号无效');
  const r=await query(`WITH changed AS (
   INSERT INTO ai_growth_specialist_tasks
    (id,owner_id,kind,fingerprint,priority,title,source_end,
     first_seen_at,last_seen_at,evidence,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9::jsonb,$8)
   ON CONFLICT(owner_id,kind,fingerprint) DO UPDATE SET
    source_end=EXCLUDED.source_end,last_seen_at=EXCLUDED.last_seen_at,
    occurrences=ai_growth_specialist_tasks.occurrences+1,
    evidence=EXCLUDED.evidence,title=EXCLUDED.title,
    priority=EXCLUDED.priority,updated_at=EXCLUDED.updated_at,
    status=CASE WHEN ai_growth_specialist_tasks.status IN ('resolved','dismissed')
       THEN 'open' ELSE ai_growth_specialist_tasks.status END,
    snooze_until=CASE WHEN ai_growth_specialist_tasks.status IN ('resolved','dismissed')
       THEN NULL ELSE ai_growth_specialist_tasks.snooze_until END,
    version=ai_growth_specialist_tasks.version+1
   WHERE ai_growth_specialist_tasks.source_end<EXCLUDED.source_end
   RETURNING *
  ), audit AS (
   INSERT INTO ai_growth_specialist_task_events
    (task_id,owner_id,event_type,details,created_at)
   SELECT id,owner_id,'observed',evidence,$8 FROM changed RETURNING id
  )
  SELECT changed.* FROM changed CROSS JOIN (SELECT count(*) FROM audit) audit_guard`,
   [randomUUID(),ownerId,signal.kind,signal.fingerprint,signal.priority,signal.title,
    signal.sourceEnd,now,JSON.stringify(signal.evidence)]);
  return r.rows[0]||null;
 }
 async function list(ownerId,{limit=100,includeClosed=false}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('专项待办查询参数无效');
  const r=await query(`SELECT * FROM ai_growth_specialist_tasks WHERE owner_id=$1
   AND ($3::boolean OR status NOT IN ('resolved','dismissed'))
   ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
    updated_at DESC LIMIT $2`,[ownerId,limit,includeClosed===true]);
  return r.rows;
 }
 async function detail(ownerId,id){
  const r=await query('SELECT * FROM ai_growth_specialist_tasks WHERE id=$1 AND owner_id=$2',
   [id,ownerId]);return r.rows[0]||null;
 }
 async function events(ownerId,id){
  if(!await detail(ownerId,id))return null;
  const r=await query(`SELECT event_type,details,created_at FROM ai_growth_specialist_task_events
   WHERE owner_id=$1 AND task_id=$2 ORDER BY id DESC LIMIT 100`,[ownerId,id]);
  return r.rows;
 }
 async function transition(ownerId,id,{action,expectedVersion,note=null,snoozeUntil=null},now=Date.now()){
  const actions={acknowledge:'acknowledged',start:'executing',execute:'executed',
   resolve:'resolved',dismiss:'dismissed',reopen:'open',snooze:null};
  if(!Object.hasOwn(actions,action)||!Number.isSafeInteger(expectedVersion)||
    expectedVersion<1||!Number.isSafeInteger(now)||
    note!=null&&(typeof note!=='string'||note.length>2000)||
    action==='execute'&&(!note||!note.trim())||
    action==='resolve'&&(!note||!note.trim())||
    action==='snooze'&&(!Number.isSafeInteger(snoozeUntil)||snoozeUntil<=now||
      snoozeUntil>now+30*86400000))
   fail('专项待办状态或操作说明无效');
  const transitions={
   acknowledge:['open'],start:['open','acknowledged'],
   execute:['executing'],resolve:['executed','acknowledged'],dismiss:['open','acknowledged'],
   reopen:['resolved','dismissed'],snooze:['open','acknowledged']
  };
  const r=await query(`WITH changed AS(
   UPDATE ai_growth_specialist_tasks SET
    status=CASE WHEN $4='snooze' THEN status ELSE $5 END,
    snooze_until=CASE WHEN $4='snooze' THEN $6::bigint ELSE NULL::bigint END,
    action_note=CASE WHEN $4 IN ('execute','start') THEN COALESCE($7,action_note) ELSE action_note END,
    review_note=CASE WHEN $4 IN ('resolve','dismiss') THEN COALESCE($7,review_note) ELSE review_note END,
    version=version+1,updated_at=$8
   WHERE id=$1 AND owner_id=$2 AND version=$3
    AND status=ANY($9::text[])
   RETURNING *
  ),audit AS(
   INSERT INTO ai_growth_specialist_task_events(task_id,owner_id,event_type,details,created_at)
   SELECT id,owner_id,$4,jsonb_build_object('note',$7,'snoozeUntil',$6),$8
   FROM changed RETURNING id
  )SELECT changed.* FROM changed CROSS JOIN(SELECT count(*) FROM audit) guard`,
   [id,ownerId,expectedVersion,action,actions[action],snoozeUntil,note,now,transitions[action]]);
  return r.rows[0]||null;
 }
 return {observe,list,detail,events,transition};
}
module.exports={createSpecialistStore,fingerprint};
