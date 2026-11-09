const express=require('express'),{randomUUID}=require('node:crypto'),db=require('../db/connection'),vault=require('../ops/store'),client=require('../ops/client'),{catalog,normalize,fail}=require('../ops/catalog')
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next),owner=req=>String(req.user.user_id)
// The process cannot know whether an interrupted upstream write completed.
db.prepare("UPDATE ops_batch_rows SET state='unknown',result_json=? WHERE state='running'").run(JSON.stringify({message:'服务重启，执行结果待核实；未自动重试'}))
db.prepare("UPDATE ops_batch_rows SET state='cancelled' WHERE state='pending' AND batch_id IN (SELECT id FROM ops_batches WHERE state IN('running','stopping'))").run()
db.prepare("UPDATE ops_batches SET state='interrupted',finished_at=? WHERE state IN('running','stopping')").run(Date.now())
const active=new Set()
function get(id,user){const b=db.prepare('SELECT * FROM ops_batches WHERE id=? AND owner_id=?').get(String(id),user);if(!b)throw Object.assign(Error('OPS 任务不存在'),{status:404});return b}
function expose(b){return {...b,rows:db.prepare('SELECT * FROM ops_batch_rows WHERE batch_id=? ORDER BY row_no').all(b.id).map(({payload_json,result_json,...r})=>({...r,payload:JSON.parse(payload_json),result:result_json?JSON.parse(result_json):null}))}}
async function run(b,token){try{for(const row of db.prepare("SELECT * FROM ops_batch_rows WHERE batch_id=? AND state='pending' ORDER BY row_no").all(b.id)){
 if(get(b.id,b.owner_id).state==='stopping'){db.prepare("UPDATE ops_batch_rows SET state='cancelled' WHERE batch_id=? AND state='pending'").run(b.id);break}
 db.prepare("UPDATE ops_batch_rows SET state='running' WHERE batch_id=? AND row_no=? AND state='pending'").run(b.id,row.row_no)
 const result=await client.call(b.operation,JSON.parse(row.payload_json),token)
 db.prepare('UPDATE ops_batch_rows SET state=?,result_json=? WHERE batch_id=? AND row_no=?').run(result.state,JSON.stringify(result),b.id,row.row_no)
 // Stop on authorization errors; avoid flooding a service with an invalid credential.
 if((b.operation==='telegram_message'?result.http_status===401:[401,403].includes(result.http_status))||result.halt_batch){db.prepare("UPDATE ops_batch_rows SET state='cancelled',result_json=? WHERE batch_id=? AND state='pending'").run(JSON.stringify({message:'前项权限异常、限流或结果核对不一致，剩余项未发送'}),b.id);break}
 if(b.operation==='telegram_message')await new Promise(resolve=>setTimeout(resolve,50))
 }db.prepare("UPDATE ops_batches SET state=CASE WHEN state='stopping' THEN 'cancelled' ELSE 'finished' END,finished_at=? WHERE id=?").run(Date.now(),b.id)
 }catch{db.prepare("UPDATE ops_batch_rows SET state='unknown',result_json=? WHERE batch_id=? AND state='running'").run(JSON.stringify({message:'执行中断，请到源系统核实'}),b.id);db.prepare("UPDATE ops_batch_rows SET state='cancelled' WHERE batch_id=? AND state='pending'").run(b.id);db.prepare("UPDATE ops_batches SET state='interrupted',finished_at=? WHERE id=?").run(Date.now(),b.id)
 }finally{active.delete(b.owner_id)}}
