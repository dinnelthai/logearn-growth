process.env.DB_PATH=':memory:';process.env.ANALYTICS_STORAGE='hologres'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),db=require('../src/db/connection'),fs=require('node:fs'),remote=require('../src/data/hologres'),jobs=require('../src/services/analysisJobs'),{syncLinkedAISuggestions}=require('../src/routes/operationTasks')
db.exec(fs.readFileSync(require('node:path').join(__dirname,'../src/db/schema.sql'),'utf8'))
let asof=Date.now(),calls=0,broken=false
remote.snapshot=async()=>({snapshot_id:'snap',snapshot_cutoff:new Date(asof).toISOString(),as_of:new Date(asof).toISOString()});remote.status=()=>remote.snapshot()
remote.query=async sql=>{calls++;if(broken)throw Error('source failed');if(sql.includes('SELECT account_id::text'))return [{account_id:'1'},{account_id:'2'}];if(sql.includes('SELECT event_id,SUBSTRING'))return [{event_id:'a',user_id:'1',t:asof-100}];return []}
const originalTime=Date.now()-1000
jobs.result=(id,owner)=>{if(owner!=='a')throw Object.assign(Error('private result'),{status:409});return {j:{snapshot:'snap',context:{mode:id==='wrong'?'funnel':'segments',start:originalTime-86400000,end:originalTime+1,source:'all',selection:{pool:'registered',filters:{task:'analysis_no_trade'},tags:[]}}},value:{lists:{all:id==='empty'?[]:id==='huge'?Array.from({length:5001},(_,i)=>'user:'+(i+1)):['user:1','user:2','user:1']},payload:{summary:{users:2}}}}}
const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={user_id:req.get('x-owner')||'a'};next()});app.use('/t',require('../src/routes/operationTasks'));app.use(require('../src/routes/userOperations'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);after(()=>{server.close();db.close()})
async function request(path,body,method=body===undefined?'GET':'POST',owner='a'){const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()}}
test('task creation uses only owner-scoped segment results and refuses empty, oversized or incomplete baselines',async()=>{
 const input={title:'followup',cache_id:'job'}
 assert.equal((await request('/t',input,'POST','b')).status,409);assert.equal(calls,0)
 assert.equal((await request('/t',{...input,cache_id:'wrong'})).status,400)
 assert.equal((await request('/t',{...input,cache_id:'empty'})).status,400)
 assert.equal((await request('/t',{...input,cache_id:'huge'})).status,422)
 broken=true;assert.equal((await request('/t',input)).status,503);broken=false
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM operation_tasks').get().n,0)
})
test('fixed roster and baseline survive task edits, completion, reopening and data refresh',async()=>{
 const r=await request('/t',{title:'fixed lead',cache_id:'job',assignee:'ops',next_step:'check blockers',due_at:0});assert.equal(r.status,201);const t=r.body.task,id=t.id
 assert.equal(t.member_count,2);assert.equal(t.baseline.total.users,2);assert.equal(t.source.conditions.filters.task,'analysis_no_trade')
 assert.equal(t.members_json,undefined);const baseline=JSON.stringify(t.baseline),source=JSON.stringify(t.source)
 const duplicate=await request('/t',{title:'changed client request',cache_id:'job'});assert.equal(duplicate.body.existing,true);assert.equal(duplicate.body.task.id,id)
 jobs.result=()=>{throw Object.assign(Error('original analysis expired'),{status:409})}
 assert.equal((await request('/t/'+id,undefined,'GET','b')).status,404)
 const update=await request('/t/'+id,{status:'in_progress',expected_updated_at:t.updated_at,result_note:'checked account'},'PATCH');assert.equal(update.status,200)
 const work=(await request('/api/workbench')).body;assert.equal(work.summary.group_due,1);assert.equal(work.summary.groups_open,1)
 assert.equal((await request('/t/'+id,{status:'done',expected_updated_at:t.updated_at,result_note:'stale'},'PATCH')).status,409)
 const newer=update.body.task
 assert.equal((await request('/t/'+id,{status:'done',expected_updated_at:newer.updated_at},'PATCH')).status,400)
 const done=await request('/t/'+id,{status:'done',expected_updated_at:newer.updated_at,result_note:'Help provided; watch return'},'PATCH');assert.equal(done.status,200);assert.ok(done.body.task.completed_at)
 assert.equal((await request('/api/workbench')).body.summary.group_due,0)
 const reopened=await request('/t/'+id,{status:'open',expected_updated_at:done.body.task.updated_at},'PATCH');assert.equal(reopened.status,200);assert.equal(reopened.body.task.completed_at,null)
 assert.equal(JSON.stringify(reopened.body.task.baseline),baseline);assert.equal(JSON.stringify(reopened.body.task.source),source)
 assert.equal((await request('/t/'+id)).body.history.length,4)
 const a=(await request('/t/'+id+'/audience')).body;assert.deepEqual(a.ids,['user:1','user:2']);assert.equal(a.start,t.source.start)
 asof=t.created_at-1;assert.equal((await request('/t/'+id+'/review')).body.pending,true)
 asof=Date.now()+1000;const reviewed=await request('/t/'+id+'/review');assert.equal(reviewed.status,200);assert.equal(reviewed.body.performance.total.users,2);assert.equal(reviewed.body.start,t.created_at)
 assert.equal((await request('/t/'+id+'/review',undefined,'GET','b')).status,404)
})

