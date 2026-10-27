process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres'),{parseAmount,costTotals}=require('../src/analytics/collaborationCosts')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
for(const [id,owner]of [['k','a'],['other','b']])db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,id,'X',1,1)
const now=Date.now(),start=now-86400000,end=now+86400000
for(const [id,owner]of [['a1','a'],['a2','a'],['foreign','b']]){db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report) VALUES(?,?,?,?,?,?,?)').run(id,owner,id,start,end,'s','{}');db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run(id,'1',null)}
let broken=false,queries=0
remote.status=async()=>({snapshot_id:'s',snapshot_cutoff:new Date().toISOString(),as_of:new Date().toISOString()});remote.query=async sql=>{queries++;if(broken)throw Error('source failed');if(sql.includes('SELECT account_id::text'))return [{account_id:'1'}];if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'e',user_id:'1',t:start+10}];if(sql.includes('trade_groups'))return [{account_id:'1',transaction_hash:'hash',transaction_time:new Date(start+20).toISOString(),trade_value:20,chain:'eth',valid:true}];return []}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/k',require('../src/routes/crm'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function req(path,body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/k'+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('exact amounts preserve decimal precision and never combine different currencies or void entries',()=>{
 assert.equal(parseAmount('0.10','USD'),10);assert.equal(parseAmount('0.000001','USDT'),1);assert.throws(()=>parseAmount('1.001','USD'));assert.throws(()=>parseAmount('-1','USD'));assert.throws(()=>parseAmount('1e2','USD'))
 assert.deepEqual(costTotals([{currency:'USD',amount_minor:10,state:'actual'},{currency:'USD',amount_minor:20,state:'actual'},{currency:'USD',amount_minor:99,state:'void'},{currency:'CNY',amount_minor:500,state:'planned'}]),[{currency:'CNY',planned:'5.00',actual:'0.00'},{currency:'USD',planned:'0.00',actual:'0.30'}])
})
test('collaborations enforce ownership, revisions, currency ledgers, fixed rosters and immutable review versions',async()=>{
 const created=await req('/k/collaborations',{name:'Round1',start_at:start,end_at:end,status:'active',goal:'repeat use'});assert.equal(created.status,201);const c=created.body.collaboration,base='/k/collaborations/'+c.id
 assert.equal((await req(base,undefined,'GET','b')).status,404)
 assert.equal((await req(base+'/activities',{activity_id:'foreign',expected_revision:1})).status,404)
 assert.equal((await req(base+'/activities',{activity_id:'a1',expected_revision:1})).status,200)
 assert.equal((await req(base+'/activities',{activity_id:'a2',expected_revision:1})).status,409)
 await req(base+'/activities',{activity_id:'a2',expected_revision:2})
 assert.equal((await req('/k/activities/a1',undefined,'DELETE')).status,409)
 const cost=await req(base+'/costs',{category:'service',currency:'USD',amount:'12.30',state:'actual',description:'content fee',occurred_at:now,expected_revision:3});assert.equal(cost.status,201)
 assert.equal((await req(base+'/costs',{category:'service',currency:'CNY',amount:'30.00',state:'planned',description:'budget',occurred_at:now,expected_revision:4})).status,201)
 let d=(await req(base)).body;assert.equal(d.collaboration.revision,5);assert.deepEqual(d.cost_totals,[{currency:'CNY',planned:'30.00',actual:'0.00'},{currency:'USD',planned:'0.00',actual:'12.30'}])
 const live=await req(base+'/review');assert.equal(live.body.performance.union.users,1);assert.equal(live.body.performance.union.transactions,1);assert.equal(live.body.performance.overlap_memberships,1)
 broken=true;assert.equal((await req(base,{status:'completed',review:'done',expected_revision:5},'PATCH')).status,503);broken=false
 assert.equal((await req(base,{status:'completed',review:'done',expected_revision:5},'PATCH')).status,200)
 const before=queries;broken=true;const frozen=await req(base+'/review');assert.equal(frozen.body.frozen,true);assert.equal(queries,before);assert.equal(frozen.body.performance.union.volume_usd,20)
 assert.equal((await req(base+'/costs/'+cost.body.id,{currency:'USD',amount:'9.00',state:'actual',expected_revision:6},'PATCH')).status,409)
 await req(base,{status:'active',expected_revision:6},'PATCH');broken=false
 assert.equal((await req(base+'/costs/'+cost.body.id,{currency:'USD',amount:'12.30',state:'void',description:'correction',expected_revision:7},'PATCH')).status,200)
 await req(base,{status:'completed',review:'second review',expected_revision:8},'PATCH')
 d=(await req(base)).body;assert.equal(d.reports.length,2);assert.equal((await req(base+'/reports/1')).body.report.cost_totals.find(r=>r.currency==='USD').actual,'12.30');assert.equal(d.costs.find(r=>r.id===cost.body.id).state,'void');assert.equal((await req(base+'/reports/2')).body.report.cost_totals.some(r=>r.currency==='USD'),false)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_members WHERE activity_id=?').get('a1').n,1)
 assert.equal(db.prepare('SELECT stage FROM crm_kols WHERE id=?').get('k').stage,'待联系')
})