router.get('/config',(req,res)=>res.json({credential:vault.credential(owner(req)),telegram_credential:vault.credential(owner(req)+':telegram'),smtp_credential:vault.credential(owner(req)+':smtp'),catalog}))
router.put('/smtp-config',wrap((req,res)=>{const c=require('../ops/mail').validate(req.body);vault.saveToken(owner(req)+':smtp',JSON.stringify(c));res.json({credential:vault.credential(owner(req)+':smtp')})}))
router.delete('/smtp-config',(req,res)=>{if(active.has(owner(req)))return res.status(409).json({error:'请等待当前任务结束后移除配置'});db.prepare('DELETE FROM ops_credentials WHERE owner_id=?').run(owner(req)+':smtp');res.json({credential:vault.credential(owner(req)+':smtp')})})
router.put('/telegram-token',wrap((req,res)=>{if(!/^\d+:[A-Za-z0-9_-]+$/.test(req.body.token||''))fail('Telegram Bot Token 格式无效');vault.saveToken(owner(req)+':telegram',req.body.token);res.json({credential:vault.credential(owner(req)+':telegram')})}))
router.delete('/telegram-token',(req,res)=>{if(active.has(owner(req)))return res.status(409).json({error:'请等待当前任务结束后移除 Token'});db.prepare('DELETE FROM ops_credentials WHERE owner_id=?').run(owner(req)+':telegram');res.json({credential:vault.credential(owner(req)+':telegram')})})
router.put('/token',wrap((req,res)=>{vault.saveToken(owner(req),req.body.token);res.json({credential:vault.credential(owner(req))})}))
router.delete('/token',(req,res)=>{if(active.has(owner(req)))return res.status(409).json({error:'请等待当前任务结束后移除 Token'});db.prepare('DELETE FROM ops_credentials WHERE owner_id=?').run(owner(req));res.json({credential:vault.credential(owner(req))})})
router.post('/preview',wrap(async(req,res)=>{
 const {operation,rows}=req.body;if(!Array.isArray(rows)||!rows.length||rows.length>100)fail('每批支持1–100条操作')
 const valid=[],errors=[],seen=new Map();let duplicates=0
 rows.forEach((row,i)=>{try{const payload=normalize(operation,row),target=String(payload.email??payload.telegramId??payload.userId??payload.subject??payload.loginAddress??payload.inviteeLoginAddress??'all'),identity=(payload.provider||'')+':'+target;if(seen.has(identity)){if(seen.get(identity)!==JSON.stringify(payload))fail('同一目标存在不同参数，请拆分操作');duplicates++;return}seen.set(identity,JSON.stringify(payload));valid.push(payload)}catch(e){errors.push({row:i+1,message:e.message})}})
 if(errors.length)return res.status(400).json({error:'请修正参数后重新预览',errors})
 if(['telegram_message','email_message'].includes(operation)&&process.env.ANALYTICS_STORAGE==='hologres'){
  const email=operation==='email_message',remote=require('../data/hologres'),snapshot=await remote.status(),identities=await remote.query(`SELECT ${email?'LOWER(subject)':'subject'} AS subject,MIN(account_id::text) AS account_id FROM public.account_identity_v2 WHERE provider=$3 AND verified=true AND ${email?'LOWER(subject)':'subject'}=ANY($1::text[]) AND created_at<=$2::timestamptz GROUP BY ${email?'LOWER(subject)':'subject'} HAVING COUNT(DISTINCT account_id)=1`,[valid.map(r=>email?r.email:r.telegramId),snapshot.snapshot_cutoff,email?'email':'telegram'])
  const accounts=new Map(identities.map(r=>[r.subject,String(r.account_id)]));for(const row of valid)row.accountId=accounts.get(email?row.email:row.telegramId)||null
 }
 if(db.prepare("SELECT COUNT(*) AS n FROM ops_batches WHERE owner_id=? AND state='prepared' AND expires_at>?").get(owner(req),Date.now()).n>=20)fail('待执行预览过多，请稍后重试')
 const id='ops_'+randomUUID(),now=Date.now();db.exec('BEGIN');try{db.prepare('INSERT INTO ops_batches(id,owner_id,operation,created_at,expires_at) VALUES(?,?,?,?,?)').run(id,owner(req),operation,now,now+15*60000);const add=db.prepare('INSERT INTO ops_batch_rows(batch_id,row_no,payload_json) VALUES(?,?,?)');valid.forEach((p,i)=>add.run(id,i+1,JSON.stringify(p)));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 res.json({batch:expose(get(id,owner(req))),duplicates})
}))
router.post('/batches/:id/execute',wrap((req,res)=>{
 const b=get(req.params.id,owner(req));if(b.state!=='prepared')return res.json({batch:expose(b)})
 if(req.body.confirm!==true)fail('请确认预览中的操作和目标后执行')
 if(b.expires_at<=Date.now())throw Object.assign(Error('预览已过期，请重新预览'),{status:409})
 if(active.size>=2&&!active.has(owner(req)))throw Object.assign(Error('OPS 当前执行繁忙，请稍后重试'),{status:429})
 if(active.has(owner(req)))throw Object.assign(Error('当前账号已有执行中的 OPS 任务'),{status:409})
 const token=vault.token(owner(req)+(b.operation==='telegram_message'?':telegram':b.operation==='email_message'?':smtp':''));const changed=db.prepare("UPDATE ops_batches SET state='running',started_at=? WHERE id=? AND state='prepared'").run(Date.now(),b.id);if(!changed.changes)return res.json({batch:expose(get(b.id,owner(req)))})
 active.add(owner(req));setImmediate(()=>run(b,token));res.status(202).json({batch:expose(get(b.id,owner(req)))})
}))
router.post('/batches/:id/cancel',wrap((req,res)=>{const b=get(req.params.id,owner(req));if(b.state==='prepared'){db.prepare("UPDATE ops_batches SET state='cancelled',finished_at=? WHERE id=?").run(Date.now(),b.id);db.prepare("UPDATE ops_batch_rows SET state='cancelled' WHERE batch_id=? AND state='pending'").run(b.id)}else if(b.state==='running')db.prepare("UPDATE ops_batches SET state='stopping' WHERE id=?").run(b.id);res.json({batch:expose(get(b.id,owner(req)))})}))
router.get('/batches',(req,res)=>res.json({batches:db.prepare('SELECT * FROM ops_batches WHERE owner_id=? ORDER BY created_at DESC LIMIT 30').all(owner(req))}))
router.get('/batches/:id/effect',wrap(async(req,res)=>{
 const b=get(req.params.id,owner(req))
 if(process.env.ANALYTICS_STORAGE!=='hologres')return res.status(501).json({error:'效果复盘需要真实远程数据源'})
 if(['telegram_message','email_message'].includes(b.operation)){
  const rows=db.prepare('SELECT state,payload_json FROM ops_batch_rows WHERE batch_id=?').all(b.id),{advertisingTargets,effectPeriods}=require('../analytics/opsEffect'),targets=advertisingTargets(rows),remote=require('../data/hologres'),snapshot=await remote.status(),periods=effectPeriods(b,Date.parse(snapshot.as_of))
  if(!periods||!targets.ids.length)return res.json({campaign_id:b.id,sent:targets.sent,mapped:targets.ids.length,unmatched:targets.unmatched,pending:true,reason:!targets.ids.length?'没有成功发送且唯一匹配账号的用户':'等待本次发送结束及数据覆盖',as_of:snapshot.as_of})
  const {memberFacts,memberMetrics}=require('../data/memberMetrics'),facts=await memberFacts(snapshot,targets.ids,periods.after),metrics=memberMetrics(facts,targets.ids.map(id=>({id})),periods.after,snapshot)
  let login=null,loginError=null;if(facts.known!==null)try{const result=await remote.query(`${remote.eventsCte()} SELECT COUNT(DISTINCT user_key)::int AS n FROM e WHERE user_key=ANY($2::text[]) AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND client_ts >= $3 AND client_ts < $4`,[snapshot.snapshot_cutoff,[...facts.known].map(id=>'user:'+id),periods.after.start,periods.after.end]);login=Number(result[0]?.n||0)}catch{loginError='登录行为查询失败'}
  return res.json({campaign_id:b.id,sent:targets.sent,mapped:targets.ids.length,unmatched:targets.unmatched,pending:false,...periods,as_of:snapshot.as_of,users:metrics?.total?.users??null,login_users:login,analysis_users:metrics?.total?.analysis_users??null,trade_users:metrics?.total?.trade_users??null,errors:{...facts.errors,login:loginError},definition:'仅统计发送成功且预览时唯一匹配账号的用户；登录按已登录行为事件观察，分析与交易按已有数据口径。结果不证明由广告导致。'})
 }
 const {effectTargets,effectPeriods}=require('../analytics/opsEffect'),rows=db.prepare('SELECT state,result_json FROM ops_batch_rows WHERE batch_id=?').all(b.id),ids=effectTargets(b,rows)
 const s=await require('../data/hologres').status(),periods=effectPeriods(b,Date.parse(s.as_of))
 if(!ids.length||!periods)return res.json({users:ids.length,pending:true,reason:!ids.length?'暂无成功且已核对目标账号的发放记录':'发放后观察时间尚未到达',as_of:s.as_of})
 const {memberFacts,memberMetrics}=require('../data/memberMetrics'),members=ids.map(id=>({id}))
 const beforeFacts=await memberFacts(s,ids,periods.before),afterFacts=await memberFacts(s,ids,periods.after)
 const expose=(facts,p)=>{const result=memberMetrics(facts,members,p,s);return {total:result?.total??null,unmatched_users:result?.unmatched_users??null,errors:facts.errors}}
 res.json({users:ids.length,pending:false,...periods,as_of:s.as_of,snapshot_id:s.snapshot_id,before: {...periods.before,...expose(beforeFacts,periods.before)},after:{...periods.after,...expose(afterFacts,periods.after)},definition:'以整批执行结束为观察起点；仅成功且目标账号已核对的SKILL/VIP，前后相同时长，最多7天。展示相关表现，不代表因果增量。'})
}))
router.get('/batches/:id',(req,res)=>{try{res.json({batch:expose(get(req.params.id,owner(req)))})}catch(e){res.status(e.status||500).json({error:e.message})}})
module.exports=router
