process.env.DB_PATH=':memory:'
process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path')
const db=require('../src/db/connection'),jobs=require('../src/services/analysisJobs'),remote=require('../src/data/hologres'),member=require('../src/data/memberMetrics')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()})
app.use('/reports',require('../src/routes/growthReports'));app.use('/ops',require('../src/routes/ops'));app.use('/tasks',require('../src/routes/operationTasks'))
app.use(require('../src/routes/remoteAnalytics'))
app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}))
const server=app.listen(0)
after(()=>{server.close();db.close()})
async function request(url,body,owner='a'){
 const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-owner':owner},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}
}
test('new analytics routes validate ranges, retain owner and empty audiences, and return cached drill references',async()=>{
 const oldStart=jobs.start,oldResult=jobs.result,oldSnapshot=remote.snapshot,seen=[]
 try{remote.snapshot=async()=>({snapshot_id:'s',as_of:new Date(1000).toISOString()})
 jobs.start=(kind,body,s,audience,owner)=>{seen.push({kind,body,audience,owner});return {id:'j',snapshot:'s',state:'complete'}}
 jobs.result=()=>({value:{payload:{start:100,end:200}},j:{}})
 const r=await request('/api/metrics/growth-insights',{start:100,end:200,snapshot_id:'s',audience_ids:[]})
 assert.equal(r.status,200);assert.equal(r.body.drill.cache_id,'j');assert.equal(seen[0].kind,'growth-insights');assert.deepEqual(seen[0].audience,[]);assert.equal(seen[0].owner,'a')
 assert.equal((await request('/api/metrics/growth-insights',{start:100,end:100+32*86400000,snapshot_id:'s'})).status,400)
 assert.equal((await request('/api/metrics/value-diagnostics',{start:100,end:200,snapshot_id:'s'})).status,200)
 assert.equal(seen.at(-1).kind,'value-diagnostics')
 assert.equal((await request('/api/metrics/value-diagnostics',{start:100,end:100+8*86400000,snapshot_id:'s'})).status,400)
 }finally{jobs.start=oldStart;jobs.result=oldResult;remote.snapshot=oldSnapshot}
})
test('loss and arrival-audit routes retain scopes, sanitize samples and reject filtered/raw credential inputs',async()=>{
 const oldStart=jobs.start,oldResult=jobs.result,oldSnapshot=remote.snapshot,seen=[]
 try{remote.snapshot=async()=>({snapshot_id:'s',as_of:new Date(1000).toISOString()})
 jobs.start=(kind,body,s,audience,owner)=>{seen.push({kind,body,audience,owner});return {id:'j',snapshot:'s',state:'complete'}}
 jobs.result=()=>({value:{payload:{start:100,end:200}},j:{}})
 assert.equal((await request('/api/metrics/conversion-loss',{start:100,end:200,snapshot_id:'s',audience_ids:[]})).status,200);assert.deepEqual(seen[0].audience,[])
 const r=await request('/api/metrics/tracking-audit',{start:100,end:200,snapshot_id:'s',token:'secret',samples:[{event_id:'e1',user_id:'private',properties:{analysis_request_id:'r',password:'secret'}}]})
 assert.equal(r.status,200);assert.equal(seen.at(-1).kind,'tracking-audit');assert(!JSON.stringify(seen.at(-1)).includes('secret'));assert(!JSON.stringify(seen.at(-1)).includes('private'))
 assert.equal((await request('/api/metrics/tracking-audit',{start:100,end:200,snapshot_id:'s',source:'x'})).status,400)
 assert.equal((await request('/api/metrics/tracking-audit',{start:100,end:200,snapshot_id:'s',audience_ids:[]})).status,400)
 assert.equal((await request('/api/metrics/tracking-audit',{start:100,end:200,snapshot_id:'s',collector_status:42})).status,400)
 }finally{jobs.start=oldStart;jobs.result=oldResult;remote.snapshot=oldSnapshot}
})
test('materializing a previous-period loss list preserves its own period instead of switching to the current period',async()=>{
 const oldResult=jobs.result,oldSnapshot=remote.snapshot
 try{jobs.result=()=>({j:{context:{start:100,end:200,source:'all',mode:'conversion-loss'},snapshot:'s'},value:{lists:{'loss:previous:visitors':['user:1']},members:{'user:1':{id:'user:1',source:'x'}},payload:{start:100,end:200,list_periods:{'loss:previous:visitors':{start:0,end:100}}}}})
 remote.snapshot=async()=>({as_of:new Date(200).toISOString(),snapshot_id:'s'})
 const r=await request('/api/analytics/audience',{cache_id:'j',list_key:'loss:previous:visitors'})
 assert.equal(r.status,200);assert.equal(r.body.start,0);assert.equal(r.body.end,100);assert.deepEqual(r.body.ids,['user:1'])
 }finally{jobs.result=oldResult;remote.snapshot=oldSnapshot}
})
test('reports freeze server metrics and lists, isolate owners and reject expired or wrong-kind jobs',async()=>{
 const old=jobs.result
 try{jobs.result=(id,owner)=>{if(id==='expired'||owner!=='a')throw Object.assign(Error('过期'),{status:409});return {j:{context:{mode:id==='wrong'?'segments':'growth-insights',start:1,end:2},snapshot:'snap'},value:{payload:{change:{current:7}},lists:{'growth:current':['user:1']},members:{'user:1':{id:'user:1',source:'x'}}}}}
 const r=await request('/reports',{title:'复盘',note:'待验证假设',cache_id:'job',result:{change:{current:999}}});assert.equal(r.status,201)
 const saved=await request('/reports/'+r.body.id);assert.equal(saved.body.result.payload.change.current,7);assert.deepEqual(saved.body.result.lists['growth:current'],['user:1'])
 assert.equal((await request('/reports/'+r.body.id,undefined,'b')).status,404);assert.equal((await request('/reports',undefined,'b')).body.reports.length,0)
 assert.equal((await request('/reports',{title:'x',cache_id:'expired'})).status,409);assert.equal((await request('/reports',{title:'x',cache_id:'wrong'})).status,400)
 assert.equal((await request('/reports',{title:'',cache_id:'job'})).status,400)
 }finally{jobs.result=old}
})
test('OPS effect reads owner-scoped verified success audience and never executes writes',async()=>{
 const now=Date.now(),batch='effect'
 db.prepare('INSERT INTO ops_batches(id,owner_id,operation,state,created_at,expires_at,finished_at) VALUES(?,?,?,?,?,?,?)').run(batch,'a','vip','finished',now-2000,now+1000,now-1000)
 db.prepare('INSERT INTO ops_batch_rows VALUES(?,?,?,?,?)').run(batch,1,'{}','success',JSON.stringify({verification:{user_id:true},summary:{user_id:'1'}}))
 db.prepare('INSERT INTO ops_batch_rows VALUES(?,?,?,?,?)').run(batch,2,'{}','success',JSON.stringify({verification:{user_id:null},summary:{user_id:'2'}}))
 const oldStatus=remote.status,oldFacts=member.memberFacts,oldMetrics=member.memberMetrics,calls=[]
 try{remote.status=async()=>({as_of:new Date(now).toISOString(),snapshot_id:'s',snapshot_cutoff:new Date(now).toISOString()})
 member.memberFacts=async(s,ids,p)=>{calls.push({ids,p});return {errors:{analysis:null,trade:null,account:null}}}
 member.memberMetrics=()=>({total:{users:1,analysis_users:0,volume_usd:null},unmatched_users:0})
 assert.equal((await request('/ops/batches/effect/effect',undefined,'b')).status,404);assert.equal(calls.length,0)
 const r=await request('/ops/batches/effect/effect');assert.equal(r.status,200);assert.equal(r.body.users,1);assert.equal(r.body.pending,false);assert.equal(r.body.mature,false);assert.equal(calls.length,2);assert.deepEqual(calls[0].ids,['1'])
 assert.equal(r.body.before.end-r.body.before.start,r.body.after.end-r.body.after.start)
 assert.equal(db.prepare('SELECT state FROM ops_batches WHERE id=?').get(batch).state,'finished')
 }finally{remote.status=oldStatus;member.memberFacts=oldFacts;member.memberMetrics=oldMetrics}
})
test('growth review tasks preserve only the server registered absent-user list',async()=>{
 const oldJob=jobs.result,oldSnapshot=remote.snapshot,oldFacts=member.memberFacts
 const facts={known:new Set(['1']),events:[],trades:[],errors:{analysis:null,trade:null,account:null}}
 try{jobs.result=()=>({j:{snapshot:'s',context:{mode:'growth-insights',start:100,end:200,source:'all'}},value:{lists:{'growth:absent:registered':['user:1'],'growth:absent':['user:1','anonymous:a']},members:{'user:1':{id:'user:1',source:'x'}},payload:{}}})
 remote.snapshot=async()=>({snapshot_id:'s',as_of:new Date(200).toISOString(),snapshot_cutoff:new Date(200).toISOString()});member.memberFacts=async()=>facts
 // The route captures memberFacts at import, so replace its module entry through a fresh router.
 const modulePath=require.resolve('../src/routes/operationTasks');delete require.cache[modulePath]
 const taskApp=express();taskApp.use(express.json());taskApp.use((req,res,next)=>{req.user={user_id:'a'};next()});taskApp.use(require(modulePath));taskApp.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}))
 const taskServer=taskApp.listen(0)
 try{const r=await fetch('http://127.0.0.1:'+taskServer.address().port+'/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'核对未回访',cache_id:'fixed',audience_ids:['user:99']})}),data=await r.json();assert.equal(r.status,201);assert.equal(data.task.member_count,1);assert.deepEqual(JSON.parse(db.prepare('SELECT members_json FROM operation_tasks WHERE id=?').get(data.task.id).members_json),['1'])}finally{taskServer.close()}
 }finally{jobs.result=oldJob;remote.snapshot=oldSnapshot;member.memberFacts=oldFacts}
})
