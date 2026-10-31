const express=require('express'),{randomUUID}=require('node:crypto'),db=require('../db/connection'),remote=require('../data/hologres'),jobs=require('../services/analysisJobs')
const {cachedAudience}=require('../analytics/taskAudience'),{memberFacts,memberMetrics}=require('../data/memberMetrics')
const router=express.Router(),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})}
function get(id,owner){const t=db.prepare('SELECT * FROM operation_tasks WHERE id=? AND owner_id=?').get(String(id),String(owner));if(!t)fail('人群任务不存在或无权访问',404);return t}
function expose(t){const {members_json,source_json,baseline_json,...rest}=t;return {...rest,member_count:JSON.parse(members_json).length,source:JSON.parse(source_json),baseline:JSON.parse(baseline_json)}}
function fields(input,old={}){
 const out={}
 for(const [key,max,fallback]of [['title',80,''],['assignee',80,''],['next_step',1000,''],['priority',2,'P2'],['status',20,'open']]){
  const value=input[key]??old[key]??fallback;if(typeof value!=='string'||value.length>max)fail('任务字段格式或长度无效');out[key]=value.trim()
 }
 if(!out.title||!['P1','P2','P3'].includes(out.priority)||!['open','in_progress','done'].includes(out.status))fail('请填写有效标题、优先级和状态')
 const due=Object.hasOwn(input,'due_at')?input.due_at:old.due_at??null
 if(due!==null&&(!Number.isSafeInteger(due)||due<0||due>4102444800000))fail('下次检查时间无效')
 out.due_at=due;return out
}
function tx(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}
const summary=t=>({title:t.title,assignee:t.assignee,priority:t.priority,status:t.status,next_step:t.next_step,due_at:t.due_at})
async function syncLinkedAISuggestions(task,owner,resultNote='',deps={}){
 let workspace,records,ids;
 try{
  workspace=deps.workspace||require('../ai/growth/workspace/store').workspaceStore(db);
  records=deps.records||require('../db/aiRecords');
  ids=workspace.suggestionIdsForOperationTask(owner,task.id);
 }catch(error){
  return {status:'partial',linked:0,updated:0,
   items:[{status:'link-lookup-failed',error:String(error.message||error).slice(0,240)}]};
 }
 if(!ids.length)return {status:'not-linked',linked:0,updated:0,items:[]};
 const items=[];
 for(const id of ids){
  try{
   let suggestion=await records.getSuggestion(id,owner);
   if(!suggestion){items.push({suggestionId:id,status:'missing'});continue;}
   if(task.status==='in_progress'&&suggestion.user_status==='adopted'){
    suggestion=await records.transitionSuggestionStatus(id,owner,'adopted','executing',{})||
     await records.getSuggestion(id,owner);
   }
   if(task.status==='done'&&['adopted','executing'].includes(suggestion.user_status)){
    if(!String(resultNote||'').trim()){
     items.push({suggestionId:id,status:'needs-execution-note'});continue;
    }
    if(suggestion.user_status==='adopted'){
     suggestion=await records.transitionSuggestionStatus(id,owner,'adopted','executing',{})||
      await records.getSuggestion(id,owner);
    }
    if(suggestion?.user_status==='executing'){
     suggestion=await records.transitionSuggestionStatus(id,owner,'executing','executed',{
      actualAction:String(resultNote).trim().slice(0,5000),
      executedAt:Number.isSafeInteger(task.completed_at)?task.completed_at:Date.now(),
      actionScope:suggestion.action_scope||suggestion.applicable_scope
     })||await records.getSuggestion(id,owner);
    }
   }
   items.push({suggestionId:id,status:suggestion?.user_status||'unknown'});
  }catch(error){items.push({suggestionId:id,status:'sync-failed',error:error.message.slice(0,240)});}
 }
 const failed=items.some(x=>['missing','needs-execution-note','sync-failed'].includes(x.status));
 return {status:failed?'partial':'complete',linked:ids.length,
  updated:items.filter(x=>['executing','executed'].includes(x.status)).length,items};
}

