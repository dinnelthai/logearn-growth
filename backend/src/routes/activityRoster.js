module.exports=function mountRoster(router,{db,get,publicActivity,validate}) {
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
 const rootOf=a=>a.parent_id?get(a.parent_id,a.owner_id):a
 const tx=fn=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
 const tagIds=a=>db.prepare('SELECT user_id FROM growth_activity_tags WHERE activity_id=? ORDER BY user_id').all(a.id).map(r=>r.user_id)
 router.get('/:id/roster',(req,res)=>{const a=get(req.params.id,req.user.user_id);if(a.schedule_state==='scheduled')return res.json({activity:publicActivity(a),membership_kind:'planned',user_ids:require('../services/activitySchedule').plannedIds(a.id)});res.json({activity:publicActivity(a),membership_kind:'fixed',user_ids:db.prepare('SELECT user_id FROM growth_activity_members WHERE activity_id=? ORDER BY user_id').all(a.id).map(r=>r.user_id)})})
 router.get('/:id/batches',(req,res)=>{const a=rootOf(get(req.params.id,req.user.user_id));res.json({root:publicActivity(a),batches:db.prepare('SELECT a.*, (SELECT COUNT(*) FROM growth_activity_members m WHERE m.activity_id=a.id) AS member_count FROM growth_activities a WHERE owner_id=? AND (id=? OR parent_id=?) ORDER BY start_at,id').all(a.owner_id,a.id,a.id).map(publicActivity),tag_user_ids:tagIds(a)})})
 router.patch('/:id',(req,res)=>{const a=get(req.params.id,req.user.user_id);if(typeof req.body.archived!=='boolean')return res.status(400).json({error:'请指定归档状态'});db.prepare('UPDATE growth_activities SET archived_at=? WHERE owner_id=? AND (id=? OR parent_id=?)').run(req.body.archived?Date.now():null,a.owner_id,a.id,a.id);res.json({activity:publicActivity(get(a.id,a.owner_id))})})
 router.post('/:id/tag-members',wrap(async(req,res)=>{
  const a=rootOf(get(req.params.id,req.user.user_id)),{action,expected_tag_version}=req.body
  if(!['add','remove'].includes(action))fail('未知标签操作')
  if(!Number.isInteger(expected_tag_version)||expected_tag_version!==a.tag_version)fail('标签名单已更新，请刷新后重试',409)
  const {parseIds}=require('../analytics/activityMonitor'),parsed=parseIds(req.body.user_ids)
  if(!parsed.ids.length||parsed.invalid.length||parsed.dirty.length)fail('请提供有效用户 ID')
  const validated=action==='add'?await validate(parsed.ids):null
  if(validated?.report.unmatched.length)fail('部分用户未匹配注册账号，请校验后重试')
  tx(()=>{const current=get(a.id,a.owner_id);if(current.tag_version!==expected_tag_version)fail('标签名单已更新，请刷新后重试',409)
   const users=new Set(tagIds(a));for(const id of parsed.ids)action==='add'?users.add(id):users.delete(id)
   if(users.size>50000)fail('活动标签最多50000人',422)
   const stmt=db.prepare(action==='add'?'INSERT OR IGNORE INTO growth_activity_tags(activity_id,user_id,added_at) VALUES(?,?,?)':'DELETE FROM growth_activity_tags WHERE activity_id=? AND user_id=?')
   for(const id of parsed.ids)action==='add'?stmt.run(a.id,id,Date.now()):stmt.run(a.id,id)
   db.prepare('UPDATE growth_activities SET tag_version=tag_version+1 WHERE id=?').run(a.id)
  });res.json({activity:publicActivity(get(a.id,a.owner_id)),tag_user_ids:tagIds(a)})
 }))
 router.post('/:id/batches',wrap(async(req,res)=>{
  const a=rootOf(get(req.params.id,req.user.user_id))
  const assertOpen=current=>{if(current.schedule_state==='scheduled'||current.archived_at||current.settled_at||current.cutoff_at<=Date.now())fail('已归档、截止或结算的活动不能追加成员，请复制活动')}
  assertOpen(a)
  const v=await validate(req.body.user_ids);if(!v.rows.length)fail('没有匹配到有效注册用户')
  const existing=new Set(db.prepare('SELECT m.user_id FROM growth_activity_members m JOIN growth_activities a ON a.id=m.activity_id WHERE a.owner_id=? AND (a.id=? OR a.parent_id=?)').all(a.owner_id,a.id,a.id).map(r=>r.user_id))
  const fresh=v.rows.filter(r=>!existing.has(r.user_id)),skipped=v.rows.length-fresh.length
  if(!fresh.length)fail('这些用户已在活动名单中，无需重复添加')
  tx(()=>{assertOpen(get(a.id,a.owner_id));
   // Recheck membership after remote validation to prevent concurrent overlapping batches.
   const check=db.prepare('SELECT 1 FROM growth_activity_members m JOIN growth_activities a ON a.id=m.activity_id WHERE a.owner_id=? AND (a.id=? OR a.parent_id=?) AND m.user_id=?')
   if(fresh.some(r=>check.get(a.owner_id,a.id,a.id,r.user_id)))fail('活动名单已更新，请重试',409)
   if(new Set([...tagIds(a),...fresh.map(r=>r.user_id)]).size>50000)fail('活动标签最多50000人',422)
   const insert=db.prepare('INSERT INTO growth_activity_members(activity_id,user_id,baseline_first_at) VALUES(?,?,?)'),tag=db.prepare('INSERT OR IGNORE INTO growth_activity_tags(activity_id,user_id,added_at) VALUES(?,?,?)')
   for(const r of fresh){insert.run(a.id,r.user_id,r.baseline_first_at!=null&&Number(r.baseline_first_at)<a.start_at?Number(r.baseline_first_at):null);tag.run(a.id,r.user_id,Date.now())}
   db.prepare('UPDATE growth_activities SET tag_version=tag_version+1,schedule_version=schedule_version+1 WHERE id=?').run(a.id)
  });res.status(201).json({activity:publicActivity(get(a.id,a.owner_id)),added:fresh.length,skipped_existing:skipped})
 }))
}
