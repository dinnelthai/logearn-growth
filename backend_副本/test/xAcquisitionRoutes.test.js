process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection')
const fs=require('node:fs'),path=require('node:path')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const now=Date.now()
for(const owner of ['a','b']){
 db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(owner,owner+'@example.com','unused',now)
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('token-'+owner,owner,now,now+3600000)
}
const provider=require('../src/services/twitterApi')
provider.configured=()=>true
provider.search=async args=>{const reservation=args.beforeAttempt();args.settleAttempt(reservation,15);return {tweets:[{id:'100',text:'How to check token holders? Looking for a tool.',createdAt:new Date().toISOString(),author:{id:'200',userName:'researcher'}}],has_next_page:false,next_cursor:''}}
const app=express();app.use(express.json());app.use('/x',require('../src/middleware/requireAuth'),require('../src/routes/xAcquisition'));app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}))
const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(url='',method='GET',body,owner='a'){
 const res=await fetch('http://127.0.0.1:'+server.address().port+'/x'+url,{method,headers:{'Content-Type':'application/json',...(owner?{Authorization:'Bearer token-'+owner}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 return {status:res.status,data:await res.json()}
}
test('X routes require login, isolate operators and persist rules, collection and follow-up',async()=>{
 assert.equal((await request('','GET',undefined,null)).status,401)
 assert.equal((await request('')).data.total,0)
 assert.equal((await request('/setup','POST',{})).status,200)
 assert.equal((await request('/setup','POST',{})).status,200)
 const dashboard=(await request('')).data;assert.equal(dashboard.rules.length,4);assert.equal(dashboard.configured,true)
 assert.equal((await request('/collect','POST',{rule_id:dashboard.rules[0].id},'b')).status,404)
 const collected=await request('/collect','POST',{rule_id:dashboard.rules[0].id});assert.equal(collected.status,202);assert.ok(collected.data.run.id)
 const l=(await request('')).data.leads[0]
 assert.equal((await request('/leads/'+l.id,'GET',undefined,'b')).status,404)
 assert.equal((await request('/leads/'+l.id,'PATCH',{stage:'replied',content:'对方回复了问题',expected_updated_at:l.updated_at})).status,200)
 const details=(await request('/leads/'+l.id)).data;assert.equal(details.followups.length,1);assert.equal(details.lead.stage,'replied')
 assert.equal((await request('/leads/'+l.id,'PATCH',{stage:'trial',content:'test',expected_updated_at:l.updated_at})).status,409)
 assert.equal((await request('/?stage=unknown')).status,400)
 assert.equal((await request('/rules','POST',{name:'invalid',query:'tool since_time:123'})).status,400)
 assert.equal((await request('','GET',undefined,'b')).data.leads.length,0)
 const serialized=JSON.stringify((await request('')).data);assert.ok(!serialized.includes('TWITTERAPI_IO_API_KEY'));assert.ok(!serialized.includes('X-API-Key'))
})
