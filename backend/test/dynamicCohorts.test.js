process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),{resolveAudienceUserIds}=require('../src/analytics/loadUsers')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/c',require('../src/routes/cohorts'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path='',body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/c'+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
const rule={version:1,days:28,pool:'registered',filters:{task:'analysis_no_trade'},source:'all',tag_ids:[],tag_mode:'all',base_ids:null}
test('dynamic cohorts save validated conditions, isolate owners and never resolve as an unfiltered empty static cohort',async()=>{
 const r=await request('',{name:'needs followup',kind:'dynamic',rule});assert.equal(r.status,201);const id=r.body.cohort.id
 assert.equal(r.body.cohort.kind,'dynamic');assert.equal(r.body.cohort.member_count,null);assert.deepEqual(r.body.cohort.rule,rule)
 assert.equal((await request()).body.cohorts[0].kind,'dynamic');assert.equal((await request('/'+id)).body.user_ids,undefined)
 assert.equal((await request('/'+id,undefined,'GET','b')).status,404)
 assert.throws(()=>resolveAudienceUserIds({cohort_id:id},'a'),{status:409})
 assert.equal((await request('/'+id+'/members',{user_ids:['1']})).status,409)
 assert.equal((await request('/'+id+'/members',{user_ids:['1']},'DELETE')).status,409)
 assert.equal((await request('',{name:'bad',kind:'dynamic',rule:{...rule,filters:{unknown:'x'}}})).status,400)
 assert.equal((await request('',{name:'bad',kind:'dynamic',rule:{...rule,tag_ids:['kol:foreign']}})).status,404)
 assert.equal((await request('',{name:'bad',kind:'dynamic',rule,user_ids:['1']})).status,400)
 const fixed=await request('',{name:'fixed',user_ids:['1','2']});assert.equal(fixed.status,201);assert.deepEqual(resolveAudienceUserIds({cohort_id:fixed.body.cohort.id,audience_ids:['2','3']},'a'),['2'])
})
test('legacy activity tag backfill is one-time and never resurrects intentionally removed labels',()=>{
 const {upgradeActivities,upgradeCohorts}=require('../src/db/upgradeActivities')
 db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)').run('old','a','old',100,200,'s','{}')
 db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run('old','1',null)
 upgradeActivities(db);upgradeCohorts(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_tags WHERE activity_id=?').get('old').n,1)
 db.prepare('DELETE FROM growth_activity_tags WHERE activity_id=?').run('old');upgradeActivities(db)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_tags WHERE activity_id=?').get('old').n,0)
})