function history(t,before,note,at){db.prepare('INSERT INTO operation_task_history(id,task_id,note,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)').run('oth_'+randomUUID(),t.id,note,before?JSON.stringify(summary(before)):null,JSON.stringify(summary(t)),at)}
router.post('/',wrap(async(req,res)=>{
 if(process.env.ANALYTICS_STORAGE!=='hologres')fail('人群任务需要真实远程数据源',501)
 const scopeLabel=req.body.scope_label??'';if(typeof scopeLabel!=='string'||scopeLabel.length>200)fail('来源范围说明无效')
 const owner=String(req.user.user_id),input=fields({...req.body,status:'open'}),cache=String(req.body.cache_id||'')
 const existing=db.prepare('SELECT * FROM operation_tasks WHERE owner_id=? AND origin_job=?').get(owner,cache)
 if(existing)return res.json({task:expose(existing),existing:true})
 const {j,value}=jobs.result(cache,req.user.user_id)
 if(!['segments','growth-insights'].includes(j.context.mode))fail('请从已运行的用户分群或增长诊断生成任务')
 const listKey=j.context.mode==='growth-insights'?'growth:absent:registered':'all'
 const keys=cachedAudience(value,listKey)
 if(keys.length>5000)fail('任务名单最多5000人，请缩小分群范围',422)
 if(keys.some(id=>!/^user:[1-9]\d{0,19}$/.test(id)))fail('任务只支持已匹配注册账号的用户')
 const ids=keys.map(id=>id.slice(5)),s=await remote.snapshot(j.snapshot),period={start:j.context.start,end:j.context.end}
 const facts=await memberFacts(s,ids,period),baseline=memberMetrics(facts,ids.map(id=>({id})),period,s)
 if(!baseline||Object.values(facts.errors).some(Boolean))fail('基线使用或交易数据未完整取得，请重试',503)
 if(j.context.mode==='growth-insights'&&baseline.unmatched_users)fail('未回访名单中存在未匹配注册账号，请先核对账号身份',422)
 const at=Date.now(),id='ot_'+randomUUID(),source={...period,scope_label:scopeLabel,source:j.context.source,snapshot_id:j.snapshot,as_of:s.as_of,conditions:j.context.selection||{pool:value.payload.pool,filters:value.payload.filters},summary:value.payload.summary}
 const saved=tx(()=>{const current=db.prepare('SELECT * FROM operation_tasks WHERE owner_id=? AND origin_job=?').get(owner,cache);if(current)return {task:current,existing:true}
  db.prepare('INSERT INTO operation_tasks(id,owner_id,origin_job,title,assignee,priority,status,next_step,due_at,source_json,members_json,baseline_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,cache,input.title,input.assignee,input.priority,'open',input.next_step,input.due_at,JSON.stringify(source),JSON.stringify(ids),JSON.stringify({total:baseline.total,requested_users:baseline.requested_users,unmatched_users:baseline.unmatched_users}),at,at)
  const task=get(id,owner);history(task,null,'创建任务并固定名单和指标',at);return {task,existing:false}
 });res.status(saved.existing?200:201).json({task:expose(saved.task),existing:saved.existing})
}))
router.get('/:id',(req,res,next)=>{try{const t=get(req.params.id,req.user.user_id);res.json({task:expose(t),history:db.prepare('SELECT * FROM operation_task_history WHERE task_id=? ORDER BY created_at DESC,id DESC').all(t.id).map(h=>({...h,before:h.before_json?JSON.parse(h.before_json):null,after:JSON.parse(h.after_json),before_json:undefined,after_json:undefined}))})}catch(e){next(e)}})
router.patch('/:id',async(req,res,next)=>{try{
 const t=get(req.params.id,req.user.user_id)
 if(req.body.expected_updated_at!==t.updated_at)fail('任务已被更新，请刷新后重试',409)
 const input=fields(req.body,t),note=req.body.result_note??''
 if(typeof note!=='string'||note.length>4000)fail('处理记录须为4000字以内文本')
 if(input.status==='done'&&t.status!=='done'&&!note.trim())fail('完成任务前请记录处理结果')
 const at=Math.max(Date.now(),t.updated_at+1)
 const saved=tx(()=>{const r=db.prepare('UPDATE operation_tasks SET title=?,assignee=?,priority=?,status=?,next_step=?,due_at=?,completed_at=?,updated_at=? WHERE id=? AND owner_id=? AND updated_at=?').run(input.title,input.assignee,input.priority,input.status,input.next_step,input.due_at,input.status==='done'?(t.completed_at??at):null,at,t.id,t.owner_id,t.updated_at);if(!r.changes)fail('任务已被更新，请刷新后重试',409);const current=get(t.id,t.owner_id);history(current,t,note.trim(),at);return current})
 const suggestionSync=await syncLinkedAISuggestions(saved,t.owner_id,note.trim());
 res.json({task:expose(saved),suggestionSync})
 }catch(e){next(e)}})

router.post('/:id/sync-ai-suggestions',wrap(async(req,res)=>{
 const task=get(req.params.id,req.user.user_id);
 const latest=db.prepare('SELECT note FROM operation_task_history WHERE task_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(task.id);
 const note=typeof req.body?.result_note==='string'?req.body.result_note:(latest?.note||'');
 const suggestionSync=await syncLinkedAISuggestions(task,String(req.user.user_id),note);
 res.json({task:expose(task),suggestionSync});
}));
router.get('/:id/audience',wrap(async(req,res)=>{
 const t=get(req.params.id,req.user.user_id),source=JSON.parse(t.source_json),s=await remote.status(),ids=JSON.parse(t.members_json).map(id=>'user:'+id)
 res.json({ids,count:ids.length,title:t.title,description:'运营任务固定名单 · 原始统计期，使用当前数据快照',start:source.start,end:source.end,source:source.source,snapshot_id:s.snapshot_id,as_of:s.as_of,fixed_at:new Date(t.created_at).toISOString(),origin:'operation-task'})
}))
router.get('/:id/review',wrap(async(req,res)=>{
 const t=get(req.params.id,req.user.user_id),s=await remote.status(),period={start:t.created_at,end:Math.min(Date.now()+1,Date.parse(s.as_of)+1)},ids=JSON.parse(t.members_json)
 if(period.end<=period.start)return res.json({pending:true,...period,as_of:s.as_of,performance:null,errors:{}})
 if(period.end-period.start>366*86400000)period.start=period.end-366*86400000
 const facts=await memberFacts(s,ids,period),performance=memberMetrics(facts,ids.map(id=>({id})),period,s)
 res.json({pending:false,...period,as_of:s.as_of,snapshot_id:s.snapshot_id,performance:performance?{total:performance.total,requested_users:performance.requested_users,unmatched_users:performance.unmatched_users}:null,errors:facts.errors})
}))
module.exports=router;
module.exports.syncLinkedAISuggestions=syncLinkedAISuggestions;
