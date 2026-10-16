const remote=require('./hologres')
const {rawNamesForTypes,internalType,PATH_TYPES}=require('../analytics/eventMap')
async function pathUsers(s,{start,end,source='all'},audience){
 const rows=await remote.query(`${remote.eventsCte()}, candidates AS (
  SELECT DISTINCT e.user_key,NULLIF(BTRIM(e.session_id),'') AS session FROM e JOIN facts f ON f.user_key=e.user_key
  WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4 AND e.event_name=ANY($7::text[])
   AND ($5::text='all' OR f.source=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 ) SELECT e.device,e.ua,e.properties->>'viewport_width' AS viewport_width,e.properties->>'viewport_height' AS viewport_height,e.user_key,e.event_id,e.event_name,e.client_ts,e.session_id,f.source,e.properties->>'module' AS module, COALESCE(e.properties->>'page_path',e.properties->>'page_url',e.properties->>'url',e.properties->>'path',e.page) AS page_url, e.properties->>'visible_duration_ms' AS duration_ms, e.properties->>'page_visit_id' AS page_visit_id, e.properties->>'login_type' AS login_type, e.properties->>'page_name' AS page_name, e.properties->>'view_mode' AS view_mode, e.properties->>'navigation_source' AS navigation_source, e.properties->>'previous_page_visit_id' AS previous_page_visit_id, e.properties->>'previous_page_path' AS previous_page_path, e.properties->>'end_reason' AS end_reason, e.event_name='page_visit_ended' AS page_end
 FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts<=$4 AND e.event_name=ANY($7::text[])
 AND EXISTS(SELECT 1 FROM candidates c WHERE c.user_key=e.user_key AND
  ((c.session IS NOT NULL AND c.session=NULLIF(BTRIM(e.session_id),'')) OR (c.session IS NULL AND NULLIF(BTRIM(e.session_id),'') IS NULL)))
 ORDER BY e.user_key,e.client_ts,e.event_id LIMIT 150001`,[s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience,[...rawNamesForTypes(PATH_TYPES),'page_visit_ended']])
 if(rows.length>150000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)throw Object.assign(new Error('会话上下文超过分析预算，请缩小日期或来源'),{status:422})
 const users=new Map()
 for(const r of rows){const type=r.page_end?'page_end':internalType(r.event_name,{module:r.module});if(!type)continue
  if(!users.has(r.user_key))users.set(r.user_key,{id:r.user_key,source:r.source||'未知',events:[]})
  users.get(r.user_key).events.push({device:r.device,ua:r.ua,viewport_width:r.viewport_width,viewport_height:r.viewport_height,login_type:r.login_type,page_name:r.page_name,view_mode:r.view_mode,navigation_source:r.navigation_source,previous_page_visit_id:r.previous_page_visit_id,previous_page_path:r.previous_page_path,end_reason:r.end_reason,type,t:Number(r.client_ts),session_id:r.session_id?.trim()||null,event_id:r.event_id,page_visit_id:r.page_visit_id,page_url:require('../analytics/pageVisits').safePage(r.page_url),duration_ms:r.duration_ms!=null&&Number.isFinite(Number(r.duration_ms))&&Number(r.duration_ms)>=0?Number(r.duration_ms):null})
 }
 return [...users.values()]
}
module.exports={pathUsers}
