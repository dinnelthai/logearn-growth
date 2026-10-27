const remote=require('./hologres')
const {rawNamesForTypes,internalType,PATH_TYPES}=require('../analytics/eventMap')
const DIAGNOSTIC_EVENTS=['page_engaged','analysis_requested','analysis_request_finished','token_card_exposed','login_attempt_started','login_attempt_finished','page_content_load_started','page_content_load_finished']
// Only diagnostic fields are loaded. Do not copy full raw signal payloads into jobs.
const FIELDS=['source','trade_attempt_id','trade_id','analysis_request_id','analysis_kind','trigger','retry_of_request_id','outcome','duration_ms','cache_hit','error_code','error_stage','cancel_reason','origin_view_state','login_attempt_id','login_method','page_load_id','load_type','content_type','diagnostics_version','token_address','chain','token_visit_id','entry_module','list_type','page_visit_id','page_path','page_url','url','path','page_name','view_mode','item_id','item_exposure_id','module','visible_duration_ms','login_type','navigation_source','previous_page_visit_id','previous_page_path','end_reason','viewport_width','viewport_height']
const projection='jsonb_strip_nulls(jsonb_build_object('+FIELDS.map(k=>`'${k}',e.properties->'${k}'`).join(',')+'))'
const safeSql=value=>`SPLIT_PART(SPLIT_PART(${value},'?',1),'#',1)`
const PROPERTY_KEYS=FIELDS.filter(k=>!['page_url','url','path'].includes(k))
const pathProjection='jsonb_strip_nulls(jsonb_build_object('+PROPERTY_KEYS.map((k,i)=>`'${i}',${['page_path','previous_page_path'].includes(k)?safeSql(`e.properties->>'${k}'`):`e.properties->'${k}'`}`).join(',')+'))'

const ROW_KEYS=['user_key','event_id','event_name','client_ts','session_id','source','app_version','device','ua','page','logged_in','properties']

