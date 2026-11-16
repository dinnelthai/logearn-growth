process.env.DB_PATH=':memory:'
const {test,after}=require('node:test')
const assert=require('node:assert/strict')
const express=require('express')
const fs=require('node:fs')
const path=require('node:path')
const db=require('../src/db/connection')

db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const app=express()
app.use(express.json())
app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'owner-a'};next()})
app.use('/cohorts',require('../src/routes/cohorts'))
app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}))
const server=app.listen(0)
after(()=>{server.close();db.close()})
async function request(route,method='GET',body,owner='owner-a'){
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/cohorts'+route,{
    method,headers:{'Content-Type':'application/json','x-owner':owner},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  })
  return {status:response.status,body:await response.json()}
}

test('actions are durable in cohort and scoped to operator',async()=>{
  const made=await request('/','POST',{name:'11月运营追踪',user_ids:['115','132']})
  assert.equal(made.status,201)
  const id=made.body.cohort.id
  const when=Date.now()-86400000
  const action=await request('/'+id+'/actions','POST',{title:'训练营邀请',note:'Telegram',executed_at:when})
  assert.equal(action.status,201)
  assert.equal(action.body.action.executed_at,when)
  const actions=await request('/'+id+'/actions')
  assert.equal(actions.status,200)
  assert.deepEqual(actions.body.actions.map(row=>row.title),['训练营邀请'])
  assert.equal((await request('/'+id+'/actions','GET',undefined,'owner-b')).status,404)
  assert.equal((await request('/'+id+'/actions','POST',{title:'越权',executed_at:when},'owner-b')).status,404)
  assert.equal((await request('/','GET',undefined,'owner-b')).body.cohorts.length,0)
  assert.equal((await request('/'+id+'/actions','POST',{title:' ',executed_at:when})).status,400)
  assert.equal((await request('/'+id+'/actions','POST',{title:'误填时间',executed_at:'NaN'})).status,400)
  assert.equal((await request('/'+id+'/actions','POST',{title:'将来动作',executed_at:Date.now()+86400000})).status,400)
  assert.equal((await request('/'+id,'DELETE')).status,200)
  assert.equal((await request('/'+id+'/actions')).status,404)
})

test('dynamic cohort cannot record fixed-list interventions',async()=>{
  const now=Date.now()
  db.prepare('INSERT INTO cohorts (id,name,created_at,updated_at,created_by,kind,rule_json) VALUES (?,?,?,?,?,?,?)')
    .run('dynamic-test','动态群组',now,now,'owner-a','dynamic',JSON.stringify({version:1}))
  assert.equal((await request('/dynamic-test/actions')).status,409)
  assert.equal((await request('/dynamic-test/actions','POST',{title:'无效',executed_at:now})).status,409)
})
