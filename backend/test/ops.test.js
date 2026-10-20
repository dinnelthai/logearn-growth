process.env.DB_PATH=':memory:';process.env.OPS_TOKEN_ENCRYPTION_KEY='11'.repeat(32)
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express'),db=require('../src/db/connection')
db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'))
const {normalize}=require('../src/ops/catalog'),vault=require('../src/ops/store'),client=require('../src/ops/client')
db.prepare("INSERT INTO ops_batches(id,owner_id,operation,state,created_at,expires_at) VALUES('restart','a','grant_quota','running',1,9999999999999)").run()
db.prepare("INSERT INTO ops_batch_rows VALUES('restart',1,'{}','running',NULL),('restart',2,'{}','pending',NULL)").run()
const app=express();app.use(express.json());app.use('/ops',(req,res,next)=>{if(!req.get('x-owner'))return res.status(401).json({error:'未登录'});req.user={user_id:req.get('x-owner')};next()},require('../src/routes/ops'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0)
after(()=>{server.close();db.close()})
async function request(url,body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/ops'+url,{method,headers:{'content-type':'application/json',...(owner?{'x-owner':owner}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
const prepare=(rows=[{userId:'123',quotaAmount:2}],operation='grant_quota')=>request('/preview',{operation,rows})
async function finished(id){for(let i=0;i<50;i++){const r=await request('/batches/'+id);if(!['running','stopping'].includes(r.body.batch.state))return r.body.batch;await new Promise(r=>setTimeout(r,5))}throw Error('batch did not finish')}
test('operation validation enforces amounts, identities, level bounds, rebate groups and unknown fields',()=>{
 assert.equal(normalize('vip',{provider:'metamask',subject:'0x'+'A'.repeat(40),effectiveDays:1}).subject,'0x'+'a'.repeat(40))
 for(const bad of [{quotaAmount:0},{quotaAmount:-1},{quotaAmount:true},{quotaAmount:1.2}])assert.throws(()=>normalize('grant_quota',{userId:'1',...bad}))
 assert.throws(()=>normalize('trading',{userId:'1',name:'n',tradingLevel:1,feeRebateRatioLevel1:.1}),/三级/)
 assert.throws(()=>normalize('trading',{userId:'1',name:'n',tradingLevel:1,feeRebateRatioLevel1:.8,feeRebateRatioLevel2:.2,feeRebateRatioLevel3:0}),/90/)
 assert.throws(()=>normalize('sales',{userId:'9007199254740993'}),/安全整数/)
 assert.throws(()=>normalize('platform',{userId:'1',url:'https://evil.test'}),/未知参数/)
 assert.throws(()=>normalize('relation',{newInviterLoginAddress:'0x'+'a'.repeat(40),inviteeLoginAddress:'0x'+'A'.repeat(40)}),/不能相同/)
 assert.throws(()=>normalize('vip',{provider:'phantom',subject:'0x'+'a'.repeat(40),effectiveDays:1}),/Solana/)
})
test('tokens are encrypted, owner isolated, never returned and require auth',async()=>{
 assert.equal((await request('/config',undefined,'GET',null)).status,401)
 await request('/token',{token:'test-private-token'},'PUT')
 assert.equal(vault.token('a'),'test-private-token');assert.throws(()=>vault.token('b'),/配置/)
 const stored=db.prepare('SELECT * FROM ops_credentials').get();assert(!JSON.stringify(stored).includes('test-private-token'))
 assert(!JSON.stringify((await request('/config')).body).includes('test-private-token'))
 assert.equal((await request('/config',undefined,'GET','b')).body.credential.configured,false)
})
test('previews freeze parameters, deduplicate exact targets, reject conflicts and isolate owners',async()=>{
 const rows=[{userId:'1',quotaAmount:2},{userId:'1',quotaAmount:2}],r=await prepare(rows);assert.equal(r.body.duplicates,1);assert.equal(r.body.batch.rows.length,1)
 assert.equal((await request('/batches/'+r.body.batch.id,undefined,'GET','b')).status,404)
 assert.equal((await prepare([{userId:'1',quotaAmount:1},{userId:'1',quotaAmount:2}])).status,400)
 assert.equal((await prepare(Array.from({length:101},(_,i)=>({userId:String(i+1),quotaAmount:1})))).status,400)
 db.prepare('UPDATE ops_batches SET expires_at=1 WHERE id=?').run(r.body.batch.id)
 assert.equal((await request('/batches/'+r.body.batch.id+'/execute',{confirm:true})).status,409)
})
test('execute requires confirmation, never repeats a completed batch and logs each result',async()=>{
 const saved=client.call,calls=[];client.call=async(op,payload,token)=>{calls.push({op,payload,token});return {state:'unknown',http_status:200,message:'待核实'}}
 try{const r=await prepare([{userId:'71',quotaAmount:2},{userId:'72',quotaAmount:2}]),id=r.body.batch.id
 assert.equal((await request('/batches/'+id+'/execute',{})).status,400)
 assert.equal((await request('/batches/'+id+'/execute',{confirm:true,rows:[{userId:'evil'}]})).status,202)
 await request('/batches/'+id+'/execute',{confirm:true});const b=await finished(id);assert.equal(calls.length,2);assert.equal(calls[0].payload.userId,'71');assert(b.rows.every(r=>r.state==='unknown'))
 await request('/batches/'+id+'/execute',{confirm:true});assert.equal(calls.length,2)
 }finally{client.call=saved}
})
test('authorization failure stops remaining rows and cancellation does not send pending writes',async()=>{
 const saved=client.call;let count=0;client.call=async()=>{count++;return {state:'failed',http_status:401}}
 try{const r=await prepare([{userId:'81',quotaAmount:2},{userId:'82',quotaAmount:2}]),id=r.body.batch.id;await request('/batches/'+id+'/execute',{confirm:true});const b=await finished(id);assert.equal(count,1);assert.deepEqual(b.rows.map(r=>r.state),['failed','cancelled'])
 const p=await prepare();await request('/batches/'+p.body.batch.id+'/cancel',{});await request('/batches/'+p.body.batch.id+'/execute',{confirm:true});assert.equal(count,1)
 }finally{client.call=saved}
})
test('restart marks in-flight results unknown and does not replay pending rows',async()=>{
 const b=(await request('/batches/restart')).body.batch;assert.equal(b.state,'interrupted');assert.deepEqual(b.rows.map(r=>r.state),['unknown','cancelled'])
})
test('HTTP success stays unknown, coupon identities use subjects and secret response fields are redacted',async()=>{
 let sent;const r=await client.call('coupon',{provider:'email',subject:'a@example.test',templateId:1},'hidden-token',async(url,options)=>{sent={url:String(url),options};return new Response(JSON.stringify({code:0,token:'hidden-token',message:'中文 hidden-token'}),{status:200})})
 assert.equal(r.state,'unknown');assert(!JSON.stringify(r).includes('hidden-token'));assert.deepEqual(JSON.parse(sent.options.body).subjects,['a@example.test']);assert.equal(JSON.parse(sent.options.body).subject,undefined);assert.equal(sent.options.redirect,'error');assert(sent.url.startsWith('https://logearn.com/logearn/'))
 const network=await client.call('platform',{userId:1},'t',async()=>{throw Error('network t')});assert.equal(network.state,'unknown');assert(!JSON.stringify(network).includes('network t'))
})
test('stopping a running batch lets the sent request finish and cancels unsent rows',async()=>{
 const saved=client.call;let release,calls=0
 client.call=async()=>{calls++;return new Promise(r=>release=()=>r({state:'unknown',http_status:200}))}
 try{const p=await prepare([{userId:'91',quotaAmount:1},{userId:'92',quotaAmount:1}]),id=p.body.batch.id
 await request('/batches/'+id+'/execute',{confirm:true});for(let i=0;i<20&&!release;i++)await new Promise(r=>setTimeout(r,5))
 assert(release);const cancelled=await request('/batches/'+id+'/cancel',{});assert.equal(cancelled.body.batch.state,'stopping');release()
 const batch=await finished(id);assert.equal(batch.state,'cancelled');assert.equal(calls,1);assert.deepEqual(batch.rows.map(r=>r.state),['unknown','cancelled'])
 }finally{client.call=saved}
})
test('HTTP 200 with a business halt signal cancels all unsent batch rows',async()=>{
 const saved=client.call;let calls=0;client.call=async()=>{calls++;return {state:'failed',http_status:200,halt_batch:true,reason:'token_invalid'}}
 try{const p=await prepare([{userId:'101',quotaAmount:1},{userId:'102',quotaAmount:1}]),id=p.body.batch.id;await request('/batches/'+id+'/execute',{confirm:true});const b=await finished(id);assert.equal(calls,1);assert.deepEqual(b.rows.map(r=>r.state),['failed','cancelled'])}finally{client.call=saved}
})
