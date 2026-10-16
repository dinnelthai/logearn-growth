process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres'),{userTags}=require('../src/analytics/userTags')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
remote.status=async()=>({snapshot_id:'test',snapshot_cutoff:new Date().toISOString()});remote.query=async(_sql,p)=>p[1].filter(id=>['1','2','3','4'].includes(id)).map(user_id=>({user_id,baseline_first_at:user_id==='1'?100:null}))
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/a',require('../src/routes/activities'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path='',body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/a'+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('batches preserve the original roster, inherit KOL links and exclude historical members',async()=>{
 const c=await request('',{name:'campaign',user_ids:'1\n2',cutoff_at:Date.now()+3600000}),id=c.body.activity.id
 db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('k','a','KOL','X',1,1)
 db.prepare('INSERT INTO crm_activity_links VALUES(?,?,?)').run('k',id,1)
 const b=await request('/'+id+'/batches',{name:'batch2',user_ids:'2\n3',target_metric:'first_analysis_users',target_value:1});assert.equal(b.status,201);assert.equal(b.body.skipped_existing,1);assert.equal(b.body.activity.target_value,1);assert.equal((await request('/'+id+'/roster')).body.activity.target_value,null)
 assert.deepEqual((await request('/'+id+'/roster')).body.user_ids,['1','2']);assert.deepEqual((await request('/'+b.body.activity.id+'/roster')).body.user_ids,['3'])
 assert.equal(b.body.activity.kols[0].id,'k');assert.equal(b.body.activity.parent_id,id)
 assert.equal((await request('/'+id+'/batches',{user_ids:'1\n3'})).status,400)
 const batches=(await request('/'+b.body.activity.id+'/batches')).body;assert.equal(batches.batches.length,2);assert.deepEqual(batches.tag_user_ids,['1','2','3'])
 assert.equal(userTags('a',{includeMembers:false}).filter(t=>t.type==='activity').length,1)
 const preview=await request('/'+id+'/validate-batch',{user_ids:'2\n4\nmissing\n4'});assert.equal(preview.body.matched,1);assert.equal(preview.body.skipped_existing,1);assert.equal(preview.body.duplicates,1);assert.deepEqual(preview.body.unmatched,['missing'])
 assert.deepEqual((await request('/'+id+'/roster')).body.user_ids,['1','2'])
 db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run('k','3')
 assert.deepEqual((await request('/import-kol',{kol_id:'k',scope:'tagged'})).body.user_ids,['3'])
 assert.equal((await request('/import-kol',{kol_id:'k',scope:'own'})).status,409)
 assert.equal((await request('/import-kol',{kol_id:'k'},'POST','b')).status,404)
 const version=batches.root.tag_version
 assert.equal((await request('/'+id+'/tag-members',{user_ids:'2',action:'remove',expected_tag_version:version})).status,200)
 assert.equal((await request('/'+id+'/tag-members',{user_ids:'4',action:'add',expected_tag_version:version})).status,409)
 assert.deepEqual((await request('/'+id+'/roster')).body.user_ids,['1','2']);assert.deepEqual(userTags('a',{tagIds:['activity:'+id]})[0].user_ids,['user:1','user:3'])
 assert.equal((await request('/'+id+'/batches',undefined,'GET','b')).status,404)
 await request('/'+id,{archived:true},'PATCH');assert.equal((await request()).body.activities.length,0);assert.equal((await request('?archive=archived')).body.activities.length,2)
 assert.equal((await request('/'+id+'/batches',{user_ids:'4'})).status,400)
 await request('/'+id,{archived:false},'PATCH');assert.equal((await request()).body.activities.length,2)
 // Editing current labels must not replace a historical frozen result.
 db.prepare('UPDATE growth_activities SET settled_result=?,settled_at=? WHERE id=?').run('{"proof":"frozen"}',Date.now(),id)
 const v=(await request('/'+id+'/batches')).body.root.tag_version
 await request('/'+id+'/tag-members',{user_ids:'1',action:'remove',expected_tag_version:v})
 assert.equal(db.prepare('SELECT settled_result FROM growth_activities WHERE id=?').get(id).settled_result,'{"proof":"frozen"}')
})
