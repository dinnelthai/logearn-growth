process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
for(let i=1;i<=61;i++){const id='k'+String(i).padStart(2,'0');db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,assignee,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,'a','KOL '+i,'X',i%2?'one':'two',i,i);db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run(id,String(i))}
db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('foreign','b','Private','X',1,1)
const start=Date.now()-86400000,end=Date.now();let analysisDown=false,accountDown=false,snapshots=0
remote.status=async()=>{snapshots++;return {snapshot_id:'shared',snapshot_cutoff:new Date(end).toISOString()}};remote.snapshot=async id=>({snapshot_id:id,snapshot_cutoff:new Date(end).toISOString()});remote.cached=async(_key,fn)=>fn()
remote.query=async(sql,p)=>{if(sql.includes('SELECT account_id::text')){if(accountDown)throw Error('account down');return p[1].map(account_id=>({account_id}))}if(sql.includes('SELECT event_id,SUBSTRING')){if(analysisDown)throw Error('analysis down');return p[3].flatMap(key=>{const id=key.slice(5);return Array.from({length:62-Number(id)},(_,i)=>({event_id:id+':'+i,user_id:id,t:start+i+1}))})}return []}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/k',require('../src/routes/crm'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function rank(body={},owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/k/ranking',{method:'POST',headers:{'Content-Type':'application/json','x-owner':owner},body:JSON.stringify({start,end,limit:10,scope:'tagged',...body})});return {status:r.status,body:await r.json()}}
test('business ranking covers all matches before pagination and keeps one snapshot across pages',async()=>{
 const r=await rank({sort:'analysis_events'});assert.equal(r.status,200);assert.equal(r.body.total,61);assert.equal(r.body.kols[0].id,'k01');assert.equal(r.body.kols[0].metric.total.analysis_events,61);assert.equal(r.body.kols.length,10)
 const before=snapshots,next=await rank({sort:'analysis_events',offset:10,snapshot_id:r.body.snapshot_id,list_version:r.body.list_version});assert.equal(snapshots,before);assert.equal(next.body.kols[0].id,'k11')
 const other=await rank({},'b');assert.equal(other.body.total,1);assert.equal(other.body.kols[0].id,'foreign')
 const restricted=await rank({sort:'analysis_events',assignee:'two'});assert.equal(restricted.body.total,30);assert.equal(restricted.body.kols[0].id,'k02')
 db.prepare('UPDATE crm_kols SET updated_at=999 WHERE id=?').run('k61');assert.equal((await rank({snapshot_id:r.body.snapshot_id,list_version:r.body.list_version})).status,409)
})
test('unknown source values cannot silently determine a metric rank or attention filter',async()=>{
 analysisDown=true;assert.equal((await rank({sort:'analysis_events'})).status,503);assert.equal((await rank({view:'unobserved'})).status,503)
 const browse=await rank({sort:'updated_at'});assert.equal(browse.status,200);assert.equal(browse.body.kols[0].metric.total.analysis_events,null);analysisDown=false
 accountDown=true;assert.equal((await rank({sort:'updated_at'})).status,200);assert.equal((await rank({sort:'users'})).status,503);accountDown=false
 const own=await rank({scope:'own',sort:'analysis_events'});assert.equal(own.status,200);assert.equal(own.body.kols[0].metric.total,null)
})
test('threshold views compare all matching KOLs against an equally long prior period and keep unknowns out',async()=>{
 const original=remote.query
 remote.query=async(sql,p)=>{if(sql.includes('SELECT event_id,SUBSTRING')){if(analysisDown)throw Error('analysis down');const prior=p[1]<start;return p[3].flatMap(key=>{const id=key.slice(5),count=prior?10:Number(id)===61?1:10;return Array.from({length:count},(_,i)=>({event_id:(prior?'p':'c')+id+':'+i,user_id:id,t:p[1]+i+1}))})}return original(sql,p)}
 try{
  const r=await rank({view:'declining',decline_pct:50,include_trend:true});assert.equal(r.status,200);assert.equal(r.body.total,1);assert.equal(r.body.kols[0].id,'k61');assert.equal(r.body.kols[0].metric.trend.analysis_change_rate,-0.9)
  const low=await rank({view:'low_usage',low_events:2});assert.equal(low.body.total,1);assert.equal(low.body.kols[0].id,'k61')
  assert.equal((await rank({view:'declining',decline_pct:101})).status,400)
  analysisDown=true;assert.equal((await rank({view:'declining'})).status,503);analysisDown=false
 }finally{remote.query=original;analysisDown=false}
})
