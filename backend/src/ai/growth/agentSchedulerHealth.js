'use strict';
const {randomUUID}=require('node:crypto');
const pool=require('../../db/aiPool');
const NAME='growth-autonomy';
function createSchedulerHealth(db=pool){
 async function begin({name=NAME,now=Date.now(),leaseMs=300000}={}){
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(leaseMs)||
    leaseMs<60000||leaseMs>600000)throw Error('调度租约参数无效');
  const token=randomUUID();
  const r=await db.query(`INSERT INTO ai_growth_agent_scheduler_health
    (name,run_token,lease_until,last_started_at,last_heartbeat_at,last_status,run_count)
    VALUES($1,$2,$3,$4,$4,'running',1)
    ON CONFLICT(name) DO UPDATE SET
      run_token=EXCLUDED.run_token,
      lease_until=EXCLUDED.lease_until,
      last_started_at=EXCLUDED.last_started_at,
      last_heartbeat_at=EXCLUDED.last_heartbeat_at,
      last_status='running',
      last_error=NULL,
      run_count=ai_growth_agent_scheduler_health.run_count+1
    WHERE ai_growth_agent_scheduler_health.lease_until IS NULL
      OR ai_growth_agent_scheduler_health.lease_until<$4
    RETURNING run_token,run_count`,[name,token,now+leaseMs,now]);
  return r.rows[0]?.run_token===token?{name,token}:null;
 }
 async function heartbeat(lease,{now=Date.now(),leaseMs=300000}={}){
  if(!lease?.token)return false;
  const r=await db.query(`UPDATE ai_growth_agent_scheduler_health
    SET lease_until=$3,last_heartbeat_at=$4
    WHERE name=$1 AND run_token=$2 AND last_status='running'
      AND lease_until>=$4 RETURNING name`,
   [lease.name,lease.token,now+leaseMs,now]);
  return !!r.rows.length;
 }
 async function finish(lease,{outcome='succeeded',summary={},error=null,now=Date.now()}={}){
  if(!lease?.token||!['succeeded','partial','failed'].includes(outcome)||
    !summary||typeof summary!=='object'||Array.isArray(summary))
   throw Error('调度收尾参数无效');
  const r=await db.query(`UPDATE ai_growth_agent_scheduler_health
    SET run_token=NULL,lease_until=NULL,last_finished_at=$3,
      last_heartbeat_at=$3,last_status=$4,last_summary=$5::jsonb,
      last_error=$6
    WHERE name=$1 AND run_token=$2 AND last_status='running'
      AND lease_until>=$3 RETURNING name,last_status`,
   [lease.name,lease.token,now,outcome,
    JSON.stringify(summary),error?String(error).slice(0,400):null]);
  return r.rows[0]||null;
 }
 async function status({name=NAME,now=Date.now()}={}){
  const r=await db.query(`SELECT name,lease_until,last_started_at,
    last_heartbeat_at,last_finished_at,last_status,last_summary,
    last_error,run_count FROM ai_growth_agent_scheduler_health WHERE name=$1`,[name]);
  const row=r.rows[0];
  if(!row)return {observed:false,live:false,stale:true,status:'never-run',
    lastStartedAt:null,lastFinishedAt:null,runCount:0,error:null};
  const live=row.last_status==='running'&&Number(row.lease_until)>=now&&
    Number(row.last_heartbeat_at)>=now-90000;
  const fresh=Number(row.last_finished_at)>now-90*60000;
  return {observed:true,live,stale:!live&&!fresh,
   status:row.last_status==='running'&&!live?'stale-running':row.last_status,
   lastStartedAt:row.last_started_at==null?null:Number(row.last_started_at),
   lastFinishedAt:row.last_finished_at==null?null:Number(row.last_finished_at),
   lastHeartbeatAt:row.last_heartbeat_at==null?null:Number(row.last_heartbeat_at),
   lastSummary:row.last_summary||null,lastError:row.last_error||null,
   runCount:Number(row.run_count)};
 }
 return {begin,heartbeat,finish,status};
}
module.exports={createSchedulerHealth,NAME};
