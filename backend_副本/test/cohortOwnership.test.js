process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const {resolveAudienceUserIds}=require('../src/analytics/loadUsers')
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/cohorts',require('../src/routes/cohorts'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}))
const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path='',method='GET',body,owner='a'){
 const r=await fetch('http://127.0.0.1:'+server.address().port+'/cohorts'+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}
}
test('cohort creation ignores spoofed owners and every read/write protects ownership',async()=>{
 const created=await request('','POST',{name:'我的群组',created_by:'b',user_ids:['1','2']})
 assert.equal(created.status,201);const id=created.body.cohort.id
 assert.equal(created.body.cohort.created_by,'a');assert.deepEqual((await request('/'+id)).body.user_ids,['1','2'])
 assert.equal((await request('','GET',undefined,'b')).body.cohorts.length,0)
 for(const [path,method,body] of [[id,'GET'],[id,'PUT',{name:'越权修改'}],[id,'DELETE'],[id+'/members','POST',{user_ids:['3']}],[id+'/members','DELETE',{user_ids:['1']}]])assert.equal((await request('/'+path,method,body,'b')).status,404)
 assert.throws(()=>resolveAudienceUserIds({cohort_id:id},'b'),e=>e.status===404)
 assert.deepEqual(resolveAudienceUserIds({cohort_id:id},'a'),['1','2'])
 assert.deepEqual(resolveAudienceUserIds({cohort_id:id,audience_ids:['user:2','3']},'a'),['2'])
 assert.equal((await request('/'+id,'DELETE')).status,200)
 assert.throws(()=>resolveAudienceUserIds({cohort_id:id},'a'),e=>e.status===404)
})
test('legacy unowned records are preserved without exposing them to arbitrary users',async()=>{
 db.prepare('INSERT INTO cohorts(id,name,created_at,updated_at) VALUES(?,?,?,?)').run('legacy','旧群组',1,1)
 assert.equal((await request('/legacy')).status,404)
 assert.throws(()=>resolveAudienceUserIds({cohort_id:'legacy'},'a'),e=>e.status===404)
 assert.equal(db.prepare('SELECT is_deleted FROM cohorts WHERE id=?').get('legacy').is_deleted,0)
})
test('empty or malformed audiences cannot broaden into the whole platform',()=>{
 assert.deepEqual(resolveAudienceUserIds({audience_ids:[]},'a'),[])
 assert.deepEqual(resolveAudienceUserIds({audience_ids:['user:1','1',' 2 ']},'a'),['1','2'])
 assert.equal(resolveAudienceUserIds({},'a'),null)
 assert.throws(()=>resolveAudienceUserIds({audience_ids:'1'},'a'),e=>e.status===400)
 assert.throws(()=>resolveAudienceUserIds({audience_ids:Array.from({length:50001},(_,i)=>String(i))},'a'),e=>e.status===422)
})
