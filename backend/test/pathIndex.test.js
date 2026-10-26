const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto')
const {refresh,projection}=require('../src/pathIndex/refresh'),store=require('../src/pathIndex/store'),reader=require('../src/pathIndex/reader')
const {pathInsights}=require('../src/analytics/pathInsights'),{decodePathRows}=require('../src/data/behaviorPaths')
const digest=x=>createHash('md5').update(x).digest('hex'),now=Date.now(),day=86400000
const snapshot=i=>({snapshot_id:'s'+i,snapshot_cutoff:new Date(now+i*1000).toISOString(),as_of:new Date(now).toISOString()})
const event=(id,user,name,t,sid,p={})=>({user_key:user,event_id:id,event_name:name,client_ts:t,session_id:sid,source:'direct',app_version:'v1',device:'desktop',ua:'Windows Chrome/156.0',page:'/cn',logged_in:false,properties:p})
function fixture(t){return [event('e0','u1','page_viewed',t-day*3,'old',{page_path:'/cn'}),event('e1','u1','token_detail_viewed',t+1,'live'),event('e2','u1','chip_analysis_viewed',t+2,'live'),event('e3','u1','analysis_requested',t+3,'live',{analysis_request_id:'r'}),event('e4','u2','page_viewed',t-day,'past'),event('e5','u2','login_succeeded',t+10,null),event('e6','u2','chip_analysis_drilldown',t+20,null)]}
function inputs(rows){const sorted=[...rows].sort((a,b)=>a.user_key.localeCompare(b.user_key)||a.client_ts-b.client_ts||a.event_id.localeCompare(b.event_id)),groups=new Map();for(const r of sorted){if(!groups.has(r.user_key))groups.set(r.user_key,[]);groups.get(r.user_key).push(r)}return {readManifest:async()=>[...groups].map(([user_key,es])=>({user_key,n:es.length,signature:digest(es.map(e=>digest(JSON.stringify(e))).join(''))})),query:async(sql,p)=>sorted.filter(r=>p[2].includes(r.user_key)).map(row=>({user_key:row.user_key,client_ts:row.client_ts,event_id:row.event_id,row,hash:digest(JSON.stringify(row))}))}}
async function setup(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'logearn-index-')),filename=path.join(dir,'index.db'),old=process.env.PATH_INDEX_DB;process.env.PATH_INDEX_DB=filename;try{await fn(filename)}finally{if(old==null)delete process.env.PATH_INDEX_DB;else process.env.PATH_INDEX_DB=old;fs.rmSync(dir,{recursive:true,force:true})}}
test('indexed graph and full diagnostics match complete observed facts across path options',async()=>setup(async filename=>{
 const t=now-100000,rows=fixture(t),s=snapshot(0),body={start:t,end:t+1000},report=await refresh({filename,snapshot:s,...inputs(rows)})
 assert.equal(report.loaded_events,rows.length)
 const indexed={...s,path_index_generation:report.generation}
 for(const graphOnly of [true,false])for(const options of [{},{path_start:'chip'},{path_start:'chip',path_direction:'before'},{path_stop:'chip'},{source:'other'}]){
  const users=reader.pathUsers(indexed,{...body,...options},null,{graphOnly}),expected=decodePathRows(structuredClone(rows.filter(r=>!options.source||options.source==='all'||r.source===options.source))),a=pathInsights(users,{...body,...options,details:!graphOnly},s),b=pathInsights(expected,{...body,...options,details:!graphOnly},s)
  assert.deepEqual(a.payload,b.payload);assert.deepEqual(a.lists,b.lists);assert.deepEqual(a.members,b.members)
 }
 assert.deepEqual(reader.pathUsers(indexed,body,[],{graphOnly:true}),[])
 assert.equal(reader.pathUsers({...indexed,snapshot_id:'forged'},body),null)
}))
test('incremental identity/source/session corrections and deletion preserve old snapshots',async()=>setup(async filename=>{
 const t=now-100000,rows=fixture(t),body={start:t,end:t+1000},s0=snapshot(0),first=await refresh({filename,snapshot:s0,...inputs(rows)}),old={...s0,path_index_generation:first.generation}
 const before=reader.pathUsers(old,body,null,{graphOnly:true}),changed=rows.filter(r=>r.user_key!=='u2').map(r=>({...r,user_key:'user:linked',source:'invite'})),second=await refresh({filename,snapshot:snapshot(1),...inputs(changed)})
 assert.equal(second.loaded_events,changed.length);assert.equal(second.removed_users,2)
 assert.deepEqual(reader.pathUsers(old,body,null,{graphOnly:true}),before)
 const updated=reader.pathUsers({...snapshot(1),path_index_generation:second.generation},body,null,{graphOnly:true});assert.deepEqual(updated.map(u=>u.id),['user:linked']);assert.equal(updated[0].source,'invite')
 const third=await refresh({filename,snapshot:snapshot(2),...inputs(changed)});assert.equal(third.changed_users,0);assert.equal(third.loaded_events,0)
}))
test('failed or incomplete refresh rolls back versions and never publishes partial facts',async()=>setup(async filename=>{
 const rows=fixture(now-100000),first=await refresh({filename,snapshot:snapshot(0),...inputs(rows)}),changed=rows.map(r=>({...r,source:'changed'})),bad=inputs(changed);bad.query=async()=>[]
 await assert.rejects(refresh({filename,snapshot:snapshot(1),...bad}),/缺少事件/)
 let db=store.open();assert.equal(store.latest(db,{now,maxAge:90000}).path_index_generation,first.generation);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_versions WHERE valid_to IS NOT NULL').get().n,0);db.close()
 await assert.rejects(refresh({filename,snapshot:snapshot(1),...inputs(changed),maxBytes:1}),/磁盘预算/)
 await assert.rejects(refresh({filename,snapshot:snapshot(1),...inputs(changed),maxEvents:1}),/预算/)
 db=store.open();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generations').get().n,1);db.close()
}))
test('cache requires source/schema identity, freshness, and a retained exact generation',async()=>setup(async filename=>{
 const s=snapshot(0);await refresh({filename,snapshot:s,...inputs(fixture(now-100000))})
 const db=store.open({writable:true});assert.equal(store.latest(db,{now:now+90001}),null)
 db.prepare("UPDATE index_meta SET value='wrong' WHERE key='source'").run();assert.equal(store.latest(db,{now}),null);db.close()
 assert.equal(reader.pathUsers({...s,path_index_generation:1},{start:0,end:now}),null)
 await assert.rejects(refresh({filename,snapshot:snapshot(1),...inputs([])}),/不匹配/)
}))
test('incremental manifest retains original cutoff, duplicate and dirty-identity rules and restricted fields',()=>{
 const sql=projection();assert.match(sql,/ROW_NUMBER\(\) OVER \(PARTITION BY event_id ORDER BY server_ts, id\)/);assert.match(sql,/COUNT\(DISTINCT user_id\) = 1/);assert.match(sql,/dirty/);assert.match(sql,/client_ts <= EXTRACT/);assert(!sql.includes("properties->'wallet_address'"));assert(sql.includes("SPLIT_PART"))
})
test('fresh indexed status registers its exact snapshot without querying remote events',async()=>setup(async filename=>{
 const remote=require('../src/data/hologres'),s=snapshot(0),old=process.env.ENABLE_PATH_INDEX,query=remote.query
 try{await refresh({filename,snapshot:s,...inputs(fixture(now-100000))});process.env.ENABLE_PATH_INDEX='true';remote.query=async()=>{throw Error('unexpected remote query')};const status=await remote.status();assert.equal(status.path_index_generation,1);assert.deepEqual(await remote.snapshot(status.snapshot_id),status)}finally{remote.query=query;if(old==null)delete process.env.ENABLE_PATH_INDEX;else process.env.ENABLE_PATH_INDEX=old}
}))
test('readers see the previous complete generation while an update is uncommitted',async()=>setup(async filename=>{
 const t=now-100000,rows=fixture(t),s=snapshot(0),body={start:t,end:t+1000};await refresh({filename,snapshot:s,...inputs(rows)})
 const previous=reader.pathUsers({...s,path_index_generation:1},body,null,{graphOnly:true}),changed=rows.map(r=>({...r,source:'new'})),next=inputs(changed),query=next.query
 next.query=async(...args)=>{assert.deepEqual(reader.pathUsers({...s,path_index_generation:1},body,null,{graphOnly:true}),previous);return query(...args)}
 await refresh({filename,snapshot:snapshot(1),...next});assert.deepEqual(reader.pathUsers({...s,path_index_generation:1},body,null,{graphOnly:true}),previous)
}))
test('generation cleanup retains live snapshots and rejects removed generations',async()=>setup(async filename=>{
 const rows=fixture(now-100000),s=snapshot(0);await refresh({filename,snapshot:s,...inputs(rows)})
 await refresh({filename,snapshot:snapshot(1),...inputs(rows.map(r=>({...r,source:'new'})))})
 const db=store.open({writable:true});db.prepare('UPDATE generations SET created_at=? WHERE id=1').run(now-31*60000);store.prune(db,now);assert(!db.prepare('SELECT id FROM generations WHERE id=1').get());assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_versions WHERE valid_to IS NOT NULL').get().n,0);db.close();assert.equal(reader.pathUsers({...s,path_index_generation:1},{start:0,end:now}),null)
}))
test('append, correction and deletion write only changed events, including tied timestamps',async()=>setup(async filename=>{
 const t=now-100000,rows=[event('b','u','login_succeeded',t,'s'),event('d','u','chip_analysis_viewed',t,'s')],body={start:t,end:t+100}
 await refresh({filename,snapshot:snapshot(0),...inputs(rows)})
 const appended=[...rows,event('e','u','trade_succeeded',t+1,'s')],second=await refresh({filename,snapshot:snapshot(1),...inputs(appended)})
 assert.equal(second.written_events,1)
 let db=store.open();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_versions').get().n,3);db.close()
 const tied=[...appended,event('a','u','page_viewed',t,'s')];await refresh({filename,snapshot:snapshot(2),...inputs(tied)})
 const current=reader.pathUsers({...snapshot(2),path_index_generation:3},body,null,{graphOnly:true})
 assert.deepEqual(current[0].events.map(e=>e.type),['page_view','login','chip','trade'])
 const corrected=tied.filter(r=>r.event_id!=='e').map(r=>r.event_id==='d'?{...r,event_name:'trade_succeeded'}:r)
 const fourth=await refresh({filename,snapshot:snapshot(3),...inputs(corrected)});assert.equal(fourth.written_events,1)
 const old=reader.pathUsers({...snapshot(1),path_index_generation:2},body,null,{graphOnly:true});assert.deepEqual(old[0].events.map(e=>e.type),['login','chip','trade'])
}))
