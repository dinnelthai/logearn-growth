process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const now=Date.now(),snapshot={snapshot_id:'u',snapshot_cutoff:new Date(now).toISOString(),as_of:new Date(now).toISOString()}
remote.snapshot=async id=>{if(id==='expired')throw Object.assign(Error('快照过期'),{status:409});return snapshot}
require('../src/data/remoteUsers').features=async(_s,_source,ids)=>ids[0]==='user:132'?[{user_key:'user:132',account_id:'132',created_at:1}]:[]
remote.query=async(sql,p)=>{
 if(sql.includes('trade_groups'))return []
 if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'a',user_id:'132',t:now-1000}]
 if(sql.includes('FROM e WHERE user_key=$2'))return [{event_id:'a',event_name:'chip_analysis_viewed',t:now-1000,page:'https://logearn.com/token?secret=hidden'}]
 if(sql.includes('account_id::text=$1'))return p[0]==='132'?[{account_id:'132'}]:[]
 return [{account_id:'132'}]
}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use(require('../src/routes/userOperations'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path,method='GET',body,owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('profile combines period facts, owner-scoped tags and safely rendered event paths',async()=>{
 db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('a','a','A','X',1,1);db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('b','b','B','X',1,1)
 for(const id of ['a','b'])db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run(id,'132')
 const result=await request('/api/users/user:132/profile?start='+(now-86400000)+'&end='+now)
 assert.equal(result.status,200);assert.equal(result.body.performance.total.analysis_events,1);assert.deepEqual(result.body.tags.map(t=>t.name),['A']);assert.equal(result.body.tags[0].removable,true);assert.equal(result.body.events[0].page,'https://logearn.com/token')
 assert.equal((await request('/api/users/unknown/profile')).status,400);assert.equal((await request('/api/users/999/profile')).status,404);assert.equal((await request('/api/users/132/profile?snapshot_id=expired')).status,409)
})
test('followups persist, become due work, isolate owners and preserve completed history',async()=>{
 assert.equal((await request('/api/users/132/followups','POST',{content:''})).status,400)
 assert.equal((await request('/api/users/999/followups','POST',{content:'unknown'})).status,404)
 const result=await request('/api/users/132/followups','POST',{content:'已沟通',next_step:'核对使用',due_at:now-1000});assert.equal(result.status,201);const id=result.body.followup.id
 assert.equal((await request('/api/workbench')).body.summary.user_due,1);assert.equal((await request('/api/workbench','GET',undefined,'b')).body.summary.user_due,0)
 assert.equal((await request('/api/user-followups/'+id,'PATCH',{status:'done'},'b')).status,404)
 assert.equal((await request('/api/user-followups/'+id,'PATCH',{status:'invalid'})).status,400)
 assert.equal((await request('/api/user-followups/'+id,'PATCH',{status:'done'})).status,200)
 const done=(await request('/api/workbench')).body;assert.equal(done.summary.user_due,0);assert.equal(done.summary.completed,1);assert.equal(done.tasks.find(t=>t.id===id).description,'核对使用')
 const profile=(await request('/api/users/132/profile')).body;assert.equal(profile.followups[0].content,'已沟通');assert.equal(profile.followups[0].status,'done');assert.equal((await request('/api/users/132/profile','GET',undefined,'b')).body.followups.length,0)
 await request('/api/user-followups/'+id,'PATCH',{status:'open'});assert.equal((await request('/api/workbench')).body.summary.user_due,1)
})
test('workbench derives KOL and activity state with the same owner and settlement wait',async()=>{
 db.prepare('UPDATE crm_kols SET next_followup_at=? WHERE id=?').run(now-1000,'a');db.prepare('UPDATE crm_kols SET next_followup_at=? WHERE id=?').run(now-1000,'b')
 const stmt=db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)')
 stmt.run('waiting','a','等待结算',now-1000,now-500,'s','{}');stmt.run('ready','a','待结算',now-3*86400000,now-2*86400000,'s','{}');stmt.run('other','b','Other',now-3*86400000,now-2*86400000,'s','{}')
 const r=(await request('/api/workbench')).body;assert.equal(r.summary.kol_due,1);assert.equal(r.summary.activity_pending,2);assert.equal(r.tasks.filter(t=>t.type==='activity'&&t.due_at<=now).length,1);assert.ok(!r.tasks.some(t=>t.target==='b'||t.target==='other'))
 db.prepare('UPDATE growth_activities SET settled_at=? WHERE id=?').run(now,'ready');assert.equal((await request('/api/workbench')).body.summary.activity_pending,1)
})
test('timeline accepts a fixed snapshot page and rejects invalid offsets',async()=>{
 assert.equal((await request('/api/users/132/profile?event_offset=100&snapshot_id=u')).body.event_offset,100)
 assert.equal((await request('/api/users/132/profile?event_offset=-1')).status,400)
 assert.equal((await request('/api/users/132/profile?event_offset=Infinity')).status,400)
})
test('a drill result cannot be used to bypass the analysis owner check',async()=>{
 assert.equal((await request('/api/users/132/profile?cache_id=missing')).status,409)
})
