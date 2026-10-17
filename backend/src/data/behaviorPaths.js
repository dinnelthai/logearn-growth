const remote=require('./hologres')
const {rawNamesForTypes,internalType,PATH_TYPES}=require('../analytics/eventMap')
const DIAGNOSTIC_EVENTS=['page_engaged','analysis_requested','analysis_request_finished','token_card_exposed','login_attempt_started','login_attempt_finished','page_content_load_started','page_content_load_finished']
// Only diagnostic fields are loaded. Do not copy full raw signal payloads into jobs.
const FIELDS=['source','analysis_request_id','analysis_kind','trigger','retry_of_request_id','outcome','duration_ms','cache_hit','error_code','error_stage','cancel_reason','origin_view_state','login_attempt_id','login_method','page_load_id','load_type','content_type','diagnostics_version','token_address','chain','token_visit_id','entry_module','list_type','page_visit_id','page_path','page_url','url','path','page_name','view_mode','item_id','item_exposure_id','module','visible_duration_ms','login_type','navigation_source','previous_page_visit_id','previous_page_path','end_reason','viewport_width','viewport_height']
const projection='jsonb_strip_nulls(jsonb_build_object('+FIELDS.map(k=>`'${k}',e.properties->'${k}'`).join(',')+'))'
async function pathUsers(s,{start,end,source='all'},audience){
 const rows=await remote.query(`${remote.eventsCte()}, candidates AS (
  SELECT DISTINCT e.user_key FROM e JOIN facts f ON f.user_key=e.user_key
  WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4 AND e.event_name=ANY($7::text[])
   AND ($5::text='all' OR f.source=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 ) SELECT e.user_key,e.event_id,e.event_name,e.client_ts,e.session_id,f.source,e.app_version,e.device,e.ua,e.page,
 ${projection} AS properties
 FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts<=$4 AND e.event_name=ANY($7::text[])
 AND EXISTS(SELECT 1 FROM candidates c WHERE c.user_key=e.user_key)
 ORDER BY e.user_key,e.client_ts,e.event_id LIMIT 150001`,[s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience,[...rawNamesForTypes(PATH_TYPES),'page_visit_ended',...DIAGNOSTIC_EVENTS]])
 if(rows.length>150000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)throw Object.assign(new Error('会话上下文超过分析预算，请缩小日期或来源'),{status:422})
 const users=new Map()
 for(const r of rows){
  const p=r.properties||{},diagnostic=DIAGNOSTIC_EVENTS.includes(r.event_name)
  const type=r.event_name==='page_visit_ended'?'page_end':diagnostic?r.event_name:internalType(r.event_name,{module:p.module})
  if(!type)continue
  if(!users.has(r.user_key))users.set(r.user_key,{id:r.user_key,source:r.source||'未知',events:[]})
  users.get(r.user_key).events.push({
   diagnostic:diagnostic&&type!=='page_engaged',raw_name:r.event_name,properties:p,app_version:r.app_version,device:r.device,ua:r.ua,
   viewport_width:p.viewport_width,viewport_height:p.viewport_height,login_type:p.login_type,page_name:p.page_name,view_mode:p.view_mode,
   navigation_source:p.navigation_source,previous_page_visit_id:p.previous_page_visit_id,previous_page_path:p.previous_page_path,end_reason:p.end_reason,
   type,t:Number(r.client_ts),session_id:r.session_id?.trim()||null,event_id:r.event_id,page_visit_id:p.page_visit_id,
   page_url:require('../analytics/pageVisits').safePage(p.page_path??p.page_url??p.url??p.path??r.page),
   duration_ms:p.visible_duration_ms!=null&&Number.isFinite(Number(p.visible_duration_ms))&&Number(p.visible_duration_ms)>=0?Number(p.visible_duration_ms):null,
  })
 }
 return [...users.values()]
}
module.exports={pathUsers}
