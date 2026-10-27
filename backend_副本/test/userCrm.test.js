process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),db=require('../src/db/connection'),crm=require('../src/services/userCrm'),express=require('express'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const now=Date.now(),D=crm.DAY,user='user:132';let events=[],sourceFailure=false
remote.status=async()=>({snapshot_id:'s',snapshot_cutoff:new Date(Date.now()).toISOString(),as_of:new Date(Date.now()).toISOString()})
remote.query=async(sql,p)=>{if(sourceFailure)throw Error('source unavailable');if(sql.includes('account_id::text=$1 LIMIT'))return ['132','133'].includes(p[0])?[{account_id:p[0]}]:[];if(sql.includes('FROM public.wallet_v2'))return [{network:'evm',address:'0x'+'a'.repeat(40)}];if(sql.includes('SELECT event_id AS id'))return events;return []}
const metrics=require('../src/data/memberMetrics');metrics.memberFacts=async()=>({known:new Set(['132']),events:[],trades:[],errors:{}});metrics.memberMetrics=()=>({total:{analysis_users:0}})
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/api/user-crm',require('../src/routes/userCrm'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path='',method='GET',body,owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/user-crm'+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
const entitlement=(extra={})=>({user_key:user,kind:'week',starts_at:now-D,expires_at:now+D,reference:'order-'+Math.random(),...extra})
const task=(extra={})=>({user_key:user,goal:'analysis',deadline:now+7*D,...extra})
test('address normalization, confirmed ownership, independent leads, owner isolation and CAS history',async()=>{
 const bad=await request('/addresses','POST',{user_key:user,network:'evm',address:'0x'+'b'.repeat(40),note:'线索'});assert.equal(bad.status,400)
 const result=await request('/addresses','POST',{user_key:user,network:'evm',address:'0x'+'A'.repeat(40),note:'需求',alias:'重点'});assert.equal(result.status,201);const a=result.body.address;assert.equal(a.address,'0x'+'a'.repeat(40))
 assert.equal((await request('/addresses','POST',{network:'evm',address:a.address,note:'重复'})).status,409)
 assert.equal((await request('/addresses/'+a.id,'PATCH',{expected_updated_at:a.updated_at,note:'x'},'b')).status,404)
 const edited=await request('/addresses/'+a.id,'PATCH',{expected_updated_at:a.updated_at,note:'已沟通',alias:'重点'});assert.equal(edited.status,200)
 assert.equal((await request('/addresses/'+a.id,'PATCH',{expected_updated_at:a.updated_at,note:'覆盖'})).status,409)
 const independent=await request('/addresses','POST',{network:'solana',address:'1'.repeat(32),note:'尚未注册'});assert.equal(independent.status,201);assert.equal(independent.body.address.user_key,null)
 assert.equal((await request('/history/'+a.id)).body.history.length,2);assert.equal((await request('/history/'+a.id,'GET',null,'b')).body.history.length,0)
})
test('week/month require expiry, NFT unknown duration, evidence dedup, revocation and state boundaries',async()=>{
 assert.equal((await request('/entitlements','POST',entitlement({expires_at:null}))).status,400)
 assert.equal((await request('/entitlements','POST',entitlement({reference:''}))).status,400)
 assert.equal((await request('/entitlements','POST',entitlement({user_key:'999'}))).status,404)
 const e=(await request('/entitlements','POST',entitlement({reference:'proof-1'}))).body.entitlement;assert.equal(crm.state(e,now),'expiring');assert.equal(crm.state(e,e.expires_at),'expired')
 assert.equal((await request('/entitlements','POST',entitlement({reference:'proof-1'}))).status,409)
 const n=await request('/entitlements','POST',entitlement({kind:'nft',expires_at:null}));assert.equal(n.status,201);assert.equal(crm.state(n.body.entitlement,now),'recorded')
 assert.equal((await request('/entitlements/'+e.id+'/revoke','PATCH',{expected_updated_at:e.updated_at,reason:'录入错误'},'b')).status,404)
 assert.equal((await request('/entitlements/'+e.id+'/revoke','PATCH',{expected_updated_at:e.updated_at,reason:'录入错误'})).status,200)
})
test('tasks freeze baselines, reject duplicate active goals and separate processing from outcome',async()=>{
 const r=await request('/tasks','POST',task());assert.equal(r.status,201);const t=r.body.task;assert.equal(t.baseline.analysis_users,0)
 assert.equal((await request('/tasks','POST',task())).status,409)
 assert.equal((await request('/tasks/'+t.id,'PATCH',{expected_updated_at:t.updated_at,status:'done'})).status,400)
 assert.equal((await request('/tasks/'+t.id,'PATCH',{expected_updated_at:t.updated_at,status:'done',note:'已发使用指引'})).status,200)
 assert.equal(crm.expose(crm.get('ops_conversion_tasks',t.id,'a')).result.outcome,undefined)
 assert.equal((await request('/tasks/'+t.id,'PATCH',{expected_updated_at:t.updated_at,status:'open',note:'x'})).status,409)
 assert.equal((await request('/tasks/'+t.id+'/check','POST',{},'b')).status,404)
})
test('automatic goal check preserves evidence, source failure does not invent a zero and cannot be manually confirmed',async()=>{
 const t=(await request('/tasks','POST',task())).body.task
 const waiting=await request('/tasks/'+t.id+'/check','POST',{});assert.equal(waiting.body.task.result.outcome,'observing')
 sourceFailure=true;assert.equal((await request('/tasks/'+t.id+'/check','POST',{})).status,500);sourceFailure=false
 assert.equal(crm.expose(crm.get('ops_conversion_tasks',t.id,'a')).result.outcome,'observing')
 events=[{id:'event-1',t:Date.now(),date:'2026-10-16'}];const done=await request('/tasks/'+t.id+'/check','POST',{});assert.equal(done.body.task.result.outcome,'achieved');assert.equal(done.body.task.result.evidence.id,'event-1');assert.equal(done.body.task.status,'open')
 events=[];assert.equal((await request('/tasks/'+t.id+'/check','POST',{})).body.task.result.outcome,'achieved')
 assert.equal((await request('/tasks/'+t.id,'PATCH',{expected_updated_at:done.body.task.updated_at,confirm_manual:true,reference:'x',note:'x'})).status,400)
})
test('manual renewal requires same-owner cycle and evidence; cancelled cycle can be replaced',async()=>{
 const e=crm.createEntitlement('a',entitlement()),other=crm.createEntitlement('b',entitlement())
 assert.equal((await request('/tasks','POST',task({goal:'renew',entitlement_id:other.id}))).status,404)
 const t=(await request('/tasks','POST',task({goal:'renew',entitlement_id:e.id}))).body.task;assert.equal(t.baseline.entitlement.id,e.id)
 assert.equal((await request('/tasks/'+t.id+'/check','POST',{})).status,400)
 assert.equal((await request('/tasks/'+t.id,'PATCH',{expected_updated_at:t.updated_at,confirm_manual:true,note:'核验'})).status,400)
 const r=await request('/tasks/'+t.id,'PATCH',{expected_updated_at:t.updated_at,confirm_manual:true,reference:'续费订单-2',note:'人工核验订单',status:'done'});assert.equal(r.body.task.result.outcome,'manual_confirmed');assert.equal(r.body.task.result.automatic,false)
 assert.equal((await request('/tasks','POST',task({goal:'renew',entitlement_id:e.id}))).status,409)
})
test('server search and paging apply before pagination and counts stay owner scoped',()=>{
 for(let i=0;i<55;i++)crm.createEntitlement('a',entitlement({kind:'month',reference:'page-'+i}))
 const a=crm.list('a',null,{tab:'rights',filter:'month'}),b=crm.list('a',null,{tab:'rights',filter:'month',offset:50});assert.equal(a.entitlements.length,50);assert.equal(b.entitlements.length,5);assert.equal(a.totals.entitlements,55)
 assert.equal(new Set([...a.entitlements,...b.entitlements].map(e=>e.id)).size,55)
 assert.equal(crm.list('a',null,{tab:'rights',q:'page-54'}).entitlements.length,1)
 assert.equal(crm.list('b',null,{tab:'rights',filter:'month'}).totals.entitlements,0)
})
test('entitlement expiry edits are versioned and never rewrite task cycle baselines',async()=>{
 const e=crm.createEntitlement('a',entitlement()),t=crm.createTask('a',task({goal:'renew',entitlement_id:e.id}),{as_of:new Date(now).toISOString()})
 const input={...entitlement({expires_at:now+10*D}),expected_updated_at:e.updated_at}
 assert.equal((await request('/entitlements/'+e.id,'PATCH',input,'b')).status,404)
 assert.equal((await request('/entitlements/'+e.id,'PATCH',input)).status,200)
 assert.equal(crm.expose(crm.get('ops_conversion_tasks',t.id,'a')).baseline.entitlement.expires_at,e.expires_at)
 assert.equal((await request('/entitlements/'+e.id,'PATCH',input)).status,409)
})

test('batch conversion creation deduplicates users and rolls back every task on a cycle conflict',async()=>{
 const e=crm.createEntitlement('a',entitlement()),input=task({goal:'upgrade',entitlement_id:e.id})
 assert.equal((await request('/tasks/batch','POST',{tasks:[input,input]})).status,400)
 const created=await request('/tasks/batch','POST',{tasks:[input]});assert.equal(created.status,201)
 assert.equal((await request('/tasks/batch','POST',{tasks:[input]})).status,409)
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ops_conversion_tasks WHERE goal='upgrade'").get().n,1)
})
test('saved conversion reports are immutable, owner scoped and distinguish manual from automatic outcomes',async()=>{
 const saved=await request('/reports','POST',{user_key:user});assert.equal(saved.status,201);const report=saved.body.report,renew=report.goals.find(g=>g.goal==='renew');assert.equal(renew.manual_confirmed_users,1);assert.equal(renew.automatic_users,0)
 const original=JSON.stringify(report),r=crm.createTask('a',task({goal:'manual'}),{});crm.updateTask('a',r.id,{expected_updated_at:r.updated_at,status:'done',note:'已沟通'})
 assert.equal(JSON.stringify((await request('/reports/'+report.id)).body.report),original)
 assert.equal((await request('/reports/'+report.id,'GET',null,'b')).status,404)
 assert.equal((await request('/reports','GET',null,'b')).body.reports.length,0)
})

test('a later conflict rolls back an earlier prepared task in the same batch',async()=>{
 const body={tasks:[task({user_key:'user:133',goal:'manual'}),task({goal:'upgrade',entitlement_id:db.prepare("SELECT entitlement_id FROM ops_conversion_tasks WHERE goal='upgrade' LIMIT 1").get().entitlement_id})]}
 assert.equal((await request('/tasks/batch','POST',body)).status,409)
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ops_conversion_tasks WHERE user_key='user:133'").get().n,0)
})
