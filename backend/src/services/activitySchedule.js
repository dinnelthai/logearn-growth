const db=require('../db/connection'),remote=require('../data/hologres'),{randomUUID}=require('node:crypto')
const flights=new Map(),RETRY_MS=60000
const get=id=>db.prepare('SELECT * FROM growth_activities WHERE id=?').get(id)
const plannedIds=id=>db.prepare('SELECT user_id FROM growth_activity_planned_members WHERE activity_id=? ORDER BY user_id').all(id).map(r=>r.user_id)
function record(a,action,actor,before,after){db.prepare('INSERT INTO growth_activity_schedule_history VALUES(?,?,?,?,?,?,?)').run('schedule_'+randomUUID(),a.id,action,actor,before==null?null:JSON.stringify(before),JSON.stringify(after),Date.now())}
async function freeze(id,{force=false}={}){
 const a=get(id),now=Date.now()
 if(!a||a.schedule_state!=='scheduled'||a.archived_at||a.start_at>now)return a
 if(!force&&a.schedule_last_attempt_at!=null&&a.schedule_last_attempt_at+RETRY_MS>now)return a
 try{
  const ids=plannedIds(id);if(!ids.length)throw Error('计划名单为空，无法启动')
  const s=await remote.status(),observed=Date.parse(s.as_of||s.snapshot_cutoff)
  if(!Number.isFinite(observed)||observed<a.start_at)throw Error('数据截至尚未到达预约开始时间，等待更新后重试')
  const rows=await remote.query(`${remote.eventsCte()} SELECT a.account_id::text AS user_id,f.first_chip AS baseline_first_at FROM public.account_v2 a LEFT JOIN facts f ON f.user_key='user:'||a.account_id::text WHERE a.created_at<=$1::timestamptz AND a.created_at<=$3::timestamptz AND a.account_id::text=ANY($2::text[])`,[s.snapshot_cutoff,ids,new Date(a.start_at).toISOString()])
  const map=new Map(rows.map(r=>[String(r.user_id),r]));if(map.size!==ids.length||ids.some(id=>!map.has(id)))throw Error('部分计划账号无法匹配，请调整预约后重新校验')
  if(rows.some(r=>r.baseline_first_at!=null&&!Number.isFinite(Number(r.baseline_first_at))))throw Error('首次分析数据无效，请稍后重试')
  db.exec('BEGIN');try{
   const current=get(id)
   if(current.schedule_state!=='scheduled'||current.schedule_version!==a.schedule_version||current.archived_at){db.exec('ROLLBACK');return current}
   const insert=db.prepare('INSERT INTO growth_activity_members(activity_id,user_id,baseline_first_at) VALUES(?,?,?)')
   let prior=0;for(const id of ids){const first=map.get(id).baseline_first_at,baseline=first!=null&&Number(first)<a.start_at?Number(first):null;if(baseline!=null)prior++;insert.run(a.id,id,baseline)}
   const at=Date.now(),report={...JSON.parse(a.import_report),matched:ids.length,prior,eligible:ids.length-prior,baseline_pending:false,baseline_at:a.start_at,baseline_frozen_at:at}
   db.prepare("UPDATE growth_activities SET schedule_state='active',schedule_version=schedule_version+1,baseline_snapshot=?,baseline_frozen_at=?,schedule_error=NULL,schedule_last_attempt_at=?,import_report=? WHERE id=?").run(s.snapshot_id,at,at,JSON.stringify(report),a.id)
   record(a,'started','system',{schedule_version:a.schedule_version,start_at:a.start_at},{schedule_version:a.schedule_version+1,start_at:a.start_at,baseline_frozen_at:at,baseline_snapshot:s.snapshot_id,matched:ids.length,prior,eligible:ids.length-prior})
   db.exec('COMMIT');return get(id)
  }catch(e){db.exec('ROLLBACK');throw e}
 }catch(e){db.prepare("UPDATE growth_activities SET schedule_error=?,schedule_last_attempt_at=? WHERE id=? AND schedule_state='scheduled' AND schedule_version=? AND archived_at IS NULL").run(String(e.message).slice(0,1000),Date.now(),a.id,a.schedule_version);return get(id)}
}
function ensureStarted(id,options){if(!flights.has(id)){const promise=freeze(id,options).finally(()=>flights.delete(id));flights.set(id,promise)}return flights.get(id)}
async function tick(){if(process.env.ANALYTICS_STORAGE!=='hologres')return;const now=Date.now(),due=db.prepare("SELECT id FROM growth_activities WHERE schedule_state='scheduled' AND archived_at IS NULL AND start_at<=? AND (schedule_last_attempt_at IS NULL OR schedule_last_attempt_at<=?) ORDER BY schedule_last_attempt_at,start_at,id LIMIT 5").all(now,now-RETRY_MS);for(const a of due)await ensureStarted(a.id)}
function startScheduler(){if(process.env.ANALYTICS_STORAGE!=='hologres')return ()=>{};let running=false;const run=()=>{if(running)return;running=true;tick().catch(e=>console.error('Activity schedule:',e.message)).finally(()=>running=false)};const timer=setInterval(run,30000);timer.unref();run();return ()=>clearInterval(timer)}
module.exports={ensureStarted,tick,startScheduler,plannedIds,record}
