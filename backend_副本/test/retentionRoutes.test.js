process.env.DB_PATH=':memory:'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
const DAY=86400000,start=Date.parse('2026-09-07T00:00:00+07:00'),end=start+DAY,asOf=start+40*DAY
let truncated=false
require('../src/analytics/loadUsers').loadNormalizedUsers=()=>({users:[{id:'user:1',events:[{type:'chip',t:start+1000},{type:'chip',t:start+30*DAY+1000}]},{id:'user:2',events:[{type:'chip',t:start+2000}]}],truncated,candidate_count:2})
db.prepare('INSERT INTO events_meta(key,value) VALUES(?,?)').run('as_of',JSON.stringify(new Date(asOf).toISOString()))
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/api/metrics',require('../src/routes/metrics'));app.use('/api/drill',require('../src/routes/drill'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path,body,owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'Content-Type':'application/json','x-owner':owner},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
test('SQLite retention D30 summary and lazy paginated lists agree and enforce cache ownership',async()=>{
 const r=await request('/api/metrics/retention',{start,end,maxDailyPeriods:30});assert.equal(r.status,200);const co=r.body.curve_groups.daily[0];assert.equal(co.periods[30].retention_rate,.5)
 const params={cache_id:r.body.drill.cache_id,list_key:co.periods[30].list_prefix+':unobserved'},list=await request('/api/drill/users',{kind:'cached_list',params,limit:1});assert.equal(list.status,200);assert.equal(list.body.total,1);assert.equal(list.body.rows[0].id,'user:2')
 assert.equal((await request('/api/drill/users',{kind:'cached_list',params},'b')).status,404)
 assert.equal((await request('/api/drill/users',{kind:'cached_list',params:{...params,list_key:'bad'}})).status,400)
 assert.equal((await request('/api/drill/users',{kind:'cached_list',params:{...params,cache_id:'expired'}})).status,409)
})
test('invalid horizon and truncated candidates cannot become complete retention metrics',async()=>{
 assert.equal((await request('/api/metrics/retention',{start,end,maxDailyPeriods:31})).status,400)
 truncated=true;try{assert.equal((await request('/api/metrics/retention',{start,end,maxDailyPeriods:30})).status,422)}finally{truncated=false}
})
