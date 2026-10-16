process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const DAY=86400000,now=Date.now(),starts={old:now-10*DAY,young:now-2*DAY,short:now-8*DAY};let queries=0,broken=false,version=1
for(const [id,start]of Object.entries(starts)){db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)').run(id,'a',id,start,id==='short'?start+DAY:start+20*DAY,'s','{}');db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run(id,id==='young'?'2':'1',null)}
remote.status=async()=>({snapshot_id:'s'+version,snapshot_cutoff:new Date(now).toISOString(),as_of:new Date(now).toISOString()});remote.query=async sql=>{queries++;if(broken)throw Error('offline');if(sql.includes('SELECT account_id::text'))return ['1','2','3'].map(account_id=>({account_id}));if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'e1',user_id:'1',t:starts.old+100},{event_id:'e2',user_id:'2',t:starts.young+100}];return []}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/o',require('../src/routes/operationsComparison'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function req(path,body,owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/o'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('age comparison preserves individual windows, distinguishes immature and shortened activity periods',async()=>{
 const r=await req('/compare',{kind:'activity',ids:['old','young','short'],mode:'age',age_days:7});assert.equal(r.status,200)
 const rows=new Map(r.body.rows.map(r=>[r.id,r]));assert.equal(rows.get('old').mature,true);assert.equal(rows.get('old').period.end,starts.old+7*DAY)
 assert.equal(rows.get('young').mature,false);assert.equal(rows.get('young').period.end,now+1);assert.equal(rows.get('short').window_limited,true);assert.equal(rows.get('short').mature,false)
 assert.equal((await req('/compare',{kind:'kol',ids:['x','y'],mode:'age',age_days:7})).status,400)
})
test('saved reports use the server result, isolate owners and keep fixed membership when rerun',async()=>{
 const r=await req('/compare',{kind:'activity',ids:['old','young'],start:now-11*DAY,end:now,control_user_ids:['1','3']});assert.equal(r.status,200);assert.equal(r.body.rows.find(r=>r.is_control).total.users,1);assert.equal(r.body.rows.find(r=>r.is_control).excluded_overlap,1)
 assert.equal((await req('/reports',{name:'foreign',comparison_id:r.body.comparison_id},'b')).status,409)
 const saved=await req('/reports',{name:'frozen',comparison_id:r.body.comparison_id,result:{union:{users:999}}});assert.equal(saved.status,201);assert.equal(saved.body.result.union.users,3);const id=saved.body.id,before=queries
 assert.equal((await req('/reports',{name:'retry',comparison_id:r.body.comparison_id})).body.id,id);assert.equal((await req('/reports')).body.total,1)
 assert.equal((await req('/reports/'+id,undefined,'b')).status,404);assert.equal((await req('/reports',undefined,'b')).body.total,0)
 db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run('old','3',null)
 const frozen=await req('/reports/'+id);assert.equal(queries,before);assert.deepEqual(frozen.body.result,saved.body.result)
 version++;const rerun=await req('/reports/'+id+'/rerun',{});assert.equal(rerun.body.snapshot_id,'s2');assert.equal(rerun.body.rows.find(r=>r.id==='old').total.users,1);assert.equal((await req('/reports/'+id)).body.result.snapshot_id,'s1')
 broken=true;const failed=await req('/compare',{kind:'activity',ids:['old','young'],start:now-11*DAY,end:now});assert.equal((await req('/reports',{name:'unknown',comparison_id:failed.body.comparison_id})).status,503);broken=false
})