test('linked AI suggestion follows fixed operation task execution and records actual result',async()=>{
 const rows=new Map([['s-1',{id:'s-1',user_status:'adopted',action_scope:{source:'all'}}]]);
 const transitions=[];
 const records={
  async getSuggestion(id){return rows.get(id)||null},
  async transitionSuggestionStatus(id,owner,from,to,updates){
   const row=rows.get(id);if(!row||row.user_status!==from)return null;
   transitions.push({from,to,updates});
   const next={...row,user_status:to,...(to==='executed'?{
    actual_action:updates.actualAction,executed_at:updates.executedAt
   }:{})};
   rows.set(id,next);return next;
  }
 };
 const workspace={suggestionIdsForOperationTask:()=>['s-1']};
 const active=await syncLinkedAISuggestions({id:'task-1',status:'in_progress'},'alice','',{workspace,records});
 assert.equal(active.status,'complete');assert.equal(rows.get('s-1').user_status,'executing');
 const done=await syncLinkedAISuggestions({id:'task-1',status:'done',completed_at:123456},
  'alice','完成首次分析引导并记录用户反馈',{workspace,records});
 assert.equal(done.status,'complete');assert.equal(rows.get('s-1').user_status,'executed');
 assert.equal(rows.get('s-1').actual_action,'完成首次分析引导并记录用户反馈');
 assert.equal(rows.get('s-1').executed_at,123456);
 assert.deepEqual(transitions.map(x=>[x.from,x.to]),[['adopted','executing'],['executing','executed']]);
});
test('linked AI suggestion is not marked executed without a real completion note',async()=>{
 const rows=new Map([['s-2',{id:'s-2',user_status:'adopted'}]]);
 const records={async getSuggestion(id){return rows.get(id)},async transitionSuggestionStatus(){throw Error('must not transition')}};
 const result=await syncLinkedAISuggestions({id:'task-2',status:'done',completed_at:123},
  'alice','',{workspace:{suggestionIdsForOperationTask:()=>['s-2']},records});
 assert.equal(result.status,'partial');assert.equal(result.items[0].status,'needs-execution-note');
 assert.equal(rows.get('s-2').user_status,'adopted');
});

test('task update can report a retryable partial sync when link lookup fails',async()=>{
 const result=await syncLinkedAISuggestions({id:'task-3',status:'in_progress'},'alice','',{
  workspace:{suggestionIdsForOperationTask(){throw Error('workspace temporarily unavailable')}},
  records:{}
 });
 assert.equal(result.status,'partial');
 assert.equal(result.items[0].status,'link-lookup-failed');
});
