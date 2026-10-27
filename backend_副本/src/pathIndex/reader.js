const store=require('./store'),{rawNamesForTypes,PATH_TYPES}=require('../analytics/eventMap')
const {DIAGNOSTIC_EVENTS,decodePathRows,PATH_PROPERTY_KEYS}=require('../data/behaviorPaths')
const graphNames=rawNamesForTypes(PATH_TYPES),allNames=[...new Set([...graphNames,'page_visit_ended',...DIAGNOSTIC_EVENTS])]
// Pin SQLite statements until their iterators finish (Node 23 can finalize an
// otherwise unreachable statement during GC while its iterator is still live).
const statements=new Set()
const active=alias=>`${alias}.valid_from<=:g AND (${alias}.valid_to IS NULL OR ${alias}.valid_to>:g)`
function latest(){let db;try{db=store.open();return store.latest(db)}catch{return null}finally{db?.close()}}
function pathUsers(snapshot,{start,end,source='all'},audience,{graphOnly=false}={}){
 let db,selected
 try{db=store.open();if(!db||!store.compatible(db)){db?.close();return null}}catch{db?.close();return null}
 try{
  const generation=Number(snapshot.path_index_generation),stored=db.prepare('SELECT snapshot FROM generations WHERE id=?').get(generation)
  // A generation is usable only with its exact public snapshot, never a newer one.
  if(!stored||JSON.parse(stored.snapshot).snapshot_id!==snapshot.snapshot_id||JSON.parse(stored.snapshot).snapshot_cutoff!==snapshot.snapshot_cutoff)return null
  const all=(sql,params)=>{const statement=db.prepare(sql);statement.setAllowUnknownNamedParameters(true);return statement.all(params)}
  const params={g:generation,start,end,asof:Date.parse(snapshot.as_of),source,names:JSON.stringify(graphOnly?graphNames:allNames),audience:JSON.stringify(audience??null)}
  const scopes=all(`SELECT f.* FROM user_versions f WHERE ${active('f')} AND (:source='all' OR COALESCE(NULLIF(TRIM(f.source),''),'未知')=:source) AND (:audience='null' OR f.user_key IN(SELECT value FROM json_each(:audience))) AND EXISTS(SELECT 1 FROM event_versions e WHERE e.user_key=f.user_key AND ${active('e')} AND e.client_ts>=:start AND e.client_ts<:end AND e.client_ts<=:asof AND e.event_name IN(SELECT value FROM json_each(:names))) ORDER BY f.user_key LIMIT 50001`,params)
  if(scopes.length>50000||Buffer.byteLength(JSON.stringify(scopes))>8*1024*1024)throw Object.assign(Error('路径用户或会话范围超过分析预算，请缩小日期或来源'),{status:422})
  if(!scopes.length)return []
  const ids=JSON.stringify(scopes.map(r=>r.user_key)),sessionParams={...params,ids,upper:Math.min(end+86400000,params.asof+1)}
  const sessions=all(`SELECT DISTINCT s.sid FROM session_versions s WHERE ${active('s')} AND s.user_key IN(SELECT value FROM json_each(:ids)) AND s.first_t<:upper AND s.last_t>=:start AND EXISTS(SELECT 1 FROM event_versions e WHERE e.user_key=s.user_key AND e.sid=s.sid AND ${active('e')} AND e.client_ts>=:start AND e.client_ts<:upper AND e.event_name IN(SELECT value FROM json_each(:names)))`,sessionParams).map(r=>r.sid)
  const rowParams={...params,ids,inferred:JSON.stringify(scopes.filter(r=>r.has_inferred).map(r=>r.user_key)),sessions:JSON.stringify(sessions),pages:JSON.stringify(scopes.map(r=>graphOnly?r.graph_first_page:r.details_first_page).filter(Boolean)),diagnostic:JSON.stringify([...DIAGNOSTIC_EVENTS,'page_visit_ended'])}
  selected=db.prepare(`SELECT e.row_json FROM event_versions e WHERE ${active('e')} AND e.user_key IN(SELECT value FROM json_each(:ids)) AND e.client_ts<=:asof AND e.event_name IN(SELECT value FROM json_each(:names)) AND (e.user_key IN(SELECT value FROM json_each(:inferred)) OR e.sid IN(SELECT value FROM json_each(:sessions)) OR e.event_id IN(SELECT value FROM json_each(:pages)) OR e.event_name IN(SELECT value FROM json_each(:diagnostic))) ORDER BY e.user_key,e.client_ts,e.ordinal LIMIT 150001`)
  statements.add(selected)
  selected.setAllowUnknownNamedParameters(true)
  const firstSeen=new Map(scopes.map(r=>[r.user_key,graphOnly?r.graph_first:r.details_first])),rows=[];let bytes=2
  const nameCodes=new Map((graphOnly?graphNames:allNames).map((n,i)=>[n,i])),propertyCodes=new Map(PATH_PROPERTY_KEYS.map((k,i)=>[k,String(i)]))
  for(const entry of selected.iterate(rowParams)){
   if(rows.length>=150000)throw Object.assign(Error('会话上下文超过分析预算，请缩小日期或来源'),{status:422})
   const r=JSON.parse(entry.row_json)
   if(graphOnly){r.event_id=null;r.properties=Object.fromEntries(Object.entries(r.properties).filter(([k])=>['module','page_path','viewport_width','viewport_height'].includes(k)))}
   // Keep the existing compact-transfer budget, without materializing a second
   // full result array in the worker. The UA dictionary key is always 32 bytes.
   const packed=[r.user_key,r.event_id,nameCodes.get(r.event_name),r.client_ts,r.session_id,r.source,r.app_version,r.device,r.ua==null?null:'0'.repeat(32),r.page,r.logged_in,Object.fromEntries(Object.entries(r.properties).map(([k,v])=>[propertyCodes.get(k),v]))]
   bytes+=Buffer.byteLength(JSON.stringify({packed}))+(rows.length?1:0)
   if(bytes>48*1024*1024)throw Object.assign(Error('会话上下文超过分析预算，请缩小日期或来源'),{status:422})
   r.first_seen_at=firstSeen.get(r.user_key);rows.push(r)
  }
  return decodePathRows(rows)
 }catch(error){if(error.status===422)throw error;console.warn('[path-index] 读取失败，使用原快照远程查询：'+error.message);return null}finally{statements.delete(selected);db.close()}
}
module.exports={latest,pathUsers}
