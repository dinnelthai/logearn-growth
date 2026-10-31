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
 function startRun(owner,problemId,{mode='manual'}={}){ownerId(owner);if(mode!=='manual')throw Error('此工作区不会自动启动付费调查');if(!problem(owner,problemId))throw Object.assign(Error('问题不存在'),{status:404});
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
 function createAction(owner,problemId,input){const p=problem(owner,problemId);if(!p)throw Error('问题不存在');const desc=requiredString(input.description,'行动建议',1500),assignee=requiredString(input.assignee,'负责人',120),id=randomUUID(),now=getNow();
  db.prepare('INSERT INTO gw_actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(owner,id,problemId,input.runId||null,desc,assignee,'proposed',input.metricId||null,input.definitionVersion||null,input.direction||null,null,null,null,null,now,now);return action(owner,id)}
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
 return {saveGoal,goalById,listGoals,saveEvidence,getEvidence,progress,observeProblem,problem,problems,problemEvents,setProblemStatus,startRun,run,ask,answer,cancelRun,finishRun,createAction,action,actions,updateAction,reviewAction,report,buildReport,reportList,linkOperationTask,linkedOperationTasks,linkAcceptedSuggestionToTask,suggestionOperationTasks,reviewProblem,reconcileSource,qualitySummary};
}
module.exports={workspaceStore};
