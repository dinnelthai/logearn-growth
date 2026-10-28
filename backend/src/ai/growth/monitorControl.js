'use strict';
// Per-owner opt-in for the existing read-only Growth alert monitor.
// Worker availability and operator intent are deliberately separate states.
const pool=require('../../db/aiPool');
function createMonitorControl(query=(sql,params)=>pool.query(sql,params)){
 const owner=x=>{if(typeof x!=='string'||!x.trim()||x.length>256)throw Object.assign(Error('监控账号无效'),{status:400});return x};
 const stamp=now=>{if(!Number.isSafeInteger(now)||now<0)throw Error('监控时间无效');return now};
 function view(row,now){
  const workerSeenAt=row?.worker_seen_at==null?null:Number(row.worker_seen_at);
  const workerOnline=workerSeenAt!=null&&workerSeenAt<=now&&now-workerSeenAt<150000;
  const enabled=row?.enabled===true;
  return {enabled,version:Number(row?.version||0),workerOnline,
   status:!enabled?'disabled':workerOnline?'running':'waiting-for-worker',
   workerSeenAt,lastScanAt:row?.last_scan_at==null?null:Number(row.last_scan_at),
   lastScanStatus:row?.last_scan_status||null,
   lastScanSummary:row?.last_scan_summary||null,
   updatedAt:row?.updated_at==null?null:Number(row.updated_at),
   safeMode:true,paidModelCalls:false,externalActions:false};
 }
 async function get(ownerId,{now=Date.now()}={}){
  owner(ownerId);stamp(now);
  const result=await query('SELECT * FROM ai_growth_monitor_settings WHERE owner_id=$1',[ownerId]);
  return view(result.rows[0]||null,now);
 }
 async function set(ownerId,{enabled,expectedVersion,now=Date.now()}={}){
  owner(ownerId);stamp(now);
  if(typeof enabled!=='boolean'||!Number.isSafeInteger(expectedVersion)||expectedVersion<0)
   throw Object.assign(Error('监控开关参数无效'),{status:400});
  // Separate atomic INSERT/UPDATE paths; both check the expected version.
  // A stale browser cannot overwrite another operator's decision.
  const result=expectedVersion===0
   ?await query(`INSERT INTO ai_growth_monitor_settings
       (owner_id,enabled,version,updated_at) VALUES($1,$2,1,$3)
       ON CONFLICT(owner_id) DO NOTHING RETURNING *`,[ownerId,enabled,now])
   :await query(`UPDATE ai_growth_monitor_settings SET
       enabled=$2,version=version+1,updated_at=$3
       WHERE owner_id=$1 AND version=$4 RETURNING *`,
     [ownerId,enabled,now,expectedVersion]);
  if(!result.rows.length)throw Object.assign(Error('状态已改变，请刷新后重试'),{status:409});
  return view(result.rows[0],now);
 }
 async function heartbeat(ownerId,{now=Date.now()}={}){
  owner(ownerId);stamp(now);
  await query('UPDATE ai_growth_monitor_settings SET worker_seen_at=$2 WHERE owner_id=$1',
   [ownerId,now]);
 }
 async function recordScan(ownerId,{status,summary={},now=Date.now()}={}){
  owner(ownerId);stamp(now);
  if(!['scanned','partial','error','skipped'].includes(status)||
   !summary||typeof summary!=='object'||Array.isArray(summary))
   throw Error('监控扫描结果无效');
  await query(`UPDATE ai_growth_monitor_settings
    SET last_scan_at=$2,last_scan_status=$3,last_scan_summary=$4::jsonb,
      worker_seen_at=$2 WHERE owner_id=$1`,
   [ownerId,now,status,JSON.stringify(summary)]);
 }
 return {get,set,heartbeat,recordScan};
}
module.exports={createMonitorControl};
