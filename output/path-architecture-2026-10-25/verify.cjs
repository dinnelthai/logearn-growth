const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'../..')
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true})
const store=require(path.join(root,'backend/src/pathIndex/store')),remote=require(path.join(root,'backend/src/data/hologres')),{pathUsers}=require(path.join(root,'backend/src/data/behaviorPaths')),{pathInsights}=require(path.join(root,'backend/src/analytics/pathInsights'))
;(async()=>{try{
 const db=store.open(),s=store.latest(db,{maxAge:Infinity});db.close();assert(s);const body={start:Date.parse('2026-10-18T00:00:00+07:00'),end:Date.parse('2026-10-25T00:00:00+07:00'),source:'all'},reports=[]
 for(const graphOnly of [true,false]){
 const at=performance.now(),old=await pathUsers({...s,path_index_generation:undefined},body,null,{graphOnly}),loaded=performance.now(),indexed=require(path.join(root,'backend/src/pathIndex/reader')).pathUsers(s,body,null,{graphOnly}),done=performance.now()
 assert(indexed,'index reader fell back')
 for(const options of [{},{path_start:'chip'},{path_start:'chip',path_direction:'before'},{path_stop:'trade'},{path_depth:7}]){
  const b={...body,...options,details:!graphOnly},expected=pathInsights(old,b,s),actual=pathInsights(indexed,b,s)
  try{assert.deepEqual(actual,expected)}catch(e){console.error('parity failed',graphOnly,options);throw e}
 }
 reports.push({graphOnly,remote_load_ms:loaded-at,indexed_load_ms:done-loaded,remote_events:old.reduce((n,u)=>n+u.events.length,0),indexed_events:indexed.reduce((n,u)=>n+u.events.length,0),sessions:pathInsights(indexed,{...body,details:!graphOnly},s).payload.sessions,parity:true})
 }
 fs.writeFileSync(path.join(__dirname,'parity.json'),JSON.stringify(reports,null,2));console.log(reports)
 }catch(e){console.error(e.message.slice(0,6000));process.exitCode=1}finally{await remote.close()}})()
