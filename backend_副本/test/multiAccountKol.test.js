process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express'),db=require('../src/db/connection'),remote=require('../src/data/hologres'),{ownAccounts,attachAccounts,invitedAccounts}=require('../src/analytics/kolAccounts'),{upgradeKolAccounts}=require('../src/db/upgradeKolAccounts')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const now=Date.now(),start=now-86400000,end=now+1,bound=now-10000,created='2020-01-01T00:00:00Z';let broken=false,gate=null,entered=null
remote.status=async()=>({snapshot_id:'s',snapshot_cutoff:new Date(now).toISOString(),as_of:new Date(now).toISOString()});remote.cached=async(_k,fn)=>fn()
remote.query=async(sql,p)=>{
 if(sql.includes('ANY($1::text[])')){if(gate){entered();await gate}return p[0].filter(id=>['1','2','3','4','5'].includes(id)).map(account_id=>({account_id}))}
 if(sql.includes('user_invitation_relation'))return [['2','1'],['3','1'],['4','2']].map(([user_id,level1_user_id])=>({id:'rel'+user_id,user_id,level1_user_id,is_valid:true,invitation_time:new Date(bound).toISOString(),invitation_order:String(bound*1000+500)}))
 if(sql.includes('SELECT event_id,SUBSTRING')){if(broken)throw Error('analysis offline');return ['1','2','3','4'].flatMap(user_id=>[{event_id:'before'+user_id,user_id,t:bound},{event_id:'after'+user_id,user_id,t:bound+1}])}
 if(sql.includes('trade_groups'))return ['1','2','3','4'].map(account_id=>({account_id,chain:'eth',transaction_hash:'t'+account_id,transaction_time:new Date(bound+1).toISOString(),transaction_order:String((bound+1)*1000),trade_value:Number(account_id)*10,valid:true}))
 if(sql.includes('SELECT account_id::text AS account_id')&&sql.includes('ANY($2'))return p[1].filter(id=>id!=='5').map(account_id=>({account_id,created_at:created}))
 return ['1','2','3','4','5'].map(account_id=>({account_id,created_at:created}))
}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/crm',require('../src/routes/crm'));app.use('/compare',require('../src/routes/operationsComparison'));app.use('/activities',require('../src/routes/activities'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function req(url,body,method=body===undefined?'GET':'POST',owner='a'){const response=await fetch('http://127.0.0.1:'+server.address().port+url,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()}}
test('multiple accounts validate together, isolate owners, support secondary-account search and retain all links during metadata edits',async()=>{
 const c=await req('/crm',{name:'Multi',platform:'X',account_ids:'user:1\n2,1',user_ids:['2','3']});assert.equal(c.status,201);const k=c.body.kol;assert.deepEqual(k.account_ids,['1','2']);assert.equal(k.account_id,'1')
 assert.equal((await req('/crm',{name:'Collision',platform:'X',account_ids:['3','2']})).status,409)
 assert.equal((await req('/crm',{name:'Unknown',platform:'X',account_ids:['3','99']})).status,400);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM crm_kols WHERE name=?').get('Unknown').n,0)
 assert.equal((await req('/crm',{name:'Invalid',platform:'X',account_ids:[1]})).status,400)
 assert.equal((await req('/crm',{name:'Limit',platform:'X',account_ids:Array.from({length:21},(_,i)=>String(i+100))})).status,400)
 assert.equal((await req('/crm/'+k.id,undefined,'GET','b')).status,404)
 assert.equal((await req('/crm',{name:'Other owner',platform:'X',account_ids:['1','2']},undefined,'b')).status,201)
 assert.equal((await req('/crm?q=2')).body.kols[0].id,k.id)
 const edited=await req('/crm/'+k.id,{notes:'metadata',expected_updated_at:k.updated_at},'PATCH');assert.deepEqual(edited.body.kol.account_ids,['1','2'])
 assert.equal((await req('/crm/'+k.id,{account_ids:['2'],expected_updated_at:k.updated_at},'PATCH')).status,409)
 assert.equal((await req('/crm/'+k.id,{account_id:null,expected_updated_at:edited.body.kol.updated_at},'PATCH')).status,409)
 assert.equal((await req('/crm/'+k.id+'/members',{action:'remove',user_id:'2',expected_updated_at:edited.body.kol.updated_at},'PATCH')).status,400)
 const tags=require('../src/analytics/userTags').userTags('a',{tagIds:['kol:'+k.id]});assert.deepEqual(new Set(tags[0].user_ids),new Set(['user:1','user:2','user:3']));assert.equal(tags[0].users,3)
 const imported=await req('/activities/import-kol',{kol_id:k.id,scope:'own'});assert.deepEqual(imported.body.user_ids,['1','2']);assert.equal((await req('/activities/import-kol',{kol_id:k.id,scope:'own'},undefined,'b')).status,404)
 const invites=await req('/activities/import-kol',{kol_id:k.id,scope:'invited'});assert.deepEqual(new Set(invites.body.user_ids),new Set(['3','4']))
 const ranked=await req('/crm/ranking',{start,end,scope:'own',sort:'analysis_events'});assert.equal(ranked.body.kols[0].metric.total.analysis_events,4);assert.deepEqual(ranked.body.kols[0].account_ids,['1','2'])
 const other=(await req('/crm',{name:'Second',platform:'X',account_ids:['4']})).body.kol
 const compare=await req('/compare/compare',{kind:'kol',scope:'own',ids:[k.id,other.id],start,end});assert.equal(compare.status,200);assert.equal(compare.body.rows.find(r=>r.id===k.id).total.users,2)
 const removed=await req('/crm/'+k.id,{account_ids:['2'],expected_updated_at:edited.body.kol.updated_at},'PATCH');assert.equal(removed.status,200);assert.equal(removed.body.kol.account_id,'2');assert.deepEqual(removed.body.kol.account_ids,['2'])
 assert.equal((await req('/crm',{name:'Freed',platform:'X',account_ids:['1']})).status,201)
 const cleared=await req('/crm/'+k.id,{account_ids:[],expected_updated_at:removed.body.kol.updated_at},'PATCH');assert.deepEqual(cleared.body.kol.account_ids,[]);upgradeKolAccounts(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM crm_kol_accounts WHERE kol_id=?').get(k.id).n,0)
 const remaining=require('../src/analytics/userTags').userTags('a',{tagIds:['kol:'+k.id]})[0];assert.deepEqual(new Set(remaining.user_ids),new Set(['user:2','user:3']),'manual tags survive unlinking own accounts')
})
test('multi-account metrics merge own facts, expose rows, exclude all own IDs from invitations and tagged-only scope',async()=>{
 const {kolMetrics}=require('../src/data/kolMetrics'),profiles=[{id:'metrics',account_ids:['1','2'],user_ids:['2','3']}]
 const m=(await kolMetrics(profiles,{start,end})).metrics[0];assert.equal(m.own.total.users,2);assert.equal(m.own.total.analysis_events,4);assert.equal(m.own.total.volume_usd,30);assert.equal(m.own.rows.length,2);assert.equal(m.tagged.total.users,3);assert.equal(m.tagged_excluding_own.total.users,1);assert.deepEqual(m.tagged_excluding_own.rows.map(r=>r.user_id),['3'])
 assert.deepEqual(new Set(m.invited.rows.map(r=>r.user_id)),new Set(['3','4']));assert.equal(m.invited.total.analysis_events,2,'before-binding events remain excluded at microsecond precision');assert.equal(m.invited.new_bindings,2)
 broken=true;const unknown=(await kolMetrics(profiles,{start,end})).metrics[0];assert.equal(unknown.own.total.analysis_events,null);assert.equal(unknown.own.total.volume_usd,30);broken=false
 const partial=(await kolMetrics([{id:'partial',account_ids:['1','5']}],{start,end})).metrics[0];assert.equal(partial.own.total.users,1);assert.equal(partial.own.unmatched_users,1)
 const overlaps=invitedAccounts({account_ids:['1','2']},{children:{1:[{id:'3',bound_at:20,bound_order:20001},{id:'2',bound_at:1}],2:[{id:'3',bound_at:20,bound_order:20000}]}},30);assert.deepEqual(overlaps,[{id:'3',bound_at:20,bound_order:20000}])
})
test('legacy single accounts migrate idempotently and database ownership constraints cover every account',()=>{
 db.exec('DROP TRIGGER legacy_kol_account_insert');db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('legacy','legacy-owner','Legacy','X','88',1,1)
 upgradeKolAccounts(db);upgradeKolAccounts(db);assert.deepEqual(ownAccounts(attachAccounts(db,[db.prepare('SELECT * FROM crm_kols WHERE id=?').get('legacy')])[0]),['88'])
 assert.throws(()=>db.prepare('INSERT INTO crm_kol_accounts VALUES(?,?,?,?,?)').run('legacy','wrong-owner','89',1,1))
})
test('a concurrent account link is rechecked after remote validation before writing either profile',async()=>{
 let release;gate=new Promise(resolve=>release=resolve);let notify;const ready=new Promise(resolve=>notify=resolve);entered=notify
 const pending=req('/crm',{name:'Delayed',platform:'X',account_ids:['5']});await ready
 db.prepare('INSERT INTO crm_kols(id,owner_id,name,platform,account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('winner','a','Winner','X',null,1,1);db.prepare('INSERT INTO crm_kol_accounts VALUES(?,?,?,?,?)').run('winner','a','5',0,1)
 gate=null;release();assert.equal((await pending).status,409);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM crm_kols WHERE name=?').get('Delayed').n,0)
})