async function pathUsers(s,{start,end,source='all'},audience,{valueOnly=false,lossOnly=false,graphOnly=false}={}){
 if(s.path_index_generation&&!valueOnly&&!lossOnly){const indexed=require('../pathIndex/reader').pathUsers(s,{start,end,source},audience,{graphOnly});if(indexed!==null)return indexed}
 const compact=valueOnly||lossOnly
 const eventNames=graphOnly?rawNamesForTypes(PATH_TYPES):lossOnly?[...rawNamesForTypes(['page_view','login','token','chip']),'analysis_requested','analysis_request_finished','login_attempt_started','login_attempt_finished']:valueOnly?[...rawNamesForTypes(['page_view','token_click','callout_click','token','trade_submitted','trade','trade_failed']),...DIAGNOSTIC_EVENTS.filter(x=>x!=='page_engaged')]:[...rawNamesForTypes(PATH_TYPES),'page_visit_ended',...DIAGNOSTIC_EVENTS]
 const rows=compact?await remote.query(`${remote.eventsCte()}, candidates AS (
  SELECT DISTINCT e.user_key FROM e JOIN facts f ON f.user_key=e.user_key
  WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4 AND e.event_name=ANY($7::text[])
   AND ($5::text='all' OR COALESCE(NULLIF(BTRIM(f.source),''),'未知')=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 )${compact?`, first_observed AS (SELECT user_key,MIN(client_ts) AS first_seen_at FROM e GROUP BY user_key)`:''} SELECT e.user_key,e.event_id,e.event_name,e.client_ts,e.session_id,f.source,e.app_version,e.device,e.ua,e.page,
 NULLIF(BTRIM(e.user_id),'') IS NOT NULL AS logged_in,
 ${compact?'seen.first_seen_at,':''}
 ${projection} AS properties
 FROM e JOIN facts f ON f.user_key=e.user_key ${compact?'JOIN first_observed seen ON seen.user_key=e.user_key':''} WHERE e.client_ts<=$4 AND e.event_name=ANY($7::text[])
 AND EXISTS(SELECT 1 FROM candidates c WHERE c.user_key=e.user_key)
 ORDER BY e.user_key,e.client_ts,e.event_id LIMIT 150001`,[s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience,eventNames]):await relevantPathRows(s,{start,end,source},audience,eventNames,{graphOnly})
 if(rows.length>150000||(compact&&Buffer.byteLength(JSON.stringify(rows))>48*1024*1024))throw Object.assign(new Error('会话上下文超过分析预算，请缩小日期或来源'),{status:422})
 return decodePathRows(rows)
}
function decodePathRows(rows){
 const users=new Map(),strings=new Map()
 const intern=v=>{if(typeof v!=='string')return v;if(!strings.has(v))strings.set(v,v);return strings.get(v)}
 for(let i=0;i<rows.length;i++){
  const r=rows[i];rows[i]=null;
  const p=r.properties||{},diagnostic=DIAGNOSTIC_EVENTS.includes(r.event_name)
  const type=r.event_name==='page_visit_ended'?'page_end':diagnostic?r.event_name:internalType(r.event_name,{module:p.module})
  if(!type)continue
  if(!users.has(r.user_key))users.set(r.user_key,{id:r.user_key,source:r.source||'未知',...(r.first_seen_at!=null?{first_seen_at:Number(r.first_seen_at)}:{}),events:[]})
  users.get(r.user_key).events.push({
   diagnostic:diagnostic&&type!=='page_engaged',raw_name:r.event_name,properties:p,app_version:intern(r.app_version),device:intern(r.device),ua:intern(r.ua),
   viewport_width:p.viewport_width,viewport_height:p.viewport_height,login_type:p.login_type,page_name:p.page_name,view_mode:p.view_mode,
   navigation_source:p.navigation_source,previous_page_visit_id:p.previous_page_visit_id,previous_page_path:p.previous_page_path,end_reason:p.end_reason,
   type,t:Number(r.client_ts),logged_in:r.logged_in===true,session_id:r.session_id?.trim()||null,event_id:r.event_id,page_visit_id:p.page_visit_id,
   page_url:intern(require('../analytics/pageVisits').safePage(p.page_path??p.page_url??p.url??p.path??r.page)),
   duration_ms:p.visible_duration_ms!=null&&Number.isFinite(Number(p.visible_duration_ms))&&Number(p.visible_duration_ms)>=0?Number(p.visible_duration_ms):null,
  })
 }
 return [...users.values()]
}
// Select a complete superset of all context used by path/page/diagnostic calculations.
// Explicit sessions touching the window (plus the 24h conversion follow-up) stay
// whole. Users with inferred business sessions retain all history, since removing
// an intervening explicit event could merge their inferred sessions incorrectly.
async function relevantPathRows(s,{start,end,source},audience,eventNames,{graphOnly=false}={}){
 const scopes=await remote.query(`${remote.eventsCte()}, candidates AS (
  SELECT DISTINCT e.user_key FROM e JOIN facts f ON f.user_key=e.user_key
  WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4 AND e.event_name=ANY($7::text[])
   AND ($5::text='all' OR COALESCE(NULLIF(BTRIM(f.source),''),'未知')=$5)
   AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 ) SELECT e.user_key,MIN(e.client_ts) AS first_seen_at,
  (ARRAY_AGG(e.event_id ORDER BY e.client_ts,e.event_id) FILTER(WHERE e.event_name='page_viewed'))[1] AS first_page_event,
  ARRAY_AGG(DISTINCT e.ua) AS uas,
  BOOL_OR(NULLIF(BTRIM(e.session_id),'') IS NULL AND e.event_name=ANY($8::text[])) AS has_inferred,
  ARRAY_AGG(DISTINCT NULLIF(BTRIM(e.session_id),'')) FILTER(WHERE e.client_ts>=$2 AND e.client_ts<LEAST($3::bigint+86400000,$4::bigint+1)) AS session_ids
  FROM e JOIN candidates c ON c.user_key=e.user_key WHERE e.client_ts<=$4 AND e.event_name=ANY($7::text[])
  GROUP BY e.user_key ORDER BY e.user_key LIMIT 50001`,[s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience,eventNames,rawNamesForTypes(PATH_TYPES)])
 if(scopes.length>50000||Buffer.byteLength(JSON.stringify(scopes))>8*1024*1024)throw Object.assign(new Error('路径用户或会话范围超过分析预算，请缩小日期或来源'),{status:422})
 if(!scopes.length)return []
 const ids=scopes.map(r=>r.user_key),inferred=scopes.filter(r=>r.has_inferred).map(r=>r.user_key),sessions=[...new Set(scopes.flatMap(r=>r.session_ids||[]).filter(Boolean))],pages=scopes.map(r=>r.first_page_event).filter(Boolean),firstSeen=new Map(scopes.map(r=>[r.user_key,r.first_seen_at]))
 // Compact positional transport avoids paying repeated column names for every
 // event. The same 48MiB budget is checked before expanding objects in the worker.
 const eventCode=`CASE e.event_name ${eventNames.map((name,i)=>`WHEN '${name}' THEN ${i}`).join(' ')} END`
 const selectedProperties=graphOnly?'jsonb_strip_nulls(jsonb_build_object('+PROPERTY_KEYS.map((k,i)=>({k,i})).filter(({k})=>['module','page_path','viewport_width','viewport_height'].includes(k)).map(({k,i})=>`'${i}',${k==='page_path'?safeSql("e.properties->>'page_path'"):`e.properties->'${k}'`}`).join(',')+'))':pathProjection
 const packed=await remote.query(`${remote.eventsCte()} SELECT jsonb_build_array(e.user_key,${graphOnly?'NULL':'e.event_id'},${eventCode},e.client_ts,e.session_id,f.source,e.app_version,e.device,CASE WHEN e.ua IS NULL THEN NULL ELSE MD5(e.ua) END,
  CASE WHEN e.properties->>'page_path' IS NOT NULL THEN NULL ELSE ${safeSql("COALESCE(e.properties->>'page_path',e.properties->>'page_url',e.properties->>'url',e.properties->>'path',e.page)")} END,
  NULLIF(BTRIM(e.user_id),'') IS NOT NULL,${selectedProperties}) AS packed
  FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts<=$2 AND e.event_name=ANY($3::text[]) AND e.user_key=ANY($4::text[])
   AND (e.user_key=ANY($5::text[]) OR NULLIF(BTRIM(e.session_id),'')=ANY($6::text[]) OR e.event_id=ANY($7::text[]) OR e.event_name=ANY($8::text[]))
  ORDER BY e.user_key,e.client_ts,e.event_id LIMIT 150001`,[s.snapshot_cutoff,Date.parse(s.as_of),eventNames,ids,inferred,sessions,pages,[...DIAGNOSTIC_EVENTS,'page_visit_ended']])
 if(packed.length>150000||Buffer.byteLength(JSON.stringify(packed))>48*1024*1024)throw Object.assign(new Error('会话上下文超过分析预算，请缩小日期或来源'),{status:422})
 const uas=new Map(scopes.flatMap(r=>(r.uas||[]).filter(v=>v!=null)).map(v=>[require('node:crypto').createHash('md5').update(v).digest('hex'),v]))
 const rows=[]
 for(let index=0;index<packed.length;index++){
  const values=packed[index].packed;packed[index]=null
  const row=Object.fromEntries(ROW_KEYS.map((k,i)=>[k,values[i]]))
  if(!Number.isInteger(row.event_name)||!eventNames[row.event_name])throw Object.assign(new Error('会话事件上下文不完整，请重新分析'),{status:503})
  row.event_name=eventNames[row.event_name]
  if(row.ua!=null&&!uas.has(row.ua))throw Object.assign(new Error('会话设备上下文不完整，请重新分析'),{status:503})
  row.ua=row.ua==null?null:uas.get(row.ua)
  row.properties=Object.fromEntries(Object.entries(row.properties||{}).map(([i,v])=>[PROPERTY_KEYS[Number(i)],v]))
  rows.push(row)
 }
 for(const row of rows)row.first_seen_at=firstSeen.get(row.user_key)
 return rows
}
module.exports={pathUsers,relevantPathRows,decodePathRows,DIAGNOSTIC_EVENTS,PATH_PROPERTY_KEYS:PROPERTY_KEYS}
