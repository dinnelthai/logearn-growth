process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs'),path=require('node:path'),db=require('../src/db/connection'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const end=Date.parse('2026-10-24T00:00:00+07:00'),s={snapshot_id:'same',as_of:new Date(end+3600000).toISOString(),snapshot_cutoff:new Date(end+3600000).toISOString()},seen=[]
remote.status=async()=>s;remote.snapshot=async id=>{if(id!=='same')throw Object.assign(Error('快照过期'),{status:409});return s};remote.cached=async(key,fn)=>fn();remote.query=async(sql,p)=>{seen.push(p);assert(sql.includes('COUNT(DISTINCT e.date)'));return [{user_key:'user:1',source:'x',current_days:'4',previous_days:'3'},{user_key:'user:2',source:'x',current_days:'3',previous_days:'5'}]}
const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={user_id:'a'};next()});app.use(require('../src/routes/remoteAnalytics'));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(url,body){const r=await fetch('http://127.0.0.1:'+server.address().port+url,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
test('summary and drill use identical snapshot, source and fixed window with bounded pagination',async()=>{
 const m=await request('/api/metrics/weekly-core?snapshot_id=same&source=x&end='+end);assert.equal(m.status,200);assert.equal(m.body.users,1);assert.equal(m.body.goal.progress,null);assert(!JSON.stringify(m.body).includes('user:1'))
 const drill=await request('/api/drill/users',{kind:'weekly_core',params:{snapshot_id:'same',end,source:'x',group:'core'},limit:1});assert.equal(drill.status,200);assert.equal(drill.body.total,1);assert.equal(drill.body.rows[0].id,'user:1');assert.equal(drill.body.rows[0].analysis_days,4);assert.equal(seen[0][0],s.snapshot_cutoff);assert.deepEqual(seen[0],seen[1])
 const filtered=await request('/api/drill/users',{kind:'weekly_core',params:{snapshot_id:'same',end,source:'x',group:'lost'},q:'nonexistent'});assert.equal(filtered.body.total,0)
 assert.equal((await request('/api/metrics/weekly-core?end=invalid')).status,400)
 assert.equal((await request('/api/drill/users',{kind:'weekly_core',params:{snapshot_id:'same',end,group:'constructor'}})).status,400)
 assert.equal((await request('/api/metrics/weekly-core?snapshot_id=expired')).status,409)
})
test('weekly core audience materializes all matching members and authoritative window',async()=>{
 const a=await request('/api/analytics/audience',{kind:'weekly_core',params:{snapshot_id:'same',end,source:'x',group:'core'},start:1,end:2,ids:['user:999']})
 assert.equal(a.status,200);assert.deepEqual(a.body.ids,['user:1']);assert.equal(a.body.start,end-7*86400000);assert.equal(a.body.end,end);assert.equal(a.body.snapshot_id,'same');assert.equal(a.body.source,'x')
 assert.equal((await request('/api/analytics/audience',{kind:'weekly_core',params:{snapshot_id:'same',end,group:'constructor'}})).status,400)
 assert.equal((await request('/api/analytics/audience',{kind:'weekly_core',params:{snapshot_id:'same',end,group:'core'},q:'absent'})).status,400)
 assert.equal((await request('/api/analytics/audience',{kind:'weekly_core',params:{snapshot_id:'expired',end,group:'core'}})).status,409)
})
