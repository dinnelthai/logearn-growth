process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres'),{userTags}=require('../src/analytics/userTags')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
remote.status=async()=>({snapshot_id:'test',snapshot_cutoff:new Date().toISOString()});remote.query=async(_sql,p)=>p[1].filter(id=>['1','2','3','4'].includes(id)).map(user_id=>({user_id,baseline_first_at:user_id==='1'?100:null}))
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/a',require('../src/routes/activities'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path='',body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/a'+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('adding members keeps one activity, its targets and original start time',async()=>{
 const c=await request('',{name:'campaign',user_ids:'1\n2',cutoff_at:Date.now()+3600000}),id=c.body.activity.id
 db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('k','a','KOL','X',1,1)
 db.prepare('INSERT INTO crm_activity_links VALUES(?,?,?)').run('k',id,1)
 const b=await request('/'+id+'/batches',{name:'batch2',user_ids:'2\n3',target_metric:'first_analysis_users',target_value:1});assert.equal(b.status,201);assert.equal(b.body.skipped_existing,1);assert.equal(b.body.activity.target_value,null);assert.equal(b.body.activity.id,id);assert.equal(b.body.added,1);assert.equal((await request('/'+id+'/roster')).body.activity.target_value,null)
 assert.deepEqual((await request('/'+id+'/roster')).body.user_ids,['1','2','3'])
 assert.equal(b.body.activity.kols[0].id,'k');assert.equal(b.body.activity.parent_id,null)
 assert.equal((await request('/'+id+'/batches',{user_ids:'1\n3'})).status,400)
 const batches=(await request('/'+b.body.activity.id+'/batches')).body;assert.equal(batches.batches.length,1);assert.deepEqual(batches.tag_user_ids,['1','2','3'])
 assert.equal(userTags('a',{includeMembers:false}).filter(t=>t.type==='activity').length,1)
 const preview=await request('/'+id+'/validate-batch',{user_ids:'2\n4\nmissing\n4'});assert.equal(preview.body.matched,1);assert.equal(preview.body.skipped_existing,1);assert.equal(preview.body.duplicates,1);assert.deepEqual(preview.body.unmatched,['missing'])
 assert.deepEqual((await request('/'+id+'/roster')).body.user_ids,['1','2','3'])
 db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run('k','3')
 assert.deepEqual((await request('/import-kol',{kol_id:'k',scope:'tagged'})).body.user_ids,['3'])
 assert.equal((await request('/import-kol',{kol_id:'k',scope:'own'})).status,409)
 assert.equal((await request('/import-kol',{kol_id:'k'},'POST','b')).status,404)
 const version=batches.root.tag_version
 assert.equal((await request('/'+id+'/tag-members',{user_ids:'2',action:'remove',expected_tag_version:version})).status,200)
 assert.equal((await request('/'+id+'/tag-members',{user_ids:'4',action:'add',expected_tag_version:version})).status,409)
 assert.deepEqual((await request('/'+id+'/roster')).body.user_ids,['1','2','3']);assert.deepEqual(userTags('a',{tagIds:['activity:'+id]})[0].user_ids,['user:1','user:3'])
 assert.equal((await request('/'+id+'/batches',undefined,'GET','b')).status,404)
 await request('/'+id,{archived:true},'PATCH');assert.equal((await request()).body.activities.length,0);assert.equal((await request('?archive=archived')).body.activities.length,1)
 assert.equal((await request('/'+id+'/batches',{user_ids:'4'})).status,400)
 await request('/'+id,{archived:false},'PATCH');assert.equal((await request()).body.activities.length,1)
 // Editing current labels must not replace a historical frozen result.
 db.prepare('UPDATE growth_activities SET settled_result=?,settled_at=? WHERE id=?').run('{"proof":"frozen"}',Date.now(),id)
 const v=(await request('/'+id+'/batches')).body.root.tag_version
 await request('/'+id+'/tag-members',{user_ids:'1',action:'remove',expected_tag_version:v})
 assert.equal(db.prepare('SELECT settled_result FROM growth_activities WHERE id=?').get(id).settled_result,'{"proof":"frozen"}')
})

test('roster-only append keeps the root name, target and activity count',async()=>{
 const c=await request('',{name:'campaign',user_ids:'1',cutoff_at:Date.now()+3600000,target_metric:'first_analysis_users',target_value:8}),a=c.body.activity
 const r=await request('/'+a.id+'/batches',{user_ids:'2\n1'});assert.equal(r.status,201);assert.equal(r.body.activity.id,a.id);assert.equal(r.body.activity.name,a.name);assert.equal(r.body.activity.start_at,a.start_at);assert.equal(r.body.activity.target_value,8);assert.equal(r.body.skipped_existing,1);assert.equal(r.body.activity.schedule_version,a.schedule_version+1)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM growth_activities WHERE id=? OR parent_id=?').get(a.id,a.id).n,1)
})
test('legacy child membership is merged once and old links resolve to the root',async()=>{
 const c=await request('',{name:'legacy',user_ids:'1',cutoff_at:Date.now()+3600000}),a=c.body.activity
 db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report,parent_id) VALUES(?,?,?,?,?,?,?,?)').run('old-child','a','legacy child',a.start_at+100,a.cutoff_at,'test','{}',a.id)
 db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run('old-child','2',a.start_at+50)
 const {mergeActivityBatches}=require('../src/db/mergeActivityBatches');assert.equal(mergeActivityBatches(db),1);assert.equal(mergeActivityBatches(db),0)
 const roster=(await request('/old-child/roster')).body;assert.equal(roster.activity.id,a.id);assert.deepEqual(roster.user_ids,['1','2']);assert.equal(db.prepare('SELECT baseline_first_at FROM growth_activity_members WHERE activity_id=? AND user_id=?').get(a.id,'2').baseline_first_at,null)
 assert(!(await request()).body.activities.some(a=>a.id==='old-child'))
})

test('cumulative fixed membership stays within 5000 even when tags have been removed',async()=>{
 const c=await request('',{name:'capacity',user_ids:'1',cutoff_at:Date.now()+3600000}),id=c.body.activity.id
 const insert=db.prepare('INSERT INTO growth_activity_members VALUES(?,?,NULL)')
 db.exec('BEGIN');try{for(let i=1000;i<5998;i++)insert.run(id,String(i));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 const exact=await request('/'+id+'/batches',{user_ids:'2'});assert.equal(exact.status,201)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_members WHERE activity_id=?').get(id).n,5000)
 db.prepare('DELETE FROM growth_activity_tags WHERE activity_id=?').run(id)
 const before=db.prepare('SELECT schedule_version,tag_version FROM growth_activities WHERE id=?').get(id)
 const overflow=await request('/'+id+'/batches',{user_ids:'3'});assert.equal(overflow.status,422)
 assert.match(overflow.body.error,/累计参与名单最多5000/)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_members WHERE activity_id=?').get(id).n,5000)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_tags WHERE activity_id=?').get(id).n,0)
 assert.deepEqual(db.prepare('SELECT schedule_version,tag_version FROM growth_activities WHERE id=?').get(id),before)
})
