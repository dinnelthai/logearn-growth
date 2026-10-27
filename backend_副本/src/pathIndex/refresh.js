const {createHash}=require('node:crypto')
const store=require('./store'),remote=require('../data/hologres')
const {rawNamesForTypes,PATH_TYPES}=require('../analytics/eventMap')
const {DIAGNOSTIC_EVENTS,PATH_PROPERTY_KEYS}=require('../data/behaviorPaths')
const graphNames=new Set(rawNamesForTypes(PATH_TYPES)),names=[...new Set([...graphNames,'page_visit_ended',...DIAGNOSTIC_EVENTS])]
const safe=value=>`SPLIT_PART(SPLIT_PART(${value},'?',1),'#',1)`
const properties=`jsonb_strip_nulls(jsonb_build_object(${PATH_PROPERTY_KEYS.map(k=>`'${k}',${['page_path','previous_page_path'].includes(k)?safe(`e.properties->>'${k}'`):`e.properties->'${k}'`}`).join(',')}))`
const page=`CASE WHEN e.properties->>'page_path' IS NOT NULL THEN NULL ELSE ${safe("COALESCE(e.properties->>'page_path',e.properties->>'page_url',e.properties->>'url',e.properties->>'path',e.page)")} END`
// Hash precisely the projected facts, not unneeded business payloads. Identities
// and first source are resolved by the original CTE at this immutable cutoff.
const row=`jsonb_build_object('user_key',e.user_key,'event_id',e.event_id,'event_name',e.event_name,'client_ts',e.client_ts,'session_id',e.session_id,'source',f.source,'app_version',e.app_version,'device',e.device,'ua',e.ua,'page',${page},'logged_in',NULLIF(BTRIM(e.user_id),'') IS NOT NULL,'properties',${properties})`
function projection(){return `${remote.eventsCte()}, projected AS (SELECT e.user_key,e.client_ts,e.event_id,${row} AS row FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.event_name=ANY($2::text[]))`}
async function manifest(snapshot){return remote.query(`${projection()} SELECT user_key,COUNT(*) AS n,MD5(STRING_AGG(MD5(row::text),'' ORDER BY client_ts,event_id)) AS signature FROM projected GROUP BY user_key ORDER BY user_key`,[snapshot.snapshot_cutoff,names])}
const sqlSession=value=>value==null?null:String(value).replace(/^ +| +$/g,'')||null
function writeUser(db,generation,key,signature,rows){
 const first=filter=>rows.find(filter),graph=rows.filter(r=>graphNames.has(r.event_name))
 const source=rows[0].source??null
 db.prepare('INSERT INTO user_versions VALUES(?,?,NULL,?,?,?,?,?,?,?,?)').run(key,generation,signature,source,graph[0]?.client_ts??null,rows[0].client_ts,first(r=>r.event_name==='page_viewed')?.event_id??null,first(r=>r.event_name==='page_viewed')?.event_id??null,Number(graph.some(r=>!sqlSession(r.session_id))),rows.length)
 const insert=db.prepare('INSERT INTO event_versions VALUES(?,?,NULL,?,?,?,?,?,?)'),sessions=new Map()
 const existing=new Map(db.prepare('SELECT event_id,row_json,ordinal FROM event_versions WHERE user_key=? AND valid_to IS NULL').all(key).map(r=>[r.event_id,r]))
 const closeEvent=db.prepare('UPDATE event_versions SET valid_to=? WHERE user_key=? AND event_id=? AND valid_to IS NULL')
 let previousTime=null,ordinal=0,written=0
 for(const r of rows){
  const sid=sqlSession(r.session_id),wire=JSON.stringify(r),before=existing.get(r.event_id)
  ordinal=previousTime===r.client_ts?ordinal+1:0;previousTime=r.client_ts
  if(!before||before.row_json!==wire||before.ordinal!==ordinal){
   if(before)closeEvent.run(generation,key,r.event_id)
   insert.run(key,generation,r.event_id,r.event_name,Number(r.client_ts),sid,ordinal,wire);written++
  }
  existing.delete(r.event_id)
  if(sid){if(!sessions.has(sid))sessions.set(sid,{first:Number(r.client_ts),last:Number(r.client_ts)});sessions.get(sid).last=Number(r.client_ts)}
 }
 for(const id of existing.keys())closeEvent.run(generation,key,id)
 const oldSessions=new Map(db.prepare('SELECT sid,first_t,last_t FROM session_versions WHERE user_key=? AND valid_to IS NULL').all(key).map(r=>[r.sid,r]))
 const sessionInsert=db.prepare('INSERT INTO session_versions VALUES(?,?,NULL,?,?,?)'),closeSession=db.prepare('UPDATE session_versions SET valid_to=? WHERE user_key=? AND sid=? AND valid_to IS NULL')
 for(const [sid,times]of sessions){const before=oldSessions.get(sid);if(!before||before.first_t!==times.first||before.last_t!==times.last){if(before)closeSession.run(generation,key,sid);sessionInsert.run(key,generation,sid,times.first,times.last)}oldSessions.delete(sid)}
 for(const sid of oldSessions.keys())closeSession.run(generation,key,sid)
 return written

}
async function refresh({filename=store.indexPath(),snapshot,query=remote.query,readManifest=manifest,maxEvents=2000000,maxBytes=1024*1024*1024}={}){
 // query/readManifest are injectable for correctness and failure-recovery tests.
 const started=performance.now();snapshot??=await remote.status(true,{raw:true})
 const db=store.open({writable:true,filename});let transaction=false
 try{
  const existingMeta=db.prepare('SELECT COUNT(*) AS n FROM index_meta').get().n
  if(existingMeta&&!store.compatible(db))throw Error('路径派生库版本或数据源不匹配，请使用新的 PATH_INDEX_DB')
  db.exec('BEGIN IMMEDIATE');transaction=true
  const previous=db.prepare('SELECT * FROM generations ORDER BY id DESC LIMIT 1').get()
  if(previous&&Date.parse(JSON.parse(previous.snapshot).snapshot_cutoff)>=Date.parse(snapshot.snapshot_cutoff)){db.exec('ROLLBACK');transaction=false;return {skipped:true}}
  const rows=await readManifest(snapshot)
  if(rows.length>50000||rows.reduce((n,r)=>n+Number(r.n),0)>maxEvents)throw Error('路径派生库事件或用户预算超限，继续使用远程分析')
  const before=new Map(db.prepare('SELECT user_key,signature FROM user_versions WHERE valid_to IS NULL').all().map(r=>[r.user_key,r.signature])),after=new Map(rows.map(r=>[r.user_key,r]))
  const changed=rows.filter(r=>before.get(r.user_key)!==r.signature).map(r=>r.user_key),removed=[...before.keys()].filter(k=>!after.has(k)),generation=(previous?.id||0)+1
  for(const key of changed)db.prepare('UPDATE user_versions SET valid_to=? WHERE user_key=? AND valid_to IS NULL').run(generation,key)
  for(const key of removed)for(const table of ['user_versions','event_versions','session_versions'])db.prepare(`UPDATE ${table} SET valid_to=? WHERE user_key=? AND valid_to IS NULL`).run(generation,key)
  let loaded=0,written=0,last=null,currentKey=null,currentRows=[],userBytes=0,hash=createHash('md5')
  function flush(){if(!currentKey)return;const expected=after.get(currentKey);if(currentRows.length!==Number(expected.n)||hash.digest('hex')!==expected.signature)throw Error('路径事实在构建期间发生变化，本次刷新未发布');written+=writeUser(db,generation,currentKey,expected.signature,currentRows);currentRows=[];userBytes=0;hash=createHash('md5')}
  if(changed.length)while(true){
   const batch=await query(`${projection()} SELECT user_key,client_ts,event_id,row,MD5(row::text) AS hash FROM projected WHERE user_key=ANY($3::text[]) AND ($4::text IS NULL OR (user_key,client_ts,event_id)>($4::text,$5::bigint,$6::text)) ORDER BY user_key,client_ts,event_id LIMIT 20000`,[snapshot.snapshot_cutoff,names,changed,last?.user_key??null,last?.client_ts??0,last?.event_id??''])
   if(Buffer.byteLength(JSON.stringify(batch))>48*1024*1024)throw Error('路径派生库传输预算超限')
   for(const entry of batch){if(entry.user_key!==currentKey){flush();currentKey=entry.user_key}currentRows.push(entry.row);userBytes+=Buffer.byteLength(JSON.stringify(entry.row));if(currentRows.length>150000||userBytes>64*1024*1024)throw Error('单用户路径派生事实超过预算，继续使用远程分析');hash.update(entry.hash);loaded++}
   if(batch.length<20000)break
   last=batch.at(-1)
  }
  flush()
  if(loaded!==changed.reduce((n,k)=>n+Number(after.get(k).n),0))throw Error('路径派生库缺少事件，本次刷新未发布')
  const meta=db.prepare('INSERT OR REPLACE INTO index_meta VALUES(?,?)');meta.run('version',String(store.VERSION));meta.run('source',store.sourceKey())
  db.prepare('INSERT INTO generations VALUES(?,?,?)').run(generation,Date.parse(snapshot.snapshot_cutoff),JSON.stringify(snapshot))
  store.prune(db)
  const pageSize=db.prepare('PRAGMA page_size').get().page_size,pageCount=db.prepare('PRAGMA page_count').get().page_count
  if(pageSize*pageCount>maxBytes)throw Error('路径派生库磁盘预算超限')
  db.exec('COMMIT');transaction=false
  return {generation,changed_users:changed.length,removed_users:removed.length,loaded_events:loaded,written_events:written,total_events:rows.reduce((n,r)=>n+Number(r.n),0),ms:performance.now()-started}
 }catch(error){if(transaction)db.exec('ROLLBACK');throw error}finally{db.close()}
}
module.exports={refresh,manifest,projection,names,graphNames,writeUser}
