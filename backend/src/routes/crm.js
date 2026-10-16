const express = require('express')
const {randomUUID} = require('node:crypto')
const db = require('../db/connection')
const {ownAccounts,attachAccounts}=require('../analytics/kolAccounts')
const remote = require('../data/hologres')
const {kolMetrics, validatePeriod} = require('../data/kolMetrics')
const router = express.Router()
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next)
const stages = ['待联系','已联系','沟通中','试用中','合作中','暂停','已结束']
const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}) }
const owner = req => String(req.user.user_id)
function get(id, user) {
  const row = db.prepare('SELECT * FROM crm_kols WHERE id=? AND owner_id=?').get(id, user)
  if (!row) fail('KOL 不存在', 404)
  return {...attachAccounts(db,[row])[0],user_ids:db.prepare('SELECT user_id FROM crm_kol_members WHERE kol_id=? ORDER BY user_id').all(id).map(r=>r.user_id)}
}
function transaction(fn) {
  db.exec('BEGIN')
  try { const result=fn(); db.exec('COMMIT'); return result }
  catch(e) { db.exec('ROLLBACK'); throw e }
}
function profile(body, current={}) {
  if (!body || typeof body!=='object' || Array.isArray(body)) fail('档案格式无效')
  const value={}
  for (const [key,max] of Object.entries({name:80,platform:40,profile_url:500,assignee:80,stage:20,contact:200,language:40,tags:200,notes:4000})) {
    const input=body[key]??current[key]??(key==='stage'?'待联系':'')
    if (typeof input!=='string' || input.length>max) fail(`${key} 格式或长度无效`)
    value[key]=input.trim()
  }
  if (!value.name || !value.platform) fail('请填写 KOL 名称和平台')
  if (!stages.includes(value.stage)) fail('未知合作阶段')
  if (value.profile_url) {
    let url; try { url=new URL(value.profile_url) } catch { fail('主页链接无效') }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) fail('主页链接需为 HTTP / HTTPS 地址')
  }
  if(Object.hasOwn(body,'account_id')&&body.account_id!=null&&typeof body.account_id!=='string')fail('账号ID需为文本')
  let accounts=ownAccounts(current)
  if(Object.hasOwn(body,'account_ids')){
    const input=body.account_ids
    if((typeof input!=='string'&&!Array.isArray(input))||typeof input==='string'&&input.length>4000||Array.isArray(input)&&(input.length>100||input.some(id=>typeof id!=='string')))fail('关联账号需为ID列表')
    const raw=typeof input==='string'?input.split(/[\s,;，；]+/).filter(Boolean):input
    accounts=[...new Set(raw.map(id=>id.trim().replace(/^user:/,'')))]
    if(accounts.length>20||accounts.some(id=>!/^[1-9]\d{0,19}$/.test(id)))fail('最多关联20个有效注册账号ID')
    if(Object.hasOwn(body,'account_id')&&(body.account_id==null?null:String(body.account_id).trim().replace(/^user:/,'')||null)!==(accounts[0]||null))fail('单账号字段与账号列表不一致，请使用account_ids')
  }else if(Object.hasOwn(body,'account_id')){
    const account=body.account_id
    if(account!=null&&typeof account!=='string')fail('账号ID需为文本')
    const id=account?.trim().replace(/^user:/,'')||null
    if(id&&!/^[1-9]\d{0,19}$/.test(id))fail('请填写有效注册账号ID')
    if(accounts.length>1&&id!==current.account_id)fail('此KOL已关联多个账号，请使用账号列表修改',409)
    if(accounts.length<=1)accounts=id?[id]:[]
  }
  value.account_ids=accounts;value.account_id=accounts[0]||null
  const next=Object.hasOwn(body,'next_followup_at')?body.next_followup_at:current.next_followup_at
  if (next!=null && (!Number.isSafeInteger(next) || next<0 || next>4102444800000)) fail('跟进时间无效')
  value.next_followup_at=next??null
  return value
}
function checkAccountConflicts(accounts,user,id){
  for(const account of accounts){const linked=db.prepare('SELECT id FROM crm_kols WHERE owner_id=? AND account_id=? AND id<>? UNION SELECT kol_id AS id FROM crm_kol_accounts WHERE owner_id=? AND account_id=? AND kol_id<>?').get(user,account,id,user,account,id);if(linked)fail('账号 '+account+' 已关联另一个KOL，请先解除原关联',409)}
}
async function validateAccount(value,user,id,current={}){
  checkAccountConflicts(value.account_ids,user,id)
  const prior=new Set(ownAccounts(current)),fresh=value.account_ids.filter(id=>!prior.has(id));if(!fresh.length)return
  if(process.env.ANALYTICS_STORAGE!=='hologres')fail('账号关联需要真实远程数据源',501)
  const rows=await remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($1::text[])',[fresh]),known=new Set(rows.map(r=>String(r.account_id)))
  const missing=fresh.filter(id=>!known.has(id));if(missing.length)fail('未匹配到注册账号：'+missing.join('、'))
}
async function validateMembers(input) {
  if(typeof input!=='string'&&!Array.isArray(input))fail('KOL 用户名单格式无效')
  const {parseIds}=require('../analytics/activityMonitor'),parsed=parseIds(input)
  if(parsed.invalid.length||parsed.dirty.length||parsed.ids.some(id=>!/^[1-9]\d{0,19}$/.test(id)))fail('KOL 名单需填写有效注册账号 ID，不能包含 acc_ 或无效 ID')
  if(!parsed.ids.length)return []
  if(process.env.ANALYTICS_STORAGE!=='hologres')fail('名单校验需要真实远程数据源',501)
  const rows=await remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($1::text[])',[parsed.ids]),known=new Set(rows.map(r=>r.account_id))
  const missing=parsed.ids.filter(id=>!known.has(id));if(missing.length)fail('KOL 名单有未匹配账号：'+missing.slice(0,10).join('、'))
  return parsed.ids
}
function save(value,user,id,current,members) {
  const now=Date.now(),{account_ids:accounts,...fields}=value,keys=Object.keys(fields)
  return transaction(() => {
    // Recheck after asynchronous account validation to prevent concurrent linking.
    checkAccountConflicts(accounts,user,id)
    if (current) {
      const latest=get(id,user)
      if (latest.updated_at!==current.updated_at) fail('档案已被修改，请重新加载',409)
      db.prepare(`UPDATE crm_kols SET ${keys.map(k=>k+'=?').join(',')},updated_at=? WHERE id=? AND owner_id=?`).run(...Object.values(fields),Math.max(now,latest.updated_at+1),id,user)
    } else db.prepare(`INSERT INTO crm_kols(id,owner_id,${keys.join(',')},created_at,updated_at) VALUES(${Array(keys.length+4).fill('?').join(',')})`).run(id,user,...Object.values(fields),now,now)
    const nextAccounts=new Set(accounts),previous=ownAccounts(current||{})
    for(const account of previous)if(!nextAccounts.has(account))db.prepare('DELETE FROM crm_kol_accounts WHERE kol_id=? AND account_id=?').run(id,account)
    for(const [position,account]of accounts.entries())db.prepare('INSERT INTO crm_kol_accounts(kol_id,owner_id,account_id,position,created_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,account_id) DO UPDATE SET position=excluded.position').run(id,user,account,position,now)
    if(members!==undefined){const prior=new Set(current?.user_ids||[]),next=new Set(members);const remove=db.prepare('DELETE FROM crm_kol_members WHERE kol_id=? AND user_id=?'),insert=db.prepare('INSERT OR IGNORE INTO crm_kol_members VALUES(?,?)');for(const uid of prior)if(!next.has(uid))remove.run(id,uid);for(const uid of next)if(!prior.has(uid))insert.run(id,uid)}
    const result=get(id,user)
    db.prepare('INSERT INTO crm_profile_history VALUES(?,?,?,?,?,?)').run(randomUUID(),id,user,current?JSON.stringify(current):null,JSON.stringify(result),now)
    return result
  })
}
router.get('/',wrap((req,res) => {
  const q=String(req.query.q||'').trim().slice(0,128),stage=String(req.query.stage||''),assignee=String(req.query.assignee||'')
  if (stage && !stages.includes(stage)) fail('未知合作阶段')
  const rows=attachAccounts(db,db.prepare('SELECT * FROM crm_kols WHERE owner_id=? ORDER BY updated_at DESC').all(owner(req)))
  const filtered=rows.filter(r=>(!stage||r.stage===stage)&&(!assignee||r.assignee===assignee)&&(!q||[r.name,r.platform,...r.account_ids,r.tags,r.assignee].some(v=>v?.toLowerCase().includes(q.toLowerCase()))))
  const offset=Math.max(0,Math.floor(Number(req.query.offset)||0)),limit=Math.min(50,Math.max(1,Math.floor(Number(req.query.limit)||50)))
  res.json({kols:filtered.slice(offset,offset+limit),total:filtered.length,offset,limit,stages,assignees:[...new Set(rows.map(r=>r.assignee).filter(Boolean))],summary:{total:rows.length,due:rows.filter(r=>r.next_followup_at!=null&&r.next_followup_at<=Date.now()&&!['暂停','已结束'].includes(r.stage)).length}})
}))
router.post('/',wrap(async(req,res) => {
  const value=profile(req.body),id='kol_'+randomUUID()
  await validateAccount(value,owner(req),id)
  const members=await validateMembers(req.body.user_ids??[])
  res.status(201).json({kol:save(value,owner(req),id,undefined,members)})
}))
require('./kolRanking')(router,{stages,wrap})
router.post('/metrics',wrap(async(req,res) => {
  const ids=req.body.kol_ids
  if (!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string')) fail('一次最多查询 50 个 KOL')
  const profiles=[...new Set(ids)].map(id=>get(id,owner(req)))
  const period=validatePeriod(req.body)
  if (process.env.ANALYTICS_STORAGE!=='hologres') return res.json({metrics:profiles.map(p=>({id:p.id,available:false,reason:'业务指标需要真实远程数据源'}))})
  if(req.body.include_details!==undefined&&typeof req.body.include_details!=='boolean')fail('明细选项需为布尔值')
  res.json(await kolMetrics(profiles,period,{includeDetails:req.body.include_details!==false}))
}))
require('./collaborations')(router,{getKol:get,wrap})
router.get('/:id',wrap((req,res) => {
  const kol=get(req.params.id,owner(req))
  const activities=db.prepare('SELECT a.id,a.name,a.start_at,a.cutoff_at,a.settled_at,a.schedule_state,a.baseline_frozen_at FROM growth_activities a JOIN crm_activity_links l ON l.activity_id=a.id WHERE l.kol_id=? AND a.owner_id=? ORDER BY a.start_at DESC').all(kol.id,owner(req))
  const followups=db.prepare('SELECT * FROM crm_followups WHERE kol_id=? ORDER BY created_at DESC,id DESC LIMIT 500').all(kol.id)
  res.json({kol,activities,followups,history:db.prepare('SELECT id,author_id,created_at,before_json,after_json FROM crm_profile_history WHERE kol_id=? ORDER BY created_at DESC LIMIT 50').all(kol.id)})
}))
router.patch('/:id',wrap(async(req,res) => {
  const current=get(req.params.id,owner(req))
  if (req.body.expected_updated_at!==current.updated_at) fail('档案已更新，请重新加载后保存',409)
  const value=profile(req.body,current)
  await validateAccount(value,owner(req),current.id,current)
  const members=Object.hasOwn(req.body,'user_ids')?await validateMembers(req.body.user_ids):undefined
  res.json({kol:save(value,owner(req),current.id,current,members)})
}))
router.patch('/:id/members',wrap(async(req,res)=>{
  const current=get(req.params.id,owner(req)),uid=req.body.user_id
  if(typeof uid!=='string'||!/^[1-9]\d{0,19}$/.test(uid)||!['add','remove'].includes(req.body.action))fail('用户标签修改格式无效')
  if(req.body.expected_updated_at!==current.updated_at)fail('档案已更新，请重新加载后保存',409)
  if(req.body.action==='remove'&&ownAccounts(current).includes(uid))fail('关联账号自动具有此标签，请在KOL档案中修改账号关联')
  if(req.body.action==='add')await validateMembers([uid])
  const members=req.body.action==='add'?[...new Set([...current.user_ids,uid])]:current.user_ids.filter(id=>id!==uid)
  if(members.length>5000)fail('KOL 标签名单最多5000人')
  res.json({kol:save(profile({},current),owner(req),current.id,current,members)})
}))
router.post('/:id/followups',wrap((req,res) => {
  const kol=get(req.params.id,owner(req)),{content,next_step='',next_followup_at}=req.body
  if (typeof content!=='string'||!content.trim()||content.length>4000||typeof next_step!=='string'||next_step.length>1000) fail('请填写跟进内容（最多4000字）及有效下一步')
  const next=next_followup_at===undefined?kol.next_followup_at:profile({next_followup_at},kol).next_followup_at
  transaction(() => {
    const now=Math.max(Date.now(),kol.updated_at+1)
    db.prepare('INSERT INTO crm_followups VALUES(?,?,?,?,?,?)').run(randomUUID(),kol.id,owner(req),content.trim(),next_step.trim(),now)
    db.prepare('UPDATE crm_kols SET next_followup_at=?,updated_at=? WHERE id=? AND owner_id=?').run(next,now,kol.id,owner(req))
    db.prepare('INSERT INTO crm_profile_history VALUES(?,?,?,?,?,?)').run(randomUUID(),kol.id,owner(req),JSON.stringify(kol),JSON.stringify(get(kol.id,owner(req))),now)
  })
  res.status(201).json({ok:true})
}))
router.post('/:id/activities',wrap((req,res) => {
  const kol=get(req.params.id,owner(req)),id=req.body.activity_id
  if (typeof id!=='string'||!db.prepare('SELECT id FROM growth_activities WHERE id=? AND owner_id=?').get(id,owner(req))) fail('活动不存在',404)
  db.prepare('INSERT OR IGNORE INTO crm_activity_links VALUES(?,?,?)').run(kol.id,id,Date.now())
  res.json({ok:true})
}))
router.delete('/:id/activities/:activityId',wrap((req,res) => {
  const kol=get(req.params.id,owner(req))
  if(db.prepare('SELECT 1 FROM crm_collaboration_activities ca JOIN crm_collaborations c ON c.id=ca.collaboration_id WHERE c.kol_id=? AND ca.activity_id=?').get(kol.id,req.params.activityId))fail('活动仍关联合作批次，请先在合作批次中解除关联',409)
  db.prepare('DELETE FROM crm_activity_links WHERE kol_id=? AND activity_id=?').run(kol.id,req.params.activityId)
  res.json({ok:true})
}))
module.exports=router
