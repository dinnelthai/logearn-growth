process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
remote.query=async(sql,params)=>sql.includes('FROM public.account_v2')?(Array.isArray(params[0])?params[0].filter(id=>['123','456'].includes(id)).map(account_id=>({account_id})):params[0]==='123'?[{account_id:'123'}]:[]):[]
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/crm',require('../src/routes/crm'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path='',method='GET',body,user='a') {
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/crm'+path,{method,headers:{'Content-Type':'application/json','x-owner':user},...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
}
test('CRM persists profiles and notes, validates accounts, protects ownership, and detects stale edits',async()=>{
  assert.equal((await request('','POST',{name:'KOL',platform:'X',profile_url:'javascript:alert(1)'})).status,400)
  assert.equal((await request('','POST',{name:'KOL',platform:'X',account_id:'999'})).status,400)
  const created=await request('','POST',{name:'KOL A',platform:'X',account_id:'123',assignee:'运营',stage:'试用中'})
  assert.equal(created.status,201);const p=created.body.kol,id=p.id
  assert.equal((await request('','POST',{name:'duplicate',platform:'X',account_id:'123'})).status,409)
  assert.equal((await request('/'+id,'GET',undefined,'b')).status,404)
  assert.equal((await request('/'+id,'PATCH',{stage:'合作中',expected_updated_at:p.updated_at},'b')).status,404)
  assert.equal((await request('','GET',undefined,'b')).body.total,0)
  assert.equal((await request('/'+id,'PATCH',{stage:'合作中'})).status,409)
  const updated=await request('/'+id,'PATCH',{stage:'合作中',expected_updated_at:p.updated_at})
  assert.equal(updated.status,200)
  assert.equal((await request('/'+id,'PATCH',{stage:'暂停',expected_updated_at:p.updated_at})).status,409)
  const next=Date.now()+86400000
  assert.equal((await request('/'+id+'/followups','POST',{content:'已经沟通',next_step:'体验分析',next_followup_at:next})).status,201)
  const detail=(await request('/'+id)).body
  assert.equal(detail.followups[0].content,'已经沟通');assert.equal(detail.kol.next_followup_at,next)
  assert.equal(detail.history.length,3)
  assert.equal((await request('/?q=KOL&stage=合作中')).body.total,1)
  assert.equal((await request('/metrics','POST',{kol_ids:[id],start:1,end:10},'b')).status,404)
  assert.equal((await request('/metrics','POST',{kol_ids:[id],start:'1',end:10})).status,400)
})
test('activity links enforce both owners without changing the activity roster',async()=>{
  const p=(await request('','POST',{name:'B',platform:'Telegram'})).body.kol
  const now=Date.now(),insert=db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)')
  insert.run('own','a','活动',now,now+86400000,'s','{}');insert.run('other','b','其他活动',now,now+86400000,'s','{}')
  db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run('own','123',null)
  assert.equal((await request('/'+p.id+'/activities','POST',{activity_id:'other'})).status,404)
  assert.equal((await request('/'+p.id+'/activities','POST',{activity_id:'own'})).status,200)
  assert.equal((await request('/'+p.id+'/activities','POST',{activity_id:'own'})).status,200)
  assert.equal((await request('/'+p.id)).body.activities.length,1)
  assert.equal((await request('/'+p.id+'/activities/own','DELETE',undefined,'b')).status,404)
  assert.equal((await request('/'+p.id+'/activities/own','DELETE')).status,200)
  assert.equal((await request('/'+p.id)).body.activities.length,0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_members WHERE activity_id=?').get('own').n,1)
  assert.equal((await request('/metrics','POST',{kol_ids:[p.id],start:1,end:10})).body.metrics[0].reason,'尚未关联 LogEarn 账号')
})

test('KOL manual user roster is validated, persists as a tag, and can be cleared',async()=>{
  const p=(await request('','POST',{name:'名单 KOL',platform:'X',user_ids:'123\n456\n123'})).body.kol
  assert.deepEqual(p.user_ids,['123','456'])
  assert.equal((await request('/'+p.id,'PATCH',{expected_updated_at:p.updated_at,user_ids:'999'})).status,400)
  assert.deepEqual((await request('/'+p.id)).body.kol.user_ids,['123','456'])
  const tags=require('../src/analytics/userTags').userTags('a')
  assert.deepEqual(tags.find(t=>t.id==='kol:'+p.id).user_ids,['user:123','user:456'])
  const cleared=await request('/'+p.id,'PATCH',{expected_updated_at:p.updated_at,user_ids:''})
  assert.equal(cleared.status,200);assert.deepEqual(cleared.body.kol.user_ids,[])
})
