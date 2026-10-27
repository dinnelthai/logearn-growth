process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const now=Date.now(),start=now-3*86400000,end=now-2*86400000;let failTrade=false,observedAt=now
remote.status=async()=>({snapshot_id:'p',snapshot_cutoff:new Date(now).toISOString(),as_of:observedAt==null?null:new Date(observedAt).toISOString()});remote.cached=async(_k,fn)=>fn()
remote.query=async(sql,p)=>{
 if(sql.includes('trade_groups')){if(failTrade)throw Error('trade offline');return [{account_id:'1',chain:3,transaction_hash:'x',trade_value:25,transaction_time:new Date(start+10).toISOString(),valid:true}]}
 if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'before',user_id:'1',t:start-1},{event_id:'after',user_id:'1',t:start+1},{event_id:'again',user_id:'1',t:start+2},{event_id:'late',user_id:'2',t:end}]
 if(sql.includes('first_analysis_at'))return [{user_id:'1',first_analysis_at:start-1,last_active_at:start+1,analysis_days:1},{user_id:'2',first_analysis_at:end,last_active_at:start+1}]
 return [{account_id:'1'},{account_id:'2'}]
}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/activities',require('../src/routes/activities'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path,body){const r=await fetch('http://127.0.0.1:'+server.address().port+'/activities'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
function activity(id,goal){db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report,goal) VALUES(?,?,?,?,?,?,?,?)').run(id,'a',id,start,end,'p','{}',goal);for(const user of ['1','2'])db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run(id,user,user==='1'?start-1:null)}
test('existing activities migrate idempotently and keep first-analysis defaults',()=>{
 const old=new DatabaseSync(':memory:');old.exec('CREATE TABLE growth_activities(id TEXT)');const {upgradeActivities}=require('../src/db/upgradeActivities');upgradeActivities(old);upgradeActivities(old);old.exec("INSERT INTO growth_activities(id) VALUES('old')");assert.equal(old.prepare('SELECT goal FROM growth_activities').get().goal,'activation');old.close()
})
test('all participant usage includes prior analysts while first-activation denominator remains fixed',async()=>{
 activity('engagement','engagement');const r=await request('/engagement/metrics?status=all')
 assert.equal(r.status,200);assert.equal(r.body.activity.goal,'engagement');assert.equal(r.body.summary.eligible,1);assert.equal(r.body.summary.completed,0)
 assert.equal(r.body.performance.total.users,2);assert.equal(r.body.performance.total.analysis_users,1);assert.equal(r.body.performance.total.analysis_events,2);assert.equal(r.body.performance.total.returning_analysis_users,1);assert.equal(r.body.performance.total.volume_usd,25)
 assert.equal((await request('/engagement/metrics?status=traded')).body.total,1)
 assert.equal((await request('/engagement/metrics?status=no_analysis')).body.total,1)
 assert.equal((await request('/engagement/metrics?status=analysis_no_trade')).body.total,0)
})
test('source failures do not freeze unknown trade results, successful settlement freezes every scope',async()=>{
 activity('trade','trade');failTrade=true;const unavailable=await request('/trade/metrics?status=all');assert.equal(unavailable.status,200);assert.equal(unavailable.body.performance.total.volume_usd,null)
 assert.equal((await request('/trade/metrics?status=traded')).status,503);assert.equal((await request('/trade/settle',{})).status,503);assert.equal(db.prepare('SELECT settled_result FROM growth_activities WHERE id=?').get('trade').settled_result,null)
 failTrade=false;assert.equal((await request('/trade/settle',{})).status,200);const before=(await request('/trade/metrics?status=all')).body;failTrade=true;const after=(await request('/trade/metrics?status=all')).body;assert.deepEqual(after.performance,before.performance);assert.equal(after.performance_errors.trade,null)
})
test('unknown goals are rejected before reading source or creating activities',async()=>{assert.equal((await request('',{name:'bad',goal:'other',cutoff_at:now+86400000,user_ids:['1']})).status,400)})

test('settlement waits for the observed cutoff and leaves the activity unfrozen on lag or unknown progress',async()=>{
 activity('lagged','engagement');failTrade=false
 try{
  for(const observed of [end-12*3600000,null]){
   observedAt=observed
   const r=await request('/lagged/settle',{});assert.equal(r.status,503);assert.match(r.body.error,/观测截至/)
   const saved=db.prepare('SELECT settled_at,settled_result FROM growth_activities WHERE id=?').get('lagged')
   assert.equal(saved.settled_at,null);assert.equal(saved.settled_result,null)
  }
  observedAt=end
  assert.equal((await request('/lagged/settle',{})).status,200)
  assert.ok(db.prepare('SELECT settled_result FROM growth_activities WHERE id=?').get('lagged').settled_result)
  observedAt=end-12*3600000
  assert.equal((await request('/lagged/settle',{})).status,200)
 }finally{observedAt=now;failTrade=false}
})
