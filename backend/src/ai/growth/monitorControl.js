'use strict';
// Existing AI PostgreSQL stores each operator's opt-in across restarts.
const pool=require('../../db/aiPool');
function createMonitorControl(query=(sql,params)=>pool.query(sql,params)){
 const validOwner=x=>typeof x==='string'&&x.trim()&&x.length<=256;
 function view(row){
  return {enabled:row?.enabled===true,version:Number(row?.version||0),
   lastScanAt:row?.last_scan_at==null?null:Number(row.last_scan_at),
   lastScanStatus:row?.last_scan_status||null,
   lastScanSummary:row?.last_scan_summary||null,
   safeMode:true,paidModelCalls:false,externalActions:false};
 }
 async function get(ownerId){
  if(!validOwner(ownerId))throw Object.assign(Error('监控账号无效'),{status:400});
  const r=await query('SELECT * FROM ai_growth_monitor_settings WHERE owner_id=$1',[ownerId]);
  return view(r.rows[0]);
 }
 async function set(ownerId,{enabled,expectedVersion,now=Date.now()}={}){
  if(!validOwner(ownerId)||typeof enabled!=='boolean'||
   !Number.isSafeInteger(expectedVersion)||expectedVersion<0||
   !Number.isSafeInteger(now)||now<0)
   throw Object.assign(Error('监控开关参数无效'),{status:400});
  const r=expectedVersion===0
   ?await query(`INSERT INTO ai_growth_monitor_settings
      (owner_id,enabled,version,updated_at) VALUES($1,$2,1,$3)
      ON CONFLICT(owner_id) DO NOTHING RETURNING *`,[ownerId,enabled,now])
   :await query(`UPDATE ai_growth_monitor_settings SET
      enabled=$2,version=version+1,updated_at=$3
      WHERE owner_id=$1 AND version=$4 RETURNING *`,[ownerId,enabled,now,expectedVersion]);
  if(!r.rows.length)throw Object.assign(Error('状态已改变，请刷新后重试'),{status:409});
  return view(r.rows[0]);
 }
 async function enabledOwners(){
  const r=await query(`SELECT owner_id FROM ai_growth_monitor_settings
   WHERE enabled=true ORDER BY owner_id LIMIT 1001`,[]);
  if(r.rows.length>1000)throw Error('启用账号超过单轮监控上限，停止扫描并通知管理员');
  return r.rows.map(row=>row.owner_id);
 }
 async function recordScan(ownerId,{status,summary={},now=Date.now()}={}){
  if(!validOwner(ownerId)||!['scanned','partial','error','skipped'].includes(status)||
   !Number.isSafeInteger(now)||now<0||
   !summary||typeof summary!=='object'||Array.isArray(summary))
   throw Error('监控扫描结果无效');
  await query(`UPDATE ai_growth_monitor_settings
    SET last_scan_at=$2,last_scan_status=$3,last_scan_summary=$4::jsonb
    WHERE owner_id=$1`,[ownerId,now,status,JSON.stringify(summary)]);
 }
 return {get,set,enabledOwners,recordScan};
}
module.exports={createMonitorControl};
