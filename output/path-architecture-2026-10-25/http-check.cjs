const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'../..')
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true});process.env.DB_PATH=':memory:'
const express=require(path.join(root,'backend/node_modules/express')),remote=require(path.join(root,'backend/src/data/hologres')),app=express();app.use(express.json());app.use((req,res,next)=>{req.user={user_id:'verification-only'};next()});app.use(require(path.join(root,'backend/src/routes/remoteAnalytics')));app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}))
;(async()=>{let server;try{
 await require(path.join(root,'backend/src/pathIndex/refresh')).refresh()
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port
 const call=async(url,body)=>{const response=await fetch(base+url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),value=await response.json();assert(response.ok,value.error);return value}
 const at=performance.now(),s=await call('/api/analytics/meta'),metaMs=performance.now()-at;assert(s.path_index_generation)
 async function job(url,body){const started=performance.now();let value=await call(url,body),polls=0;while(value.job_id){assert(polls++<80);await new Promise(resolve=>setTimeout(resolve,750));value=await call('/api/analytics/jobs/'+value.job_id)}return {value,ms:performance.now()-started,polls}}
 const body={start:Date.parse('2026-10-18T00:00:00+07:00'),end:Date.parse('2026-10-25T00:00:00+07:00'),source:'all',details:false,snapshot_id:s.snapshot_id},graph=await job('/api/metrics/paths',body),details=await job('/api/metrics/path-details',{base_cache_id:graph.value.drill.cache_id})
 assert.equal(graph.value.sessions,details.value.sessions);assert.equal(graph.value.drill.snapshot_id,details.value.drill.snapshot_id);assert.equal(graph.value.details_available,false);assert.equal(details.value.details_available,true)
 const repeatAt=performance.now(),repeat=await call('/api/metrics/paths',body);assert.equal(repeat.drill.cache_id,graph.value.drill.cache_id)
 const report={meta_ms:metaMs,graph_ms:graph.ms,graph_polls:graph.polls,details_ms:details.ms,details_polls:details.polls,repeat_ms:performance.now()-repeatAt,sessions:graph.value.sessions,users:graph.value.users,same_snapshot:true,scope:'Real HTTP router, 750ms polling, 256MB workers, isolated test owner and in-memory operations DB; excludes login, browser and rendering'}
 fs.writeFileSync(path.join(__dirname,'http.json'),JSON.stringify(report,null,2));console.log(report)
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await remote.close()}})().catch(e=>{console.error(e);process.exitCode=1})
