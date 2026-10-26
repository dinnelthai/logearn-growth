const {randomUUID}=require('node:crypto')
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const GROUPS=['treatment','control'],KINDS=['sent','delivered','not_delivered','cross_exposed','note']
function version(db,id){return db.prepare('SELECT version FROM growth_activity_evidence_state WHERE activity_id=?').get(id)?.version||0}
function mutate(db,a,expected,fn){
 if(a.archived_at)fail('归档活动的验证记录只读',409)
 if(!Number.isSafeInteger(expected)||expected<0)fail('请提供验证记录版本')
 db.exec('BEGIN IMMEDIATE')
 try{
  if(version(db,a.id)!==expected)fail('验证记录已更新，请刷新后重试',409)
  const result=fn()
  db.prepare('INSERT INTO growth_activity_evidence_state(activity_id,version) VALUES(?,1) ON CONFLICT(activity_id) DO UPDATE SET version=version+1').run(a.id)
  db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}
function assign(db,a,body,author){
 if(a.schedule_state==='scheduled'||a.settled_at)fail('请在活动启动后、结算前固定验证分组',409)
 if(!GROUPS.includes(body.group_key))fail('请选择干预组或对照组')
 const {parseIds}=require('../analytics/activityMonitor'),parsed=parseIds(body.user_ids)
 if(!parsed.ids.length||parsed.invalid.length||parsed.dirty.length||parsed.ids.length>500)fail('每次请选择1至500个有效活动成员')
 return mutate(db,a,body.expected_version,()=>{
  const member=db.prepare('SELECT baseline_first_at FROM growth_activity_members WHERE activity_id=? AND user_id=?'),existing=db.prepare('SELECT 1 FROM growth_activity_assignments WHERE activity_id=? AND user_id=?')
  const values=parsed.ids.map(id=>{const m=member.get(a.id,id);if(!m)fail('只能分配当前活动固定成员');if(existing.get(a.id,id))fail('原始分组已固定，不能覆盖；请追加说明或跨组曝光记录',409);return {id,baseline:m.baseline_first_at}})
  const insert=db.prepare('INSERT INTO growth_activity_assignments(activity_id,user_id,group_key,assigned_at,author_id,activity_start_at,activity_cutoff_at,baseline_first_at) VALUES(?,?,?,?,?,?,?,?)'),at=Date.now()
  for(const r of values)insert.run(a.id,r.id,body.group_key,at,String(author),a.start_at,a.cutoff_at,r.baseline)
  return {assigned:values.length}
 })
}
function record(db,a,b,author){
 if(!KINDS.includes(b.kind))fail('未知送达证据类型')
 const uid=String(b.user_id||'').replace(/^user:/,'')
 const channel=typeof b.channel==='string'?b.channel.trim():'',evidence=typeof b.evidence==='string'?b.evidence.trim():''
 if(channel.length>80||!evidence||evidence.length>1000||b.kind!=='note'&&!channel)fail('请填写渠道（最多80字）与证据或原因（1至1000字）')
 if(!Number.isSafeInteger(b.occurred_at)||b.occurred_at<0||b.occurred_at>Date.now())fail('记录发生时间须为有效的过去时间')
 if(typeof b.request_id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(b.request_id))fail('请提供有效请求标识')
 const existing=db.prepare('SELECT * FROM growth_activity_delivery_evidence WHERE activity_id=? AND request_id=?').get(a.id,b.request_id)
 if(existing){if(existing.user_id!==uid||existing.kind!==b.kind||existing.occurred_at!==b.occurred_at||existing.channel!==channel||existing.evidence!==evidence)fail('请求标识已用于不同记录',409);return {id:existing.id,existing:true}}
 return mutate(db,a,b.expected_version,()=>{
  if(!db.prepare('SELECT 1 FROM growth_activity_assignments WHERE activity_id=? AND user_id=?').get(a.id,uid))fail('请先固定该成员的原始分组')
  if(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_delivery_evidence WHERE activity_id=?').get(a.id).n>=20000)fail('活动验证记录已达上限',422)
  const id='ae_'+randomUUID();db.prepare('INSERT INTO growth_activity_delivery_evidence VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,a.id,uid,b.kind,b.occurred_at,channel,evidence,Date.now(),String(author),b.request_id)
  return {id,existing:false}
 })
}
function summary(db,a,outcomes){
 const assignments=db.prepare('SELECT * FROM growth_activity_assignments WHERE activity_id=? ORDER BY user_id').all(a.id)
 const records=db.prepare('SELECT user_id,kind FROM growth_activity_delivery_evidence WHERE activity_id=? ORDER BY occurred_at,recorded_at,rowid').all(a.id),last=new Map(),cross=new Set()
 for(const r of records){if(r.kind==='cross_exposed')cross.add(r.user_id);if(['sent','delivered','not_delivered'].includes(r.kind))last.set(r.user_id,r.kind)}
 const byUser=outcomes?new Map(outcomes.map(r=>[r.user_id,r])):null
 return {assigned:assignments.length,groups:GROUPS.map(group_key=>{
  const rs=assignments.filter(r=>r.group_key===group_key),result={group_key,users:rs.length,delivered:rs.filter(r=>last.get(r.user_id)==='delivered').length,sent_unconfirmed:rs.filter(r=>last.get(r.user_id)==='sent').length,not_delivered:rs.filter(r=>last.get(r.user_id)==='not_delivered').length,delivery_unknown:rs.filter(r=>!last.has(r.user_id)).length,cross_exposed:rs.filter(r=>cross.has(r.user_id)).length,retrospective_records:rs.filter(r=>r.assigned_at>r.activity_start_at).length}
  if(byUser){const os=rs.map(r=>byUser.get(r.user_id));result.outcomes={matched:os.filter(Boolean).length,first_completed:os.filter(r=>r?.status==='completed').length,analysis_users:os.some(r=>r&&r.analysis_events==null)?null:os.filter(r=>r?.analysis_events>0).length}}
  return result
 }),definition:'人工固定原始分组，不代表随机实验。按原始分组汇总，未送达和跨组曝光不剔除；送达状态取发生时间最后一条记录。分组在开始后补记时明确标为事后记录。表现差异不证明因果增量。'}
}
function read(db,a,{offset=0,limit=20,q=''}={}){
 offset=Math.max(0,Math.floor(Number(offset)||0));limit=Math.min(100,Math.max(1,Math.floor(Number(limit)||20)));q=String(q).trim().slice(0,128)
 const where="activity_id=? AND INSTR(user_id,?)>0",params=[a.id,q]
 return {version:version(db,a.id),summary:summary(db,a),total:db.prepare('SELECT COUNT(*) AS n FROM growth_activity_assignments WHERE '+where).get(...params).n,
  rows:db.prepare('SELECT * FROM growth_activity_assignments WHERE '+where+' ORDER BY user_id LIMIT ? OFFSET ?').all(...params,limit,offset),
  record_total:db.prepare('SELECT COUNT(*) AS n FROM growth_activity_delivery_evidence WHERE '+where).get(...params).n,
  records:db.prepare('SELECT * FROM growth_activity_delivery_evidence WHERE '+where+' ORDER BY recorded_at DESC,rowid DESC LIMIT ? OFFSET ?').all(...params,limit,offset),offset,limit}
}
module.exports={assign,record,read,summary}
