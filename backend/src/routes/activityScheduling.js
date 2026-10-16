const {randomUUID}=require('node:crypto'),{validateTarget}=require('../analytics/activityTargets'),schedule=require('../services/activitySchedule')
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
function validateWindow(start,end,now=Date.now()){if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=now||end<=start||end>now+366*86400000)fail('请选择未来的开始时间和其后的截止时间，最晚一年内')}
module.exports=function mount(router,{db,get,publicActivity,validate,wrap}){
 router.post('/',wrap(async(req,res)=>{
  const body=req.body,name=String(body.name||'').trim(),cutoff=Number(body.cutoff_at),goal=body.goal??'activation',backfill=body.start_mode==='backfill',scheduled=body.start_at!=null&&!backfill
  if(!['activation','engagement','trade'].includes(goal))fail('未知活动目标')
  if(!name||name.length>80||!Number.isSafeInteger(cutoff)||(!backfill&&cutoff<=Date.now())||cutoff>Date.now()+366*86400000)fail('请填写活动名称及未来一年内的截止时间')
  if(backfill&&(!Number.isSafeInteger(body.start_at)||body.start_at<=0||body.start_at>Date.now()||cutoff<=body.start_at))fail('补录开始时间须为过去时间，截止须晚于开始')
  if(scheduled)validateWindow(body.start_at,cutoff)
  const target=validateTarget(body,goal),owner=String(req.user.user_id),kolId=body.kol_id
  if(kolId!=null&&(typeof kolId!=='string'||!db.prepare('SELECT id FROM crm_kols WHERE id=? AND owner_id=?').get(kolId,owner)))fail('关联 KOL 不存在',404)
  const v=await validate(body.user_ids);if(!v.rows.length)fail('没有匹配到有效注册用户，无法创建活动')
  const start=scheduled||backfill?body.start_at:Date.now();if(scheduled)validateWindow(start,cutoff);else if(cutoff<=start)fail('截止时间已过，请重新设置')
  if(backfill){const prior=v.rows.filter(r=>r.baseline_first_at!=null&&Number(r.baseline_first_at)<start).length;v.report={...v.report,prior,eligible:v.rows.length-prior,baseline_at:start}}
  const id='activity_'+randomUUID(),at=Date.now(),report=scheduled?{...v.report,baseline_pending:true,prior:null,eligible:null}:v.report
  db.exec('BEGIN');try{
   db.prepare('INSERT INTO growth_activities(id,owner_id,name,start_at,cutoff_at,baseline_snapshot,import_report,goal,tag_version,target_metric,target_value,schedule_state,baseline_frozen_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)').run(id,owner,name,start,cutoff,v.s.snapshot_id,JSON.stringify(report),goal,target.target_metric,target.target_value,scheduled?'scheduled':'active',scheduled?null:at)
   for(const r of v.rows){if(scheduled)db.prepare('INSERT INTO growth_activity_planned_members VALUES(?,?)').run(id,r.user_id);else db.prepare('INSERT INTO growth_activity_members VALUES(?,?,?)').run(id,r.user_id,r.baseline_first_at!=null&&Number(r.baseline_first_at)<start?Number(r.baseline_first_at):null);db.prepare('INSERT INTO growth_activity_tags VALUES(?,?,?)').run(id,r.user_id,at)}
   if(kolId)db.prepare('INSERT INTO crm_activity_links VALUES(?,?,?)').run(kolId,id,at)
   if(scheduled)schedule.record({id},'created',owner,null,{name,goal,...target,start_at:start,cutoff_at:cutoff,user_ids:v.rows.map(r=>r.user_id),schedule_version:0})
   db.exec('COMMIT')
  }catch(e){db.exec('ROLLBACK');throw e}
  res.status(201).json({activity:publicActivity(get(id,owner))})
 }))
 router.patch('/:id/start-time',wrap(async(req,res)=>{
  const a=get(req.params.id,req.user.user_id),{start_at:start,expected_schedule_version:version}=req.body
  const editable=current=>{if(current.schedule_state==='scheduled')fail('预约活动请修改预约计划',409);if(current.settled_at||current.settled_result)fail('已结算活动的结果已冻结，不能修改开始时间',409);if(current.archived_at)fail('请先恢复活动再修改开始时间',409);if(!Number.isInteger(version)||current.schedule_version!==version)fail('活动已更新，请刷新后重试',409)}
  editable(a)
  if(!Number.isSafeInteger(start)||start<=0||start>Date.now()||start>=a.cutoff_at)fail('开始时间须为过去时间，且早于监控截止时间')
  const ids=db.prepare('SELECT user_id FROM growth_activity_members WHERE activity_id=? ORDER BY user_id').all(a.id).map(r=>r.user_id)
  if(!ids.length)fail('活动固定名单为空，无法重算基线',409)
  const v=await validate(ids),map=new Map(v.rows.map(r=>[String(r.user_id),r]))
  if(ids.some(id=>!map.has(id))||v.rows.some(r=>r.baseline_first_at!=null&&!Number.isFinite(Number(r.baseline_first_at))))fail('部分成员或首次分析数据不完整，未修改开始时间',503)
  if(!Number.isFinite(Date.parse(v.s.as_of||v.s.snapshot_cutoff))||Date.parse(v.s.as_of||v.s.snapshot_cutoff)<start)fail('数据截至尚未到达所选开始时间，请刷新数据后重试',503)
  db.exec('BEGIN');try{
   const current=get(a.id,a.owner_id);editable(current)
   const update=db.prepare('UPDATE growth_activity_members SET baseline_first_at=? WHERE activity_id=? AND user_id=?');let prior=0
   for(const id of ids){const first=map.get(id).baseline_first_at,baseline=first!=null&&Number(first)<start?Number(first):null;if(baseline!=null)prior++;update.run(baseline,a.id,id)}
   const at=Date.now(),report={...JSON.parse(current.import_report),matched:ids.length,prior,eligible:ids.length-prior,baseline_at:start,baseline_frozen_at:at,baseline_pending:false}
   db.prepare('UPDATE growth_activities SET start_at=?,baseline_snapshot=?,baseline_frozen_at=?,import_report=?,schedule_version=schedule_version+1 WHERE id=?').run(start,v.s.snapshot_id,at,JSON.stringify(report),a.id)
   schedule.record(a,'start_time_updated',String(req.user.user_id),{start_at:a.start_at,schedule_version:version},{start_at:start,schedule_version:version+1,baseline_snapshot:v.s.snapshot_id,matched:ids.length,prior,eligible:ids.length-prior})
   db.exec('COMMIT')
  }catch(e){db.exec('ROLLBACK');throw e}
  res.json({activity:publicActivity(get(a.id,a.owner_id))})
 }))
 router.get('/:id/schedule',wrap((req,res)=>{const a=get(req.params.id,req.user.user_id);res.json({activity:publicActivity(a),planned_user_ids:schedule.plannedIds(a.id),history:db.prepare('SELECT id,action,actor_id,before_json,after_json,created_at FROM growth_activity_schedule_history WHERE activity_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(a.id).map(({before_json,after_json,...h})=>({...h,before:before_json?JSON.parse(before_json):null,after:JSON.parse(after_json)}))})}))
 router.patch('/:id/schedule',wrap(async(req,res)=>{
  const a=get(req.params.id,req.user.user_id),b=req.body
  const editable=current=>{if(current.schedule_state!=='scheduled'||current.archived_at)fail('已启动或归档的活动不能修改预约',409);if(current.schedule_version!==b.expected_schedule_version)fail('预约已更新，请刷新后重试',409)}
  editable(a);validateWindow(b.start_at,b.cutoff_at)
  const name=b.name??a.name;if(typeof name!=='string'||!name.trim()||name.trim().length>80)fail('活动名称须为1–80字')
  const target=validateTarget({target_metric:b.target_metric??a.target_metric,target_value:b.target_value===undefined?a.target_value:b.target_value},a.goal),old=schedule.plannedIds(a.id),v=await validate(b.user_ids??old)
  if(!v.rows.length)fail('没有可纳入计划的注册用户')
  const ids=v.rows.map(r=>String(r.user_id));db.exec('BEGIN');try{
   const current=get(a.id,a.owner_id);editable(current);validateWindow(b.start_at,b.cutoff_at)
   if(current.tag_version!==a.tag_version)fail('活动标签已更新，请刷新后再修改计划',409)
   db.prepare('DELETE FROM growth_activity_planned_members WHERE activity_id=?').run(a.id)
   const next=new Set(ids),previous=new Set(old),at=Date.now()
   for(const id of old)if(!next.has(id))db.prepare('DELETE FROM growth_activity_tags WHERE activity_id=? AND user_id=?').run(a.id,id)
   for(const id of ids){db.prepare('INSERT INTO growth_activity_planned_members VALUES(?,?)').run(a.id,id);if(!previous.has(id))db.prepare('INSERT OR IGNORE INTO growth_activity_tags VALUES(?,?,?)').run(a.id,id,at)}
   if(db.prepare('SELECT COUNT(*) AS n FROM growth_activity_tags WHERE activity_id=?').get(a.id).n>50000)fail('活动标签最多50000人，请先缩小当前标签名单',422)
   db.prepare('UPDATE growth_activities SET name=?,start_at=?,cutoff_at=?,target_metric=?,target_value=?,schedule_version=schedule_version+1,tag_version=tag_version+1,schedule_error=NULL,schedule_last_attempt_at=NULL,import_report=? WHERE id=?').run(name.trim(),b.start_at,b.cutoff_at,target.target_metric,target.target_value,JSON.stringify({...v.report,baseline_pending:true,prior:null,eligible:null}),a.id)
   schedule.record(a,'updated',String(req.user.user_id),{name:a.name,goal:a.goal,target_metric:a.target_metric,target_value:a.target_value,start_at:a.start_at,cutoff_at:a.cutoff_at,user_ids:old,schedule_version:a.schedule_version},{name:name.trim(),goal:a.goal,...target,start_at:b.start_at,cutoff_at:b.cutoff_at,user_ids:ids,schedule_version:a.schedule_version+1})
   db.exec('COMMIT')
  }catch(e){db.exec('ROLLBACK');throw e}
  res.json({activity:publicActivity(get(a.id,a.owner_id))})
 }))
 router.post('/:id/start',wrap(async(req,res)=>{const a=get(req.params.id,req.user.user_id);if(a.schedule_state!=='scheduled')return res.json({activity:publicActivity(a)});if(a.archived_at||a.start_at>Date.now())fail('归档活动或尚未到开始时间，不能启动',409);if(a.schedule_version!==req.body.expected_schedule_version)fail('预约已更新，请刷新后重试',409);const result=await schedule.ensureStarted(a.id,{force:true});if(result.schedule_state!=='active')fail(result.schedule_error||'预约已更新，请刷新后重试',503);res.json({activity:publicActivity(result)})}))
}
module.exports.validateWindow=validateWindow
