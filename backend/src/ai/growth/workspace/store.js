'use strict';
const {randomUUID}=require('node:crypto');
const {requiredString,scopeKey,key,normalizeEvidence,fingerprint,goalProgress,TYPES}=require('./contracts');
const {lastCompleted,currentMonth,dayStart}=require('./period');
const OK_STATUSES=['open','monitoring','resolved','dismissed'];
const safeJSON=(s,fallback=null)=>{try{return JSON.parse(s)}catch{return fallback}};
function workspaceStore(db,{clock=()=>Date.now(),initialize=false}={}){
 if(typeof db?.prepare!=='function')throw Error('需要可持久化的 SQLite 连接');
 const schema=`
 CREATE TABLE IF NOT EXISTS gw_goals(owner_id TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,metric_id TEXT NOT NULL,definition_version TEXT NOT NULL,target_value REAL NOT NULL,unit TEXT NOT NULL,direction TEXT NOT NULL,aggregation TEXT NOT NULL,period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,effective_at INTEGER NOT NULL,scope_json TEXT NOT NULL,constraints_json TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id,version));
 CREATE INDEX IF NOT EXISTS gw_goal_active_idx ON gw_goals(owner_id,effective_at,period_start,period_end);
 CREATE TABLE IF NOT EXISTS gw_evidence(owner_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id));
 CREATE INDEX IF NOT EXISTS gw_evidence_recent ON gw_evidence(owner_id,observed_at DESC);
 CREATE TABLE IF NOT EXISTS gw_problems(owner_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,type TEXT NOT NULL,subject TEXT NOT NULL,scope_json TEXT NOT NULL,goal_id TEXT,goal_version INTEGER,priority INTEGER NOT NULL,status TEXT NOT NULL,description TEXT NOT NULL,impact_json TEXT NOT NULL,next_step TEXT,assignee TEXT,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,last_evidence_hash TEXT,episode INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner_id,id));
 CREATE INDEX IF NOT EXISTS gw_problems_dedupe ON gw_problems(owner_id,fingerprint,status,last_seen);
 CREATE TABLE IF NOT EXISTS gw_problem_events(owner_id TEXT NOT NULL,id TEXT NOT NULL,problem_id TEXT NOT NULL,kind TEXT NOT NULL,evidence_json TEXT NOT NULL,details_json TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(owner_id,id));
 CREATE INDEX IF NOT EXISTS gw_problem_events_by_id ON gw_problem_events(owner_id,problem_id,at);
 CREATE TABLE IF NOT EXISTS gw_runs(owner_id TEXT NOT NULL,id TEXT NOT NULL,problem_id TEXT NOT NULL,state TEXT NOT NULL,mode TEXT NOT NULL,question_id TEXT,result_json TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id));
 CREATE TABLE IF NOT EXISTS gw_questions(owner_id TEXT NOT NULL,id TEXT NOT NULL,problem_id TEXT NOT NULL,run_id TEXT NOT NULL,prompt TEXT NOT NULL,reason TEXT NOT NULL,impact TEXT NOT NULL,blocking INTEGER NOT NULL,answer TEXT,answered_at INTEGER,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id));
 CREATE TABLE IF NOT EXISTS gw_actions(owner_id TEXT NOT NULL,id TEXT NOT NULL,problem_id TEXT NOT NULL,run_id TEXT,description TEXT NOT NULL,assignee TEXT NOT NULL,status TEXT NOT NULL,metric_id TEXT,definition_version TEXT,direction TEXT,baseline_json TEXT,executed_at INTEGER,observe_until INTEGER,review_json TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id));
 CREATE TABLE IF NOT EXISTS gw_operation_links(owner_id TEXT NOT NULL,problem_id TEXT NOT NULL,task_id TEXT NOT NULL,linked_at INTEGER NOT NULL,PRIMARY KEY(owner_id,problem_id,task_id));
 CREATE TABLE IF NOT EXISTS gw_problem_reviews(owner_id TEXT NOT NULL,problem_id TEXT NOT NULL,verdict TEXT NOT NULL,reason TEXT NOT NULL,reviewed_at INTEGER NOT NULL,PRIMARY KEY(owner_id,problem_id));
 CREATE TABLE IF NOT EXISTS gw_executive_workitems(owner_id TEXT NOT NULL,id TEXT NOT NULL,action_id TEXT NOT NULL,step TEXT NOT NULL,title TEXT NOT NULL,assignee TEXT NOT NULL,due_at INTEGER NOT NULL,status TEXT NOT NULL,evidence_id TEXT,completion_note TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,action_id,step));
 CREATE TABLE IF NOT EXISTS gw_executive_notices(owner_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,resource_id TEXT NOT NULL,due_at INTEGER NOT NULL,body_json TEXT NOT NULL,acknowledged_at INTEGER,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,kind,resource_id,due_at));
 CREATE INDEX IF NOT EXISTS gw_exec_notice_pending ON gw_executive_notices(owner_id,acknowledged_at,due_at);
 CREATE TABLE IF NOT EXISTS gw_reports(owner_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,period_start INTEGER NOT NULL,period_end INTEGER NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,kind,period_start,period_end,revision));
 `;
 if(initialize)db.exec(schema);
 const getNow=()=>{const now=clock();if(!Number.isSafeInteger(now))throw Error('时钟无效');return now};
 const ownerId=x=>requiredString(x,'owner',256);
 const fetch=(sql,...args)=>db.prepare(sql).get(...args);
 const all=(sql,...args)=>db.prepare(sql).all(...args);
 function inTx(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}}
 function goalRow(row){return row?{...row,scope:safeJSON(row.scope_json,{}),resources:safeJSON(row.constraints_json,{})}:null}
 function goalById(owner,id,version){ownerId(owner);requiredString(id,'目标标识');let row=version==null?fetch('SELECT * FROM gw_goals WHERE owner_id=? AND id=? ORDER BY version DESC LIMIT 1',owner,id):fetch('SELECT * FROM gw_goals WHERE owner_id=? AND id=? AND version=?',owner,id,version);return goalRow(row)}
 function saveGoal(owner,input){ownerId(owner);const now=getNow(),id=input?.id||randomUUID(),last=goalById(owner,id);
  const metric=requiredString(input?.metricId,'指标名',80),unit=requiredString(input?.unit,'单位',32),definition=requiredString(input?.definitionVersion,'指标定义版本',80);
  const kind=input.kind||'supporting',direction=input.direction||'increase',aggregation=input.aggregation||'snapshot';
  if(!['north','supporting'].includes(kind)||!['increase','decrease'].includes(direction)||!['sum','snapshot','rolling-distinct','ratio'].includes(aggregation))throw Error('目标语义无效');
  if(!Number.isFinite(input.target)||input.target<0||!Number.isSafeInteger(input.periodStart)||!Number.isSafeInteger(input.periodEnd)||input.periodStart>=input.periodEnd)throw Error('目标期间和值无效');
  if(input.periodStart!==dayStart(input.periodStart)||input.periodEnd!==dayStart(input.periodEnd))throw Error('目标期间须为曼谷日边界');
  const calendarMonth=currentMonth(input.periodStart);
  if(input.periodStart!==calendarMonth.start||input.periodEnd!==calendarMonth.end)throw Error('月目标必须使用完整的曼谷自然月');
  if(last&&input.expectedVersion!==last.version)throw Object.assign(Error('目标版本冲突'),{status:409});
  if(!last&&input.expectedVersion!=null)throw Object.assign(Error('目标不存在'),{status:409});
  if(last&&(last.metric_id!==metric||last.definition_version!==definition||last.period_start!==input.periodStart||last.period_end!==input.periodEnd))throw Error('修改指标定义或目标期必须创建新的目标');
  const effective=input.effectiveAt??now;
  if(!Number.isSafeInteger(effective)||effective>now||last&&effective<=last.effective_at)throw Error('目标生效时间必须严格晚于旧版且不能在未来');
  const version=last?last.version+1:1,scope=scopeKey(input.scope),resources=JSON.stringify(input.resources||{});
  if(resources.length>10000)throw Error('资源约束过长');
  return inTx(()=>{db.prepare(`INSERT INTO gw_goals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(owner,id,version,metric,definition,input.target,unit,direction,aggregation,input.periodStart,input.periodEnd,effective,scope,resources,kind,now);return goalById(owner,id,version)});
 }
 function listGoals(owner,{asOf=getNow(),start=null,end=null,versions=false}={}){ownerId(owner);
  if(!Number.isSafeInteger(asOf))throw Error('目标时间无效');
  let rows=all('SELECT * FROM gw_goals WHERE owner_id=? AND effective_at<=? ORDER BY id,version DESC',owner,asOf);
  if(start!=null&&end!=null)rows=rows.filter(r=>r.period_start<end&&r.period_end>start);
  if(!versions){const found=new Set();rows=rows.filter(r=>{if(found.has(r.id))return false;found.add(r.id);return true})}
  return rows.map(goalRow)
 }
 function saveEvidence(owner,input){ownerId(owner);const e=normalizeEvidence(input);if(e.originalLocator&&JSON.stringify(e.originalLocator).length>600)throw Error('证据定位过长');
  const payload=JSON.stringify(e);if(payload.length>20000)throw Error('证据内容过长');
  return inTx(()=>{const prior=fetch('SELECT payload FROM gw_evidence WHERE owner_id=? AND id=?',owner,e.id);if(prior&&prior.payload!==payload)throw Object.assign(Error('证据 ID 已固定，不允许静默覆盖'),{status:409});if(!prior)db.prepare('INSERT INTO gw_evidence VALUES(?,?,?,?)').run(owner,e.id,payload,e.observedAt);return e})
 }
 function getEvidence(owner,id){ownerId(owner);let r=fetch('SELECT payload FROM gw_evidence WHERE owner_id=? AND id=?',owner,requiredString(id,'证据标识'));return r?safeJSON(r.payload):null}
 function progress(owner,goalId,{at=getNow(),evidenceId=null}={}){ownerId(owner);const goals=listGoals(owner,{asOf:at}),goal=goals.find(g=>g.id===goalId);if(!goal)return {status:'no-goal',observed:null,delta:null};
  let evidence=evidenceId?getEvidence(owner,evidenceId):null;
  // Page reads never refresh metrics or write evidence. Find a compatible
  // persisted observation scoped to this owner and this goal version.
  if(!evidence&&!evidenceId){
   const rows=all("SELECT payload FROM gw_evidence WHERE owner_id=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 200",owner,at);
   for(const row of rows){
    const candidate=safeJSON(row.payload);
    if(candidate?.metricId!==goal.metric_id)continue;
    const result=goalProgress(goal,candidate,at);
    if(result.status==='verified'||result.status==='partial'){evidence=candidate;break}
   }
  }
  return {goal,progress:goalProgress(goal,evidence,at)}
 }
 // Dashboard batch read: reuse the one owner-scoped 200-evidence window for
 // all current goals instead of repeating listGoals + JSON parsing per goal.
 // Match the exact same first verified/partial observation as progress().
 function dashboardGoals(owner,{start,end,at=getNow()}={}){
  const goals=listGoals(owner,{asOf:at,start,end});
  if(!goals.length)return [];
  const rows=all("SELECT payload FROM gw_evidence WHERE owner_id=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 200",owner,at);
  const byMetric=new Map();
  for(const row of rows){
   const evidence=safeJSON(row.payload);
   if(!evidence||typeof evidence.metricId!=='string')continue;
   if(!byMetric.has(evidence.metricId))byMetric.set(evidence.metricId,[]);
   byMetric.get(evidence.metricId).push(evidence);
  }
  return goals.map(goal=>{
   let evidence=null;
   for(const candidate of byMetric.get(goal.metric_id)||[]){
    const result=goalProgress(goal,candidate,at);
    if(result.status==='verified'||result.status==='partial'){
     evidence=candidate;
     break;
    }
   }
   return {goal,progress:goalProgress(goal,evidence,at)};
  });
 }
 function problemRow(r){return r?{...r,scope:safeJSON(r.scope_json,{}),impact:safeJSON(r.impact_json,{status:'unknown'})}:null}
 function problem(owner,id){ownerId(owner);return problemRow(fetch('SELECT * FROM gw_problems WHERE owner_id=? AND id=?',owner,id))}
 function problems(owner,{status=null,limit=50}={}){ownerId(owner);if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('列表限制无效');
  return all('SELECT * FROM gw_problems WHERE owner_id=? '+(status?'AND status=? ':'')+'ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'monitoring\' THEN 1 ELSE 2 END,priority DESC,last_seen DESC LIMIT ?',...(status?[owner,status,limit]:[owner,limit])).map(problemRow)
 }
 function logProblem(owner,id,kind,evidenceIds,details,at){db.prepare('INSERT INTO gw_problem_events VALUES(?,?,?,?,?,?,?)').run(owner,randomUUID(),id,kind,JSON.stringify(evidenceIds||[]),JSON.stringify(details||{}),at)}
 function observeProblem(owner,input,{allowCreate=true}={}){ownerId(owner);const now=getNow(),type=requiredString(input.type,'问题类型');if(!TYPES.has(type))throw Error('未知问题类型');
  const subject=requiredString(input.subject,'问题对象'),scope=scopeKey(input.scope),scopeObj=JSON.parse(scope);
  const idKey=fingerprint({type,subject,scope:scopeObj,metricId:input.metricId||null,goalId:input.goalId||null});
  const ids=Array.isArray(input.evidenceIds)?[...new Set(input.evidenceIds)].slice(0,30):[];
  for(const id of ids)if(!getEvidence(owner,id))throw Object.assign(Error('证据不存在或不属于当前用户'),{status:404});
  const evidenceDigest=key([ids,input.description||'',input.impact||{status:'unknown'}]);
  const priority=Number.isInteger(input.priority)?input.priority:2;if(priority<1||priority>5)throw Error('优先级必须在1到5之间');
  const description=requiredString(input.description||subject,'问题描述',2000),nextStep=(input.nextStep||'').slice(0,1000);
  const goalVersion=input.goalVersion??null;
  if(input.goalId&&goalVersion&&!goalById(owner,input.goalId,goalVersion))throw Error('目标版本无效');
  return inTx(()=>{
   const existing=fetch("SELECT * FROM gw_problems WHERE owner_id=? AND fingerprint=? AND status IN('open','monitoring') ORDER BY first_seen DESC LIMIT 1",owner,idKey);
   if(existing){db.prepare('UPDATE gw_problems SET last_seen=?,priority=?,last_evidence_hash=? WHERE owner_id=? AND id=?').run(now,priority,evidenceDigest,owner,existing.id);
    if(existing.last_evidence_hash!==evidenceDigest)logProblem(owner,existing.id,'evidence-updated',ids,{description,nextStep},now);
    return {...problem(owner,existing.id),created:false,changed:existing.last_evidence_hash!==evidenceDigest};}
   if(!allowCreate)return {skipped:true,subject};
   const id=randomUUID();const episode=(fetch('SELECT MAX(episode) n FROM gw_problems WHERE owner_id=? AND fingerprint=?',owner,idKey)?.n||0)+1;
   db.prepare('INSERT INTO gw_problems VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(owner,id,idKey,type,subject,scope,input.goalId||null,goalVersion,priority,'open',description,JSON.stringify(input.impact||{status:'unknown'}),nextStep,input.assignee||null,now,now,evidenceDigest,episode);
   logProblem(owner,id,'created',ids,{description,nextStep},now);return {...problem(owner,id),created:true,changed:true}
  });
 }
 function setProblemStatus(owner,id,status,{reason='',expectedStatus=null}={}){ownerId(owner);if(!OK_STATUSES.includes(status))throw Error('问题状态无效');
  return inTx(()=>{const p=problem(owner,id);if(!p)throw Object.assign(Error('问题不存在'),{status:404});if(expectedStatus&&p.status!==expectedStatus)throw Object.assign(Error('状态冲突'),{status:409});
   if(p.status===status)return p;
   db.prepare('UPDATE gw_problems SET status=?,last_seen=? WHERE owner_id=? AND id=?').run(status,getNow(),owner,id);
   logProblem(owner,id,'status-changed',[],{from:p.status,to:status,reason},getNow());return problem(owner,id)})}
 function problemEvents(owner,id){if(!problem(owner,id))throw Error('问题不存在');return all('SELECT * FROM gw_problem_events WHERE owner_id=? AND problem_id=? ORDER BY at,id',owner,id).map(x=>({...x,evidenceIds:safeJSON(x.evidence_json,[]),details:safeJSON(x.details_json,{})}))}
 function startRun(owner,problemId,{mode='manual'}={}){ownerId(owner);if(!['manual','executive-readonly'].includes(mode))throw Error('调查模式不允许');if(!problem(owner,problemId))throw Object.assign(Error('问题不存在'),{status:404});
  return inTx(()=>{const existing=fetch("SELECT id FROM gw_runs WHERE owner_id=? AND problem_id=? AND state IN('queued','running','waiting_input') ORDER BY created_at DESC LIMIT 1",owner,problemId);
   if(existing)return {...run(owner,existing.id),reused:true};
   const now=getNow(),id=randomUUID();db.prepare('INSERT INTO gw_runs VALUES(?,?,?,?,?,?,?,?,?)').run(owner,id,problemId,'queued',mode,null,null,now,now);return run(owner,id)})}
 function run(owner,id){ownerId(owner);const r=fetch('SELECT * FROM gw_runs WHERE owner_id=? AND id=?',owner,id);return r?{...r,result:safeJSON(r.result_json)}:null}
 function ask(owner,runId,input){const r=run(owner,runId);if(!r||!['queued','running'].includes(r.state))throw Error('调查不允许提问');
  const question=requiredString(input.question,'业务提问',1500),reason=requiredString(input.reason,'提问原因',1000),impact=requiredString(input.impact,'答案影响',1000),blocking=input.blocking===true;
  const now=getNow(),existing=fetch('SELECT * FROM gw_questions WHERE owner_id=? AND run_id=? AND prompt=?',owner,runId,question);
  if(existing)return {...existing,reused:true};
  const id=randomUUID();return inTx(()=>{db.prepare('INSERT INTO gw_questions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(owner,id,r.problem_id,runId,question,reason,impact,Number(blocking),null,null,now);
    if(blocking)db.prepare("UPDATE gw_runs SET state='waiting_input',question_id=?,updated_at=? WHERE owner_id=? AND id=?").run(id,now,owner,runId);
    return fetch('SELECT * FROM gw_questions WHERE owner_id=? AND id=?',owner,id)})}
 function answer(owner,questionId,text){ownerId(owner);const response=requiredString(text,'答复',4000),now=getNow();return inTx(()=>{const q=fetch('SELECT * FROM gw_questions WHERE owner_id=? AND id=?',owner,questionId);
  if(!q)throw Object.assign(Error('提问不存在'),{status:404});if(q.answered_at!==null){if(q.answer===response)return {status:'already-answered',run:run(owner,q.run_id)};throw Object.assign(Error('提问已有不同回答'),{status:409})}
  db.prepare('UPDATE gw_questions SET answer=?,answered_at=? WHERE owner_id=? AND id=?').run(response,now,owner,questionId);
  if(q.blocking){const changed=db.prepare("UPDATE gw_runs SET state='queued',question_id=NULL,updated_at=? WHERE owner_id=? AND id=? AND state='waiting_input' AND question_id=?").run(now,owner,q.run_id,questionId);
   if(!changed.changes)throw Object.assign(Error('调查已取消或状态变化'),{status:409});}
  return {status:'answered',run:run(owner,q.run_id)} })}
 function cancelRun(owner,id){ownerId(owner);const n=db.prepare("UPDATE gw_runs SET state='cancelled',updated_at=? WHERE owner_id=? AND id=? AND state IN('queued','running','waiting_input')").run(getNow(),owner,id).changes;return {cancelled:n>0}}
 function finishRun(owner,id,result){const r=run(owner,id);if(!r||!['queued','running'].includes(r.state))throw Error('调查已结束或等待回答');
  if(!result||typeof result!=='object'||!Array.isArray(result.evidenceIds))throw Error('缺少结构化研究结果');
  for(const e of result.evidenceIds)if(!getEvidence(owner,e))throw Error('调查引用了无权访问的证据');
  const v={evidenceIds:result.evidenceIds,facts:result.facts||[],hypotheses:result.hypotheses||[],recommendations:result.recommendations||[],unknowns:result.unknowns||[]};
  db.prepare("UPDATE gw_runs SET state='completed',result_json=?,updated_at=? WHERE owner_id=? AND id=?").run(JSON.stringify(v),getNow(),owner,id);return run(owner,id)}
 // Internal scheduler only: on the exact same evidence window an already
 // completed investigation is reused. User HTTP routes can start manual only.
 function executiveInvestigationStart(owner,problemId,sourceEvidenceId){
  ownerId(owner);
  if(!problem(owner,problemId))throw Object.assign(Error('经营问题不存在'),{status:404});
  if(!getEvidence(owner,sourceEvidenceId))throw Object.assign(Error('调查来源证据不存在'),{status:404});
  const rows=all("SELECT * FROM gw_runs WHERE owner_id=? AND problem_id=? ORDER BY created_at DESC LIMIT 20",owner,problemId);
  const prior=rows.find(r=>r.mode==='executive-readonly'&&
   ['completed','running','queued'].includes(r.state)&&
   safeJSON(r.result_json)?.sourceEvidenceId===sourceEvidenceId);
  if(prior)return {...run(owner,prior.id),reused:true};
  // An active manual review is not hijacked by the scheduler.
  if(rows.some(r=>['queued','running','waiting_input'].includes(r.state)))return {status:'busy',reused:true};
  const created=startRun(owner,problemId,{mode:'executive-readonly'});
  db.prepare("UPDATE gw_runs SET state='running',result_json=? WHERE owner_id=? AND id=? AND mode='executive-readonly'")
   .run(JSON.stringify({sourceEvidenceId,version:'executive-investigation-v1',state:'running'}),owner,created.id);
  return {...run(owner,created.id),reused:false};
 }
 function executiveInvestigationFinish(owner,id,input,{verifyExternalEvidence}={}){
  const row=run(owner,id);
  if(!row||row.mode!=='executive-readonly'||row.state!=='running')throw Object.assign(Error('自动调查状态不允许提交'),{status:409});
  if(typeof verifyExternalEvidence!=='function')throw Error('缺少只读证据身份校验');
  const snapshotId=requiredString(input?.sourceEvidenceId,'调查源',256);
  if(snapshotId!==row.result?.sourceEvidenceId||!getEvidence(owner,snapshotId))throw Error('调查快照不匹配');
  const steps=Array.isArray(input.steps)?input.steps:[];
  if(steps.length>4||steps.some(x=>typeof x.moduleId!=='string'||x.moduleId.length>80||
   !['ok','unavailable','blocked'].includes(x.status)))throw Error('调查结果不可验证');
  const ids=[...new Set((input.evidenceIds||[]).slice(0,20))];
  if(ids.some(x=>typeof x!=='string'||!x||!verifyExternalEvidence(owner,x)))throw Error('调查引用了未授权的外部证据');
  const summary={version:'executive-investigation-v1',sourceEvidenceId:snapshotId,
   status:steps.length&&steps.every(x=>x.status==='ok')?'evidence-collected':'partial',
   steps:steps.map(x=>({moduleId:x.moduleId,status:x.status})),agentEvidenceIds:ids,
   hypotheses:[
    {kind:'acquisition-mix',status:'unverified'},
    {kind:'activation-friction',status:'unverified'},
    {kind:'tracking-quality',status:'unverified'}],
   decision:'仅记录已授权调查能力的真实状态；没有跨源可验证归因，不自动采纳行动',
   modelCalls:0,paidCalls:0,externalActions:0};
  db.prepare("UPDATE gw_runs SET state='completed',result_json=?,updated_at=? WHERE owner_id=? AND id=? AND mode='executive-readonly' AND state='running'")
   .run(JSON.stringify(summary),getNow(),owner,id);
  return run(owner,id);
 }
 function executiveInvestigationFail(owner,id){
  const row=run(owner,id);
  if(!row||row.mode!=='executive-readonly'||row.state!=='running')return {status:'not-running'};
  db.prepare("UPDATE gw_runs SET state='failed',result_json=?,updated_at=? WHERE owner_id=? AND id=? AND state='running'")
   .run(JSON.stringify({version:'executive-investigation-v1',status:'source-unavailable',
     sourceEvidenceId:row.result?.sourceEvidenceId||null,
     caution:'不能根据失败或缺失证据判断业务原因',modelCalls:0,paidCalls:0}),getNow(),owner,id);
  return run(owner,id);
 }
 // Internal delivery is persisted but never claims an external webhook was sent.

 function workItems(owner,{actionId=null,limit=50}={}){
  ownerId(owner);
  if(!fetch("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='gw_executive_workitems'"))return [];
  if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('任务数量不合法');
  return all("SELECT * FROM gw_executive_workitems WHERE owner_id=? "+
   (actionId?"AND action_id=? ":"")+"ORDER BY due_at LIMIT ?",
   ...(actionId?[owner,actionId,limit]:[owner,limit]));
 }
 function ensureExecutiveWorkItems(owner,actionId){
  const a=action(owner,actionId);
  if(!a||!['accepted','executing','executed'].includes(a.status))return [];
  if(!fetch("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='gw_executive_workitems'"))return [];
  const steps=[['verify-evidence','核对业务证据及待验证假设',1],
   ['prepare-execution','准备运营交付方案',2],
   ['record-outcome','记录执行事实及观察结果',4]];
  const existing=workItems(owner,{actionId});
  const stmt=db.prepare("INSERT OR IGNORE INTO gw_executive_workitems(owner_id,id,action_id,step,title,assignee,due_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
  for(let i=0;i<steps.length;i++){
   const [step,title,days]=steps[i];if(existing.some(x=>x.step===step))continue;
   stmt.run(owner,randomUUID(),actionId,step,title,a.assignee,a.updated_at+days*86400000,
    i===0?'ready':'blocked',getNow(),getNow());
  }
  return workItems(owner,{actionId});
 }
 function completeExecutiveWorkItem(owner,id,{note='',evidenceId=null}={}){
  ownerId(owner);requiredString(id,'待办ID');
  const row=workItems(owner,{limit:200}).find(x=>x.id===id);
  if(!row)throw Object.assign(Error('待办不存在或无权访问'),{status:404});
  if(row.status==='completed')return {...row,reused:true};
  if(row.status!=='ready')throw Object.assign(Error('前置任务未完成'),{status:409});
  const evidence=evidenceId?getEvidence(owner,evidenceId):null;
  if(['verify-evidence','record-outcome'].includes(row.step)&&!evidence)throw Error('请提供真实的已保存指标证据');
  if(row.step==='prepare-execution'&&!String(note).trim())throw Error('交付方案不能为空');
  db.prepare("UPDATE gw_executive_workitems SET status='completed',evidence_id=?,completion_note=?,updated_at=? WHERE owner_id=? AND id=? AND status='ready'")
   .run(evidence?.id||null,String(note).slice(0,1000),getNow(),owner,id);
  const steps=['verify-evidence','prepare-execution','record-outcome'];
  const next=steps[steps.indexOf(row.step)+1];
  if(next)db.prepare("UPDATE gw_executive_workitems SET status='ready',updated_at=? WHERE owner_id=? AND action_id=? AND step=? AND status='blocked'")
   .run(getNow(),owner,row.action_id,next);
  return workItems(owner,{actionId:row.action_id}).find(x=>x.id===id);
 }
 function executiveReminders(owner,{at=getNow(),record=false}={}){
  ownerId(owner);
  if(!Number.isSafeInteger(at)||at<0)throw Error('提醒时间无效');
  const acts=actions(owner,{limit:200}),due=[];
  const day=86400000;
  for(const a of acts){
   let kind=null,dueAt=null;
   if(a.status==='proposed'){kind='approval';dueAt=a.created_at+day;}
   if(a.status==='accepted'){kind='accepted-not-started';dueAt=a.updated_at+2*day;}
   if(a.status==='executing'){kind='execution-stalled';dueAt=a.updated_at+3*day;}
   if(a.status==='executed'&&!a.review&&Number.isSafeInteger(a.observe_until)){
    kind='review-due';dueAt=a.observe_until;
   }
   if(kind&&dueAt<=at)due.push({kind,resourceId:a.id,dueAt,
    body:{problemId:a.problem_id,status:a.status,assignee:a.assignee,
     description:a.description.slice(0,250)}});
  }
  const hasTasks=fetch("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='operation_tasks'");
  if(hasTasks){
   const tasks=all("SELECT id,title,assignee,due_at FROM operation_tasks WHERE owner_id=? AND status!='done' AND due_at<=? ORDER BY due_at LIMIT 30",owner,at);
   for(const task of tasks)due.push({kind:'task-overdue',resourceId:task.id,dueAt:task.due_at,
    body:{title:task.title,assignee:task.assignee}});
  }
  for(const row of workItems(owner,{limit:200}).filter(x=>x.status==='ready'&&x.due_at<=at))
   due.push({kind:'workitem-overdue',resourceId:row.id,dueAt:row.due_at,
    body:{title:row.title,assignee:row.assignee}});
  const hasNotice=fetch("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='gw_executive_notices'");
  if(record&&!hasNotice)throw Error('经营通知表未迁移，不能虚报持久提醒');
  if(record){
   const insert=db.prepare("INSERT OR IGNORE INTO gw_executive_notices(owner_id,id,kind,resource_id,due_at,body_json,created_at) VALUES(?,?,?,?,?,?,?)");
   for(const item of due){
    const id=key([owner,item.kind,item.resourceId,item.dueAt]);
    insert.run(owner,id,item.kind,item.resourceId,item.dueAt,JSON.stringify(item.body),at);
   }
  }
  const pending=hasNotice?all("SELECT id,kind,resource_id,due_at,body_json,created_at FROM gw_executive_notices WHERE owner_id=? AND acknowledged_at IS NULL ORDER BY due_at ASC LIMIT 50",owner)
   .map(row=>({id:row.id,kind:row.kind,resourceId:row.resource_id,dueAt:row.due_at,
    body:safeJSON(row.body_json,{}),createdAt:row.created_at})):[];
  return {version:'executive-reminder-v1',due:due.length,pending,
   delivery:'in-app-only',externalDeliveries:0};
 }
 function acknowledgeExecutiveNotice(owner,id){
  ownerId(owner);
  requiredString(id,'提醒ID');
  const has=fetch("SELECT 1 n FROM sqlite_master WHERE type='table' AND name='gw_executive_notices'");
  if(!has)throw Object.assign(Error('通知存储尚未迁移'),{status:503});
  const result=db.prepare("UPDATE gw_executive_notices SET acknowledged_at=? WHERE owner_id=? AND id=? AND acknowledged_at IS NULL").run(getNow(),owner,id);
  if(!result.changes&&!fetch("SELECT 1 n FROM gw_executive_notices WHERE owner_id=? AND id=?",owner,id))
   throw Object.assign(Error('提醒不存在'),{status:404});
  return {acknowledged:true,changed:result.changes===1};
 }
 function executiveLearning(owner){
  ownerId(owner);
  const reviewed=actions(owner,{limit:200}).filter(x=>x.status==='executed'&&x.review);
  const outcome={observedImprovement:0,observedDecline:0,noObservedChange:0,
   insufficientEvidence:0};
  const lessons=[];
  for(const row of reviewed){
   const status=row.review?.outcome;
   if(status==='observed-improvement')outcome.observedImprovement++;
   else if(status==='observed-decline')outcome.observedDecline++;
   else if(status==='no-observed-change')outcome.noObservedChange++;
   else outcome.insufficientEvidence++;
   if(lessons.length<8)lessons.push({actionId:row.id,metricId:row.metric_id,
    outcome:status||'insufficient-evidence',reviewedAt:row.review.reviewedAt||null,
    causalityProven:false});
  }
  return {version:'executive-learning-v1',reviewed:reviewed.length,...outcome,lessons,
   guidance:'观察性复盘只能影响下一步的调查注意力；不能自动声称增量、ROI或因果，也不能自动更改KPI'};
 }
 function createAction(owner,problemId,input){const p=problem(owner,problemId);if(!p)throw Error('问题不存在');const desc=requiredString(input.description,'行动建议',1500),assignee=requiredString(input.assignee,'负责人',120),id=randomUUID(),now=getNow();
  db.prepare('INSERT INTO gw_actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(owner,id,problemId,input.runId||null,desc,assignee,'proposed',input.metricId||null,input.definitionVersion||null,input.direction||null,null,null,null,null,now,now);return action(owner,id)}
 // An internal investigation draft only. A repeated scan cannot spawn
 // duplicate actions, and no scan may approve or execute one.
 function proposeActionOnce(owner,problemId,input){
  ownerId(owner);
  if(!problem(owner,problemId))throw Object.assign(Error('问题不存在或无权访问'),{status:404});
  const description=requiredString(input?.description,'行动描述',1500);
  const assignee=requiredString(input?.assignee,'负责人',120);
  const metric=input?.metricId||null,definition=input?.definitionVersion||null;
  return inTx(()=>{
   const prior=fetch('SELECT id FROM gw_actions WHERE owner_id=? AND problem_id=? AND description=? ORDER BY created_at DESC LIMIT 1',owner,problemId,description);
   if(prior)return {...action(owner,prior.id),reused:true};
   const id=randomUUID(),now=getNow();
   db.prepare('INSERT INTO gw_actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(owner,id,problemId,null,
    description,assignee,'proposed',metric,definition,input?.direction||null,
    null,null,null,null,now,now);
   return {...action(owner,id),reused:false};
  });
 }
 function executiveQueue(owner,{at=getNow()}={}){
  ownerId(owner);
  if(!Number.isSafeInteger(at)||at<0)throw Error('经营看板时间无效');
  const month=currentMonth(at);
  const northStar=listGoals(owner,{asOf:at,start:month.start,end:month.end})
   .find(g=>g.metric_id==='active_users'&&g.definition_version==='1'&&g.kind==='north'&&g.scope?.source==='all');
  const open=problems(owner,{limit:200}).filter(p=>['open','monitoring'].includes(p.status));
  const acts=actions(owner,{limit:200});
  const observations=all('SELECT payload FROM gw_evidence WHERE owner_id=? ORDER BY observed_at DESC LIMIT 200',owner)
   .map(row=>safeJSON(row.payload)).filter(e=>e?.metricId==='active_users'&&
    e.source==='hologres-north-star'&&e.scope?.source==='all'&&
    e.state==='verified'&&Number.isSafeInteger(e.period?.end))
   .sort((a,b)=>b.period.end-a.period.end);
  const mostRecent=observations[0]||null;
  const awaiting=acts.filter(a=>a.status==='proposed');
  const dueReviews=acts.filter(a=>a.status==='executed'&&!a.review&&
   Number.isSafeInteger(a.observe_until)&&a.observe_until<=at);
  // Existing fixed-audience tasks remain owned by the operation task system.
  // Never interpret a task's completion as an executed AI suggestion.
  const hasTasks=fetch("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name='operation_tasks'");
  const overdueTasks=hasTasks?all("SELECT id,title,status,assignee,due_at FROM operation_tasks WHERE owner_id=? AND status!='done' AND due_at IS NOT NULL AND due_at<? ORDER BY due_at ASC LIMIT 20",owner,at):[];
  const priorities=open.slice().sort((a,b)=>b.priority-a.priority||a.first_seen-b.first_seen)
   .slice(0,5).map(p=>({id:p.id,type:p.type,subject:p.subject,priority:p.priority,status:p.status,
    nextStep:p.next_step,firstSeenAt:p.first_seen,lastSeenAt:p.last_seen}));
  return {version:'growth-executive-queue-v1',
   northStar:{metricId:'active_users',unit:'users',definitionVersion:'1',
    goalId:northStar?.id||null,target:northStar?.target_value??null,
    targetStatus:northStar?'workspace-configured':'not-configured',
    note:'只统计报告期筹码峰查看/下钻的去重用户；交易是独立结果'},
   latestVerifiedNorthStar:mostRecent?{value:mostRecent.value,period:mostRecent.period,evidenceId:mostRecent.id}:null,
   priorities,unresolvedProblems:open.length,waitingApproval:awaiting.length,
   awaitingApproval:awaiting.slice(0,8).map(a=>({id:a.id,problemId:a.problem_id,description:a.description,assignee:a.assignee})),
   reviewsDue:dueReviews.slice(0,8).map(a=>({id:a.id,problemId:a.problem_id,observeUntil:a.observe_until})),
   overdueTasks:overdueTasks.map(t=>({id:t.id,title:t.title,assignee:t.assignee,dueAt:t.due_at,status:t.status})),
   workItems:workItems(owner,{limit:30}).map(x=>({id:x.id,actionId:x.action_id,title:x.title,step:x.step,status:x.status,assignee:x.assignee,dueAt:x.due_at})),
   learning:executiveLearning(owner),
   portfolio:require('./executivePortfolio').opportunityPortfolio(owner,{problems,problemEvents,getEvidence,executiveLearning}),
   goalAlignment:require('./executivePortfolio').goalAlignment(
    listGoals(owner,{asOf:at,start:month.start,end:month.end}),null),
   reminders:executiveReminders(owner,{at,record:false}),
   requiresHumanApproval:true,automaticExternalActions:0,modelCalls:0};
 }
 function action(owner,id){ownerId(owner);const a=fetch('SELECT * FROM gw_actions WHERE owner_id=? AND id=?',owner,id);return a?{...a,baseline:safeJSON(a.baseline_json),review:safeJSON(a.review_json)}:null}
 function actions(owner,{limit=50}={}){ownerId(owner);return all('SELECT * FROM gw_actions WHERE owner_id=? ORDER BY created_at DESC LIMIT ?',owner,Math.max(1,Math.min(200,limit))) .map(r=>({...r,baseline:safeJSON(r.baseline_json),review:safeJSON(r.review_json)}))}
 function updateAction(owner,id,next,{actualAction=null,baselineEvidenceId=null,observeUntil=null}={}){const a=action(owner,id),transitions={proposed:['accepted','rejected'],accepted:['executing','rejected'],executing:['executed','rejected'],executed:[]};
  if(!a)throw Error('行动不存在');if(!transitions[a.status]?.includes(next))throw Object.assign(Error('行动状态不允许直接跳转'),{status:409});
  if(next==='executed'&&(!actualAction||!baselineEvidenceId||!Number.isSafeInteger(observeUntil)||observeUntil<=getNow()))throw Error('执行完成需行动事实、基线和未来观察期限');
  const e=baselineEvidenceId?getEvidence(owner,baselineEvidenceId):null;if(baselineEvidenceId&&!e)throw Error('基线证据不存在或无权访问');
  db.prepare('UPDATE gw_actions SET status=?,baseline_json=COALESCE(?,baseline_json),executed_at=COALESCE(?,executed_at),observe_until=COALESCE(?,observe_until),updated_at=? WHERE owner_id=? AND id=?').run(next,e?JSON.stringify({evidence:e,actualAction}):null,next==='executed'?getNow():null,observeUntil,getNow(),owner,id);return action(owner,id)}
 function reviewAction(owner,id,{afterEvidenceId,confounders=[]}={}){const a=action(owner,id);if(!a||a.status!=='executed'||a.review)return {status:'not-reviewable'};
  if(getNow()<a.observe_until)return {status:'immature',observed:null};
  const after=getEvidence(owner,afterEvidenceId),base=a.baseline?.evidence;
  let outcome='insufficient-evidence',delta=null;
  if(after&&base&&after.state==='verified'&&base.state==='verified'&&after.definitionVersion===base.definitionVersion&&
   after.metricId===base.metricId&&after.unit===base.unit&&
   scopeKey(after.scope)===scopeKey(base.scope)&&
   after.period.timezone===base.period.timezone&&
   after.period.start>=base.period.end&&after.period.end<=getNow()&&
   typeof after.value==='number'&&typeof base.value==='number'){
   delta=after.value-base.value;
   const improved=a.direction==='decrease'?delta<0:delta>0;
   outcome=improved?'observed-improvement':delta===0?'no-observed-change':'observed-decline';
  }
  const review={outcome,delta,baselineEvidenceId:base?.id??null,afterEvidenceId:after?.id??null,confounders:confounders.slice(0,15),causalityEstablished:false,reviewedAt:getNow()};
  db.prepare('UPDATE gw_actions SET review_json=?,updated_at=? WHERE owner_id=? AND id=? AND review_json IS NULL').run(JSON.stringify(review),getNow(),owner,id);return review}
 function report(owner,kind,{now=getNow(),revision=null}={}){ownerId(owner);const period=lastCompleted(kind,now);const p=revision==null?fetch('SELECT * FROM gw_reports WHERE owner_id=? AND kind=? AND period_start=? AND period_end=? ORDER BY revision DESC LIMIT 1',owner,kind,period.start,period.end):fetch('SELECT * FROM gw_reports WHERE owner_id=? AND kind=? AND period_start=? AND period_end=? AND revision=?',owner,kind,period.start,period.end,revision);return p?{...p,snapshot:safeJSON(p.snapshot_json)}:null}
 function buildReport(owner,kind,{now=getNow(),publish=false,forceRevision=false}={}){ownerId(owner);const period=lastCompleted(kind,now);return inTx(()=>{
  const existing=report(owner,kind,{now});if(existing&&existing.status==='published'&&!forceRevision)return existing;
  const rev=forceRevision?(existing?.revision||0)+1:(existing?.revision||1);
  if(forceRevision&&!existing)throw Error('没有现存报表可修订');
  const goals=listGoals(owner,{asOf:period.end-1,start:period.start,end:period.end,versions:true});
  const open=problems(owner,{limit:200}).filter(p=>p.first_seen<period.end&&['open','monitoring'].includes(p.status));
  const events=all('SELECT DISTINCT problem_id FROM gw_problem_events WHERE owner_id=? AND at>=? AND at<?',owner,period.start,period.end).map(r=>r.problem_id);
  const acts=actions(owner,{limit:200}).filter(a=>a.created_at<period.end);
  const sourceStates=[...new Set(open.filter(x=>x.type==='data-quality').map(x=>x.subject))];
  const snapshot={version:'growth-workspace-v1',period,goalVersions:goals.map(g=>({id:g.id,version:g.version,metricId:g.metric_id,effectiveAt:g.effective_at,target:g.target_value})),
   problemIds:[...new Set([...open.map(x=>x.id),...events])],newProblemIds:events,actionIds:acts.map(a=>a.id),
   unresolvedDataIssues:sourceStates,quality:{sourceCompleteness:'not-verified',causalClaims:false},
   message:events.length?'本周期存在新增或更新的问题':'没有新的重要发现（仅指已观测的输入；未接入渠道无法判断）',
   createdAt:getNow(),facts:[],hypotheses:[],recommendations:[]};
  const id=randomUUID();if(existing&&!forceRevision){db.prepare('UPDATE gw_reports SET snapshot_json=?,status=? WHERE owner_id=? AND id=? AND status=\'draft\'').run(JSON.stringify(snapshot),publish?'published':'draft',owner,existing.id);return report(owner,kind,{now})}
  db.prepare('INSERT INTO gw_reports VALUES(?,?,?,?,?,?,?,?,?)').run(owner,id,kind,period.start,period.end,rev,publish?'published':'draft',JSON.stringify(snapshot),getNow());return report(owner,kind,{now,revision:rev});
 })}
 function reportList(owner,{kind=null,limit=30}={}){ownerId(owner);return all('SELECT * FROM gw_reports WHERE owner_id=? '+(kind?'AND kind=? ':'')+'ORDER BY period_end DESC,revision DESC LIMIT ?',...(kind?[owner,kind,limit]:[owner,limit])).map(r=>({...r,snapshot:safeJSON(r.snapshot_json)}))}
 function suggestionIdsForOperationTask(owner,taskId){
  ownerId(owner);requiredString(taskId,'运营任务ID');
  const linksTable=fetch("SELECT name FROM sqlite_master WHERE type='table' AND name='gw_operation_links'");
  const problemsTable=fetch("SELECT name FROM sqlite_master WHERE type='table' AND name='gw_problems'");
  if(!linksTable||!problemsTable)return [];
  return all("SELECT DISTINCT SUBSTR(p.subject,15) AS suggestionId FROM gw_operation_links l JOIN gw_problems p ON p.owner_id=l.owner_id AND p.id=l.problem_id WHERE l.owner_id=? AND l.task_id=? AND p.type='user' AND p.subject LIKE 'ai-suggestion:%'",owner,taskId).map(row=>row.suggestionId).filter(Boolean);
 }
 function suggestionOperationTasks(owner,suggestionId){
  ownerId(owner);requiredString(suggestionId,'AI 建议 ID');
  const rows=all("SELECT * FROM gw_problems WHERE owner_id=? AND type='user' AND subject=? ORDER BY first_seen DESC",owner,'ai-suggestion:'+suggestionId);
  return rows.map(row=>{const p=problemRow(row);return {problemId:p.id,linkedOperationTasks:linkedOperationTasks(owner,p.id)}});
 }
 function linkAcceptedSuggestionToTask(owner,suggestion,taskId){
  ownerId(owner);
  if(!suggestion||typeof suggestion!=='object'||typeof suggestion.id!=='string'||
   !['adopted','executing','executed'].includes(suggestion.user_status))
   throw Object.assign(Error('只有已采纳的 AI 建议可以关联运营任务'),{status:409});
  requiredString(taskId,'运营任务ID');
  const hasTaskTable=fetch("SELECT name FROM sqlite_master WHERE type='table' AND name='operation_tasks'");
  if(!hasTaskTable)throw Object.assign(Error('既有运营待办存储不可用，不能创建虚构名单'),{status:503});
  const task=fetch('SELECT id,source_json FROM operation_tasks WHERE id=? AND owner_id=?',taskId,owner);
  if(!task)throw Object.assign(Error('运营任务不存在或无权访问'),{status:404});
  const source=suggestion.action_scope?.source||suggestion.applicable_scope?.source||'all';
  if(typeof source!=='string'||source.length>200)
   throw Object.assign(Error('AI 建议的业务范围无效'),{status:400});
  let taskSource='all';try{taskSource=JSON.parse(task.source_json||'{}').source||'all'}catch{}
  if(taskSource!==source)
   throw Object.assign(Error('AI 建议与运营任务的来源范围不一致，不能关联'),{status:409});
  const problem=observeProblem(owner,{
   type:'user',subject:'ai-suggestion:'+suggestion.id,scope:{source},
   description:('已采纳 AI 建议：'+String(suggestion.business_problem||'增长行动')+
    '；执行方案：'+String(suggestion.action||'')).slice(0,2000),
   nextStep:'执行已关联的固定名单运营任务，并保留实际执行记录',priority:3
  });
  const link=linkOperationTask(owner,problem.id,taskId);
  return {suggestionId:suggestion.id,problemId:problem.id,taskId:link.taskId,
   taskTitle:link.title,taskStatus:link.status,reused:!problem.created&&link.reused};
 }
 function linkOperationTask(owner,problemId,taskId){ownerId(owner);if(!problem(owner,problemId))throw Object.assign(Error('问题不存在'),{status:404});
  requiredString(taskId,'运营任务ID');
  const hasTaskTable=fetch("SELECT name FROM sqlite_master WHERE type='table' AND name='operation_tasks'");
  if(!hasTaskTable)throw Object.assign(Error('既有运营待办存储不可用，不能创建虚构名单'),{status:503});
  const task=fetch('SELECT id,title,status FROM operation_tasks WHERE id=? AND owner_id=?',taskId,owner);
  if(!task)throw Object.assign(Error('运营任务不存在或无权访问'),{status:404});
  return inTx(()=>{const existing=fetch('SELECT 1 as n FROM gw_operation_links WHERE owner_id=? AND problem_id=? AND task_id=?',owner,problemId,taskId);
   if(!existing)db.prepare('INSERT INTO gw_operation_links VALUES(?,?,?,?)').run(owner,problemId,taskId,getNow());
   return {taskId:task.id,title:task.title,status:task.status,reused:!!existing,created:!existing};})
 }
 function linkedOperationTasks(owner,problemId){ownerId(owner);if(!problem(owner,problemId))throw Error('问题不存在');
  const hasTaskTable=fetch("SELECT name FROM sqlite_master WHERE type='table' AND name='operation_tasks'");
  if(!hasTaskTable)return [];
  return all('SELECT t.id,t.title,t.status,l.linked_at FROM gw_operation_links l JOIN operation_tasks t ON t.id=l.task_id AND t.owner_id=l.owner_id WHERE l.owner_id=? AND l.problem_id=? ORDER BY l.linked_at DESC',owner,problemId)
 }
 function reviewProblem(owner,id,verdict,reason=''){ownerId(owner);
  if(!problem(owner,id))throw Object.assign(Error('问题不存在'),{status:404});
  if(!['true-positive','false-positive','uncertain'].includes(verdict))throw Error('审核结论无效');
  const exists=fetch('SELECT * FROM gw_problem_reviews WHERE owner_id=? AND problem_id=?',owner,id);
  if(exists){if(exists.verdict===verdict&&exists.reason===reason)return {...exists,reused:true};throw Object.assign(Error('审核记录不可覆盖'),{status:409})}
  db.prepare('INSERT INTO gw_problem_reviews VALUES(?,?,?,?,?)').run(owner,id,verdict,String(reason).slice(0,1000),getNow());
  return fetch('SELECT * FROM gw_problem_reviews WHERE owner_id=? AND problem_id=?',owner,id)
 }
 function reconcileSource(owner,source,{state,coverage,asOf}={}){ownerId(owner);requiredString(source,'源');
  // Connectivity alone is not sufficient: a trusted source watermark and
  // explicitly verified scope are required to resolve a data gap.
  if(state!=='connected'||coverage!=='verified'||!Number.isSafeInteger(asOf)||asOf>getNow()+60000)
   return {resolved:false,reason:'insufficient-source-recovery-evidence'};
  const sourceIssues=problems(owner,{limit:200}).filter(p=>p.type==='data-quality'&&p.subject==='source:'+source&&['open','monitoring'].includes(p.status));
  for(const p of sourceIssues)setProblemStatus(owner,p.id,'resolved',{reason:'已证实来源范围、水位和连接正常; watermark='+asOf});
  return {resolved:sourceIssues.length>0,affected:sourceIssues.length}
 }
 function qualitySummary(owner,{since=getNow()-30*86400000}={}){ownerId(owner);
  const rows=all('SELECT kind,COUNT(*) n FROM gw_problem_events WHERE owner_id=? AND at>=? GROUP BY kind',owner,since);
  const byKind=Object.fromEntries(rows.map(x=>[x.kind,x.n]));
  const reviews=all('SELECT verdict,COUNT(*) n FROM gw_problem_reviews WHERE owner_id=? AND reviewed_at>=? GROUP BY verdict',owner,since);
  const byVerdict=Object.fromEntries(reviews.map(x=>[x.verdict,x.n]));
  const reviewed=(byVerdict['true-positive']||0)+(byVerdict['false-positive']||0);
  return {discovered:byKind.created||0,updated:byKind['evidence-updated']||0,
   falsePositiveRate:reviewed? (byVerdict['false-positive']||0)/reviewed:null,
   manualAcceptanceRate:reviewed? (byVerdict['true-positive']||0)/reviewed:null,
   reviewSampleSize:reviewed,uncertainReviews:byVerdict.uncertain||0,
   interpretation:'仅来自人工审阅样本，未审核问题不计入准确率；样本存在选择偏差'};
 }
 return {saveGoal,goalById,listGoals,saveEvidence,getEvidence,progress,dashboardGoals,observeProblem,problem,problems,problemEvents,setProblemStatus,startRun,executiveInvestigationStart,executiveInvestigationFinish,executiveInvestigationFail,executiveReminders,acknowledgeExecutiveNotice,executiveLearning,workItems,ensureExecutiveWorkItems,completeExecutiveWorkItem,run,ask,answer,cancelRun,finishRun,createAction,proposeActionOnce,executiveQueue,action,actions,updateAction,reviewAction,report,buildReport,reportList,linkOperationTask,linkedOperationTasks,linkAcceptedSuggestionToTask,suggestionOperationTasks,suggestionIdsForOperationTask,reviewProblem,reconcileSource,qualitySummary};
}
module.exports={workspaceStore};
