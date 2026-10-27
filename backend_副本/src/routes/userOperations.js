const express=require('express'),{randomUUID}=require('node:crypto'),db=require('../db/connection'),remote=require('../data/hologres')
const {memberFacts,memberMetrics}=require('../data/memberMetrics'),{features}=require('../data/remoteUsers'),{userTags}=require('../analytics/userTags')
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)
function userKey(input){const key=String(input||'').replace(/^user:/,'');if(!/^[1-9]\d{0,19}$/.test(key))throw Object.assign(new Error('用户详情需要有效注册账号 ID'),{status:400});return 'user:'+key}
const owner=req=>String(req.user.user_id)
router.get('/api/users/:id/profile',wrap(async(req,res)=>{
 if(process.env.ANALYTICS_STORAGE!=='hologres')throw Object.assign(new Error('统一用户详情需要真实远程数据'),{status:501})
 const key=userKey(req.params.id),eventOffset=Number(req.query.event_offset??0),s=await remote.snapshot(req.query.cache_id?require('../services/analysisJobs').get(String(req.query.cache_id),req.user.user_id).snapshot:req.query.snapshot_id),cutoff=Date.parse(s.snapshot_cutoff)
 if(!Number.isSafeInteger(eventOffset)||eventOffset<0||eventOffset>1000000)throw Object.assign(new Error('事件分页参数无效'),{status:400})
 const period=require('../analytics/kolMetrics').validatePeriod({start:req.query.start==null?cutoff-28*86400000:Number(req.query.start),end:req.query.end==null?cutoff+1:Number(req.query.end)})
 const [rows,facts,events,ai,credits]=await Promise.all([
  features(s,'all',[key],period),memberFacts(s,[key.slice(5)],period),
  remote.query(`${remote.eventsCte()} SELECT event_id,event_name,client_ts AS t,page,properties FROM e WHERE user_key=$2 AND client_ts>=$3 AND client_ts<$4 ORDER BY client_ts,event_id LIMIT 101 OFFSET $5`,[s.snapshot_cutoff,key,period.start,period.end,eventOffset]),
  require('../data/activityAi').activityAi(s,[key.slice(5)],period),
  require('../data/creditsFacts').creditsFacts(s).then(r=>r.map.get(key.slice(5))||null).catch(()=>null)
 ])
 const user=rows[0];if(!user?.account_id)throw Object.assign(new Error('当前快照未匹配到注册账号'),{status:404})
 const tags=userTags(owner(req),{userIds:[key]}).filter(t=>t.user_ids.length).map(({user_ids,...tag})=>({...tag,removable:tag.type==='kol'&&!db.prepare('SELECT 1 FROM crm_kols k WHERE id=? AND (account_id=? OR EXISTS(SELECT 1 FROM crm_kol_accounts a WHERE a.kol_id=k.id AND a.account_id=?))').get(tag.id.slice(4),key.slice(5),key.slice(5))}))
 const followups=db.prepare('SELECT * FROM user_followups WHERE owner_id=? AND user_key=? ORDER BY created_at DESC,id LIMIT 100').all(owner(req),key)
 const safePage=require('../analytics/pageVisits').safePage
 res.json({user,ai,credits,behavior_tags:require('../analytics/behaviorTags').behaviorTags(user,{...period,asOf:Date.parse(s.as_of),historyComplete:false}),tags,performance:memberMetrics(facts,[{id:key.slice(5)}],period,s),errors:facts.errors,followups,events:events.slice(0,100).map(e=>({event_id:e.event_id,event_name:e.event_name,login_type:e.properties?.login_type??null,page_visit_id:e.properties?.page_visit_id??null,page_name:e.properties?.page_name??null,view_mode:e.properties?.view_mode??null,navigation_source:e.properties?.navigation_source??null,previous_page_visit_id:e.properties?.previous_page_visit_id??null,previous_page_path:e.properties?.previous_page_path??null,end_reason:e.properties?.end_reason??null,viewport_width:e.properties?.viewport_width??null,viewport_height:e.properties?.viewport_height??null,t:Number(e.t),page:safePage(e.properties?.page_path||e.properties?.page_url||e.properties?.path||e.page),visible_duration_ms:e.properties?.visible_duration_ms!=null&&Number.isFinite(Number(e.properties.visible_duration_ms))&&Number(e.properties.visible_duration_ms)>=0?Number(e.properties.visible_duration_ms):null})),event_offset:eventOffset,has_more_events:events.length>100,...period,snapshot_id:s.snapshot_id,as_of:s.as_of})
}))
router.post('/api/users/:id/followups',wrap(async(req,res)=>{
 const key=userKey(req.params.id),{content,next_step='',due_at=null}=req.body
 if(typeof content!=='string'||!content.trim()||content.length>4000||typeof next_step!=='string'||next_step.length>1000||due_at!==null&&(!Number.isSafeInteger(due_at)||due_at<0||due_at>4102444800000))throw Object.assign(new Error('请填写有效跟进内容、下一步和跟进时间'),{status:400})
 const rows=await remote.query('SELECT account_id FROM public.account_v2 WHERE account_id::text=$1 LIMIT 1',[key.slice(5)])
 if(!rows.length)throw Object.assign(new Error('用户不存在'),{status:404})
 const id='uf_'+randomUUID();db.prepare('INSERT INTO user_followups(id,owner_id,user_key,content,next_step,due_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,owner(req),key,content.trim(),next_step.trim(),due_at,Date.now())
 res.status(201).json({followup:db.prepare('SELECT * FROM user_followups WHERE id=?').get(id)})
}))
router.patch('/api/user-followups/:id',wrap((req,res)=>{
 const row=db.prepare('SELECT * FROM user_followups WHERE id=? AND owner_id=?').get(req.params.id,owner(req))
 if(!row)throw Object.assign(new Error('跟进记录不存在'),{status:404})
 if(!['open','done'].includes(req.body.status))throw Object.assign(new Error('未知处理状态'),{status:400})
 db.prepare('UPDATE user_followups SET status=?,completed_at=? WHERE id=? AND owner_id=?').run(req.body.status,req.body.status==='done'?(row.completed_at??Date.now()):null,row.id,owner(req))
 res.json({followup:db.prepare('SELECT * FROM user_followups WHERE id=?').get(row.id)})
}))
router.get('/api/workbench',wrap((req,res)=>{
 const now=Date.now(),user=owner(req)
 const kols=db.prepare("SELECT id,name,assignee,next_followup_at FROM crm_kols WHERE owner_id=? AND next_followup_at IS NOT NULL AND stage NOT IN('暂停','已结束') ORDER BY next_followup_at").all(user)
 const activities=db.prepare('SELECT id,name,start_at,cutoff_at,schedule_state,schedule_error FROM growth_activities WHERE archived_at IS NULL AND owner_id=? AND settled_at IS NULL ORDER BY cutoff_at').all(user)
 const followups=db.prepare('SELECT * FROM user_followups WHERE owner_id=? ORDER BY created_at DESC').all(user)
 const groups=db.prepare('SELECT id,title,assignee,priority,status,next_step,due_at,completed_at FROM operation_tasks WHERE owner_id=? ORDER BY created_at DESC').all(user)
 const conversion=db.prepare("SELECT id,user_key,title,next_step,due_at,deadline,status,result_json FROM ops_conversion_tasks WHERE owner_id=? ORDER BY deadline").all(user)
 const tasks=[...conversion.filter(t=>t.status!=='cancelled').map(t=>({...t,type:'conversion',target:t.user_key,due_at:t.due_at??t.deadline,description:(t.next_step||'核对转化结果')+' · '+({achieved:'目标已达成',manual_confirmed:'人工确认达成',expired_unobserved:'到期未观测达成'}[JSON.parse(t.result_json).outcome]||'待检查目标')})),...groups.map(t=>({...t,type:'task',target:t.id,description:t.next_step||'跟进固定人群并记录处理结果'})),...kols.map(k=>({id:'kol:'+k.id,type:'kol',target:k.id,title:k.name,assignee:k.assignee,due_at:k.next_followup_at,status:'open',description:'KOL 下次跟进'})),...activities.filter(a=>a.schedule_state==='scheduled').map(a=>({id:'activity_start:'+a.id,type:'activity_start',target:a.id,title:a.name,due_at:a.start_at,status:'open',description:a.start_at>now?'预约活动待开始':'预约已到时，等待启动'+(a.schedule_error?'：'+a.schedule_error:'')})),...activities.filter(a=>a.schedule_state!=='scheduled'&&a.cutoff_at<=now).map(a=>({id:'activity:'+a.id,type:'activity',target:a.id,title:a.name,due_at:a.cutoff_at+86400000,status:'open',description:now<a.cutoff_at+86400000?'已截止，等待迟到数据满24小时':'活动待结算'})),...followups.filter(f=>f.due_at!=null).map(f=>({id:f.id,type:'user',target:f.user_key,title:f.user_key,due_at:f.due_at,status:f.status,description:f.next_step||f.content,completed_at:f.completed_at}))]
 tasks.sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.due_at??Infinity)-(b.due_at??Infinity))
 const open=tasks.filter(t=>t.status!=='done')
 res.json({tasks,summary:{conversion_due:open.filter(t=>t.type==='conversion'&&t.due_at!=null&&t.due_at<=now).length,conversions_open:open.filter(t=>t.type==='conversion').length,due:open.filter(t=>t.due_at!=null&&t.due_at<=now).length,kol_due:kols.filter(k=>k.next_followup_at<=now).length,activity_pending:activities.filter(a=>a.schedule_state!=='scheduled'&&a.cutoff_at<=now).length,activities_scheduled:activities.filter(a=>a.schedule_state==='scheduled').length,activity_start_due:activities.filter(a=>a.schedule_state==='scheduled'&&a.start_at<=now).length,activities_active:activities.filter(a=>a.schedule_state!=='scheduled'&&a.start_at<=now&&a.cutoff_at>now).length,user_due:open.filter(t=>t.type==='user'&&t.due_at!=null&&t.due_at<=now).length,group_due:open.filter(t=>t.type==='task'&&t.due_at!=null&&t.due_at<=now).length,groups_open:open.filter(t=>t.type==='task').length,completed:tasks.filter(t=>t.status==='done').length},as_of:now})
}))
module.exports=router
