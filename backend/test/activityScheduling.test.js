process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres'),schedule=require('../src/services/activitySchedule')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const realNow=Date.now,base=realNow();let now=base,broken=false,observed=null,queries=0,gate=null,entered=null
Date.now=()=>now
const firsts=new Map([['1',base-1000],['2',base+500],['3',base+1000],['4',null]])
remote.status=async()=>({snapshot_id:'s'+now,snapshot_cutoff:new Date(now).toISOString(),as_of:new Date(observed??now).toISOString()});remote.cached=async(_k,fn)=>fn()
remote.query=async(sql,p)=>{queries++;if(broken)throw Error('source offline');if(sql.includes('a.created_at<=$3::timestamptz')&&gate){entered();await gate}if(sql.includes('SELECT account_id::text AS account_id'))return p[1].filter(id=>firsts.has(id)).map(account_id=>({account_id}));if(sql.includes('SELECT event_id,SUBSTRING')||sql.includes('trade_groups')||sql.includes('first_analysis_at'))return [];return p[1].filter(id=>firsts.has(id)).map(user_id=>({user_id,baseline_first_at:firsts.get(user_id)!=null&&firsts.get(user_id)<=now?firsts.get(user_id):null}))}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/a',require('../src/routes/activities'));app.use('/o',require('../src/routes/operationsComparison'));app.use(require('../src/routes/userOperations'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{Date.now=realNow;server.close();db.close()})
async function req(path,body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
const count=(table,id)=>db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE activity_id=?`).get(id).n
async function create(start=now+1000,ids=['1','2','3']){const r=await req('/a',{name:'scheduled',start_at:start,cutoff_at:start+86400000,user_ids:ids,target_metric:'first_analysis_users',target_value:2});assert.equal(r.status,201);return r.body.activity}
test('scheduled activity has a plan without a frozen denominator; late start uses the intended boundary exactly once',async()=>{
 now=base;const a=await create();assert.equal(a.schedule_state,'scheduled');assert.equal(a.planned_count,3);assert.equal(count('growth_activity_members',a.id),0);assert.equal(count('growth_activity_tags',a.id),3)
 const pending=await req('/a/'+a.id+'/metrics');assert.equal(pending.body.pending,true);assert.equal(pending.body.target_progress,null);assert.equal(pending.body.performance,null);assert.equal(pending.body.summary,undefined)
 assert.equal((await req('/a/'+a.id+'/start',{expected_schedule_version:0})).status,409)
 assert.equal((await req('/a/'+a.id+'/batches',{user_ids:['4']})).status,400)
 now=base+10000;await schedule.tick();const active=db.prepare('SELECT * FROM growth_activities WHERE id=?').get(a.id);assert.equal(active.schedule_state,'active');assert.equal(active.start_at,base+1000);assert.equal(active.baseline_frozen_at,now)
 const rows=db.prepare('SELECT * FROM growth_activity_members WHERE activity_id=? ORDER BY user_id').all(a.id);assert.deepEqual(rows.map(r=>r.baseline_first_at),[base-1000,base+500,null]);assert.equal(JSON.parse(active.import_report).eligible,1);assert.equal(JSON.parse(active.import_report).baseline_pending,false)
 const before=queries;firsts.set('3',base-500);await schedule.ensureStarted(a.id,{force:true});assert.equal(queries,before);assert.equal(db.prepare('SELECT baseline_first_at FROM growth_activity_members WHERE activity_id=? AND user_id=?').get(a.id,'3').baseline_first_at,null)
 assert.equal((await req('/a/'+a.id+'/schedule',{start_at:now+1000,cutoff_at:now+5000,expected_schedule_version:1},'PATCH')).status,409)
})
test('source lag, failures and archives keep plans pending without zero baselines, and retries recover',async()=>{
 now=base+20000;const a=await create(now+1000,['4']);now+=2000;observed=now-2000;await schedule.tick();assert.equal(count('growth_activity_members',a.id),0);assert.match(db.prepare('SELECT schedule_error FROM growth_activities WHERE id=?').get(a.id).schedule_error,/数据截至/)
 observed=null;broken=true;assert.equal((await req('/a/'+a.id+'/start',{expected_schedule_version:0})).status,503);assert.equal(count('growth_activity_members',a.id),0)
 await req('/a/'+a.id,{archived:true},'PATCH');broken=false;assert.equal((await req('/a/'+a.id+'/start',{expected_schedule_version:0})).status,409);await schedule.ensureStarted(a.id,{force:true});assert.equal(count('growth_activity_members',a.id),0)
 await req('/a/'+a.id,{archived:false},'PATCH');assert.equal((await req('/a/'+a.id+'/start',{expected_schedule_version:0})).status,200);assert.equal(count('growth_activity_members',a.id),1)
})
test('schedule changes enforce owner and revision, preserve tags outside the plan, and surface upcoming work',async()=>{
 now=base+30000;const a=await create(now+10000,['1','2']),before=queries
 assert.equal((await req('/a/'+a.id+'/schedule',undefined,'GET','b')).status,404);assert.equal((await req('/a/'+a.id+'/schedule',{expected_schedule_version:0},'PATCH','b')).status,404);assert.equal(queries,before)
 await req('/a/'+a.id+'/tag-members',{action:'add',user_ids:['4'],expected_tag_version:a.tag_version})
 const body={name:'changed',start_at:now+20000,cutoff_at:now+100000,user_ids:['2','3'],expected_schedule_version:0}
 assert.equal((await req('/a/'+a.id+'/schedule',body,'PATCH')).status,200);assert.equal((await req('/a/'+a.id+'/schedule',body,'PATCH')).status,409)
 assert.deepEqual(schedule.plannedIds(a.id),['2','3']);assert.deepEqual(db.prepare('SELECT user_id FROM growth_activity_tags WHERE activity_id=? ORDER BY user_id').all(a.id).map(r=>r.user_id),['2','3','4']);assert.equal(count('growth_activity_members',a.id),0)
 const work=(await req('/api/workbench')).body;assert.equal(work.summary.activities_scheduled,1);assert.ok(work.tasks.some(t=>t.target===a.id&&t.type==='activity_start'&&t.due_at===body.start_at));assert.equal((await req('/api/workbench',undefined,'GET','b')).body.summary.activities_scheduled,0)
 assert.equal((await req('/o/compare',{kind:'activity',ids:[a.id,db.prepare("SELECT id FROM growth_activities WHERE schedule_state='active' LIMIT 1").get().id],start:now-100,end:now})).status,409)
 await req('/a/'+a.id,{archived:true},'PATCH')
})
test('an in-flight start cannot freeze a plan that was rescheduled during source retrieval',async()=>{
 now=base+60000;const a=await create(now+1000,['4']);now+=2000
 let release,notify;gate=new Promise(r=>release=r);const ready=new Promise(r=>notify=r);entered=notify
 const freezing=schedule.ensureStarted(a.id,{force:true});await ready
 const next=now+5000;assert.equal((await req('/a/'+a.id+'/schedule',{start_at:next,cutoff_at:next+86400000,expected_schedule_version:0},'PATCH')).status,200)
 release();await freezing;gate=null;assert.equal(count('growth_activity_members',a.id),0);assert.equal(db.prepare('SELECT start_at FROM growth_activities WHERE id=?').get(a.id).start_at,next)
 now=next+1000;await schedule.ensureStarted(a.id,{force:true});assert.equal(count('growth_activity_members',a.id),1);assert.equal((await req('/a/'+a.id+'/schedule')).body.history.filter(h=>h.action==='started').length,1)
})
test('invalid or elapsed scheduling windows are rejected without creating an immediate activity',async()=>{
 now=base+100000;const before=db.prepare('SELECT COUNT(*) AS n FROM growth_activities').get().n
 for(const start of [now-1,'tomorrow',now+2*86400000])assert.equal((await req('/a',{name:'invalid',start_at:start,cutoff_at:now+86400000,user_ids:['4']})).status,400)
 const original=remote.query;remote.query=async(...args)=>{const rows=await original(...args);now+=1000;return rows}
 try{assert.equal((await req('/a',{name:'elapsed',start_at:now+500,cutoff_at:now+86400000,user_ids:['4']})).status,400)}finally{remote.query=original}
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activities').get().n,before)
})
test('backfill accepts an ended historical window and freezes activation baseline at its actual start',async()=>{
 now=base+100000;firsts.set('3',base+1000)
 const start=base,end=base+50000
 const r=await req('/a',{name:'历史补录',start_mode:'backfill',start_at:start,cutoff_at:end,user_ids:['1','2','3','4']})
 assert.equal(r.status,201)
 const a=r.body.activity
 assert.equal(a.schedule_state,'active');assert.equal(a.start_at,start);assert.equal(a.cutoff_at,end)
 const rows=db.prepare('SELECT * FROM growth_activity_members WHERE activity_id=? ORDER BY user_id').all(a.id)
 assert.deepEqual(rows.map(r=>r.baseline_first_at),[base-1000,null,null,null])
 assert.equal(a.import_report.prior,1);assert.equal(a.import_report.eligible,3)
 for(const [start_at,cutoff_at] of [[now+1000,now+2000],[start,start],[null,end]]){
  assert.equal((await req('/a',{name:'invalid backfill',start_mode:'backfill',start_at,cutoff_at,user_ids:['1']})).status,400)
 }
})
test('active start-time correction recomputes baseline with fixed members and revision checks',async()=>{
 now=base+200000;firsts.set('3',base+1000)
 const r=await req('/a',{name:'correction',start_mode:'backfill',start_at:base+2000,cutoff_at:now+100000,user_ids:['1','2','3','4']})
 assert.equal(r.status,201);const a=r.body.activity
 const update=(start_at,version=0,owner='a')=>req('/a/'+a.id+'/start-time',{start_at,expected_schedule_version:version},'PATCH',owner)
 assert.equal((await update(base,0,'other')).status,404)
 assert.equal((await update(now+1)).status,400)
 assert.equal((await update(a.cutoff_at)).status,400)
 assert.equal((await update(base,9)).status,409)
 const edited=await update(base);assert.equal(edited.status,200);assert.equal(edited.body.activity.start_at,base);assert.equal(edited.body.activity.schedule_version,1);assert.equal(edited.body.activity.import_report.prior,1);assert.equal(edited.body.activity.import_report.eligible,3)
 assert.deepEqual(db.prepare('SELECT baseline_first_at FROM growth_activity_members WHERE activity_id=? ORDER BY user_id').all(a.id).map(r=>r.baseline_first_at),[base-1000,null,null,null]);assert.equal(count('growth_activity_members',a.id),4)
 assert.equal((await update(base+1000)).status,409)
 broken=true;assert.equal((await update(base+1000,1)).status,500);broken=false;assert.equal(db.prepare('SELECT start_at FROM growth_activities WHERE id=?').get(a.id).start_at,base)
 const history=await req('/a/'+a.id+'/schedule');assert.equal(history.body.history[0].action,'start_time_updated')
 await req('/a/'+a.id,{archived:true},'PATCH');assert.equal((await update(base+1000,1)).status,409)
 await req('/a/'+a.id,{archived:false},'PATCH');db.prepare('UPDATE growth_activities SET settled_at=? WHERE id=?').run(now,a.id);assert.equal((await update(base+1000,1)).status,409)
})
