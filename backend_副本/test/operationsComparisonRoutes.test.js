process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
for(const [id,owner]of [['k1','a'],['k2','a'],['k3','b']]){db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,id,'X',1,1);db.prepare('INSERT INTO crm_kol_members VALUES(?,?)').run(id,'1')}
let snapshots=0,queries=0;remote.status=async()=>{snapshots++;return {snapshot_id:'s',snapshot_cutoff:new Date().toISOString()}};remote.query=async sql=>{queries++;return sql.includes('SELECT account_id::text')?[{account_id:'1'}]:[]}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:'a'};next()});app.use('/o',require('../src/routes/operationsComparison'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(body){const r=await fetch('http://127.0.0.1:'+server.address().port+'/o/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
test('owner validation precedes remote access and all groups share one facts query',async()=>{
 const body={kind:'kol',ids:['k1','k3'],start:Date.now()-86400000,end:Date.now()}
 assert.equal((await request(body)).status,404);assert.equal(snapshots,0);assert.equal(queries,0)
 const r=await request({...body,ids:['k1','k2']});assert.equal(r.status,200);assert.equal(snapshots,1);assert.equal(queries,3);assert.equal(r.body.union.users,1);assert.equal(r.body.overlap_memberships,1);assert.equal(r.body.rows.length,2)
 assert.equal((await request({...body,ids:['k1','k1']})).status,400)
})
