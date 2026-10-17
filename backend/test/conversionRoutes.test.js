process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path')
const db=require('../src/db/connection');db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
for(const id of ['a','b']){db.prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,id+'@example.invalid',id,'unused',0);db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(id,id,0,Date.now()+100000)}
const remote=require('../src/data/hologres'),jobs=require('../src/services/analysisJobs');let dispatched=[]
const snapshot={snapshot_id:'s',snapshot_cutoff:'2026-10-16T00:00:00Z',as_of:'2026-10-16T00:00:00Z'}
remote.status=async()=>snapshot;remote.snapshot=async()=>snapshot
jobs.start=(kind,body,s,audience,owner)=>{dispatched.push({kind,body,audience,owner});return {id:'j-'+owner,state:'complete',snapshot:'s'}}
jobs.result=(id,owner)=>{if(id!=='j-'+owner)throw Object.assign(new Error('不可访问'),{status:409});return {j:{snapshot:'s'},value:{payload:{scene:'login'},members:{'user:1':{id:'user:1',source:'x'},'user:2':{id:'user:2',source:'x'}},lists:{reached:['user:1','user:2']}}}}
const app=express();app.use(express.json());app.use(require('../src/middleware/requireAuth'));app.use(require('../src/routes/remoteAnalytics'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function post(url,body,token='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
test('new conversion routes require auth and validate ranges before dispatch',async()=>{
 assert.equal((await post('/api/metrics/login-conversion',{start:0,end:1},null)).status,401)
 const before=dispatched.length;assert.equal((await post('/api/metrics/invite-conversion',{start:0,end:32*86400000})).status,400);assert.equal(dispatched.length,before)
})
test('conversion jobs preserve owner, snapshot and explicitly empty audiences; lists paginate and isolate owners',async()=>{
 const r=await post('/api/metrics/invite-conversion',{start:0,end:86400000,hours:24,audience_ids:[],snapshot_id:'s'});assert.equal(r.status,200);assert.equal(dispatched.at(-1).kind,'invite-conversion');assert.equal(dispatched.at(-1).owner,'a');assert.deepEqual(dispatched.at(-1).audience,[])
 const params={cache_id:'j-a',list_key:'reached'},list=await post('/api/drill/users',{kind:'cached_list',params,limit:1});assert.equal(list.body.total,2);assert.equal(list.body.rows.length,1)
 assert.equal((await post('/api/drill/users',{kind:'cached_list',params},'b')).status,409)
})
