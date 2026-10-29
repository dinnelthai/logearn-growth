'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {compare,CONFIDENCE}=require('./opportunityDecision');
const STATES=new Set(['proposed','investigating','accepted','executing','resolved','deferred']);
const fail=(msg,status=400)=>{throw Object.assign(Error(msg),{status})};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const name=(x,max=500)=>{if(typeof x!=='string'||!x.trim()||x.length>max)fail('文本字段无效');return x.trim()};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createOpportunityStore(db,{initialize=false,clock=Date.now,verifyEvidence=null}={}){
 if(!db?.prepare)throw Error('需要工作台 SQLite 数据库');
 const schema=[
 'CREATE TABLE IF NOT EXISTS gw_agent_opportunities (owner_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,subject TEXT NOT NULL,module_id TEXT NOT NULL,goal_version TEXT,scope_json TEXT NOT NULL,evidence_hash TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,fingerprint));',
 'CREATE INDEX IF NOT EXISTS gw_agent_opportunities_owner ON gw_agent_opportunities(owner_id,status,updated_at DESC);',
 'CREATE TABLE IF NOT EXISTS gw_agent_opportunity_events (owner_id TEXT NOT NULL,id TEXT NOT NULL,opportunity_id TEXT NOT NULL,version INTEGER NOT NULL,kind TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,id));',
 'CREATE INDEX IF NOT EXISTS gw_agent_opportunity_history ON gw_agent_opportunity_events(owner_id,opportunity_id,version);'
 ].join('\n');
 if(initialize)db.exec(schema);
 const owner=x=>name(x,256);
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0)fail('时间无效');return n};
 const unpack=r=>r?{...JSON.parse(r.body_json),id:r.id,status:r.status,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at}:null;
 const byId=(o,id)=>db.prepare('SELECT * FROM gw_agent_opportunities WHERE owner_id=? AND id=?').get(o,id);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}};
 function get(o,id){owner(o);name(id,80);return unpack(byId(o,id))}
 function list(o,{status=null,limit=50}={}){
  owner(o);if(status!==null&&!STATES.has(status))fail('状态无效');
  if(!Number.isInteger(limit)||limit<1||limit>200)fail('分页限制无效');
  const q='SELECT * FROM gw_agent_opportunities WHERE owner_id=? '+
   (status?'AND status=? ':'')+'ORDER BY updated_at DESC LIMIT ?';
  return db.prepare(q).all(...(status?[o,status,limit]:[o,limit])).map(unpack)
 }
 function history(o,id){
  if(!get(o,id))fail('机会不存在或无权限',404);
  return db.prepare('SELECT * FROM gw_agent_opportunity_events WHERE owner_id=? AND opportunity_id=? ORDER BY version,created_at,id').all(o,id)
   .map(e=>({id:e.id,kind:e.kind,version:e.version,at:e.created_at,details:JSON.parse(e.body_json)}))
 }
 function scopeOf(x){
  if(!plain(x)||Object.keys(x).some(k=>!['source','activityId','cohortId'].includes(k)))fail('范围无效');
  const scope={source:x.source==null?'all':name(x.source,200)};
  for(const k of ['activityId','cohortId'])if(x[k]!=null)scope[k]=name(x[k],200);
  return scope;
 }
 function normalize(input,o){
  if(!plain(input))fail('机会格式无效');
  const moduleId=name(input.moduleId,100),subject=name(input.subject,256);
  if(!/^growth\.[a-z][a-z0-9_-]*$/.test(moduleId))fail('模块名无效');
  const issue=name(input.issue,1200),action=name(input.action,1000);
  const scope=scopeOf(input.scope||{source:'all'});
  const goalVersion=input.goalVersion==null?null:name(String(input.goalVersion),80);
  const goalId=input.goalId==null?null:name(input.goalId,100);
  if(goalVersion&&!goalId)fail('目标版本必须关联现有目标ID');
  if(goalId){
   const found=db.prepare('SELECT version FROM gw_goals WHERE owner_id=? AND id=? AND version=?')
    .get(o,goalId,Number(goalVersion));
   if(!found)fail('目标版本不存在或无权限',404);
  }
  if(!Array.isArray(input.evidenceIds)||input.evidenceIds.length<1||input.evidenceIds.length>25||
   input.evidenceIds.some(x=>typeof x!=='string'||!x||x.length>128))fail('机会必须引用1–25个证据ID');
  const evidenceIds=[...new Set(input.evidenceIds)];
  if(verifyEvidence)for(const id of evidenceIds)if(!verifyEvidence(o,id,scope))
   fail('证据不存在或无权限',404);
  if(!CONFIDENCE.includes(input.confidence))fail('置信度无效');
  const impact=input.impact||{},effort=input.effort||{};
  if(!plain(impact)||!plain(effort))fail('影响与投入格式无效');
  const valid=x=>x==null||typeof x==='number'&&Number.isFinite(x)&&x>=0;
  if(!valid(impact.affectedUsers)||!valid(effort.hours))fail('不能填写不可信的影响或投入数值');
  const period=input.period;
  if(!plain(period)||!Number.isSafeInteger(period.start)||!Number.isSafeInteger(period.end)||
   period.start<0||period.start>=period.end||period.timezone!=='Asia/Bangkok')fail('期间无效');
  const metricId=input.metricId==null?null:name(input.metricId,80);
  const definitionVersion=input.definitionVersion==null?null:name(input.definitionVersion,80);
  const hypothesis=typeof input.hypothesis==='string'?input.hypothesis.slice(0,1000):'原因待验证';
  return {moduleId,subject,issue,action,scope,goalId,goalVersion,evidenceIds,
   confidence:input.confidence,impact:{affectedUsers:impact.affectedUsers??null},
   effort:{hours:effort.hours??null},period,metricId,definitionVersion,hypothesis};
 }
 function log(o,id,version,kind,data,at){
  db.prepare('INSERT INTO gw_agent_opportunity_events VALUES(?,?,?,?,?,?,?)')
   .run(o,randomUUID(),id,version,kind,JSON.stringify(data),at)
 }
 function upsert(o,input){
  owner(o);const item=normalize(input,o);
  const fp=digest([item.moduleId,item.subject,item.scope,item.metricId,item.goalId,item.goalVersion]);
  const evidenceHash=digest([item.evidenceIds,item.period,item.definitionVersion,item.issue,item.impact,item.effort,item.hypothesis,item.confidence,item.action]);
  return transaction(()=>{
   const old=db.prepare('SELECT * FROM gw_agent_opportunities WHERE owner_id=? AND fingerprint=?').get(o,fp);
   if(old?.evidence_hash===evidenceHash)return {...unpack(old),reused:true,changed:false};
   const at=now(),id=old?.id||randomUUID(),version=old?old.version+1:1;
   const body={...item,id,...(old?{assignee:JSON.parse(old.body_json).assignee||null}:{})};
   if(old)db.prepare('UPDATE gw_agent_opportunities SET version=?,evidence_hash=?,body_json=?,updated_at=? WHERE owner_id=? AND id=?')
    .run(version,evidenceHash,JSON.stringify(body),at,o,id);
   else db.prepare('INSERT INTO gw_agent_opportunities VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(o,id,fp,'proposed',version,item.subject,item.moduleId,item.goalVersion,
     JSON.stringify(item.scope),evidenceHash,JSON.stringify(body),at,at);
   log(o,id,version,old?'evidence-updated':'created',
    {evidenceIds:item.evidenceIds,period:item.period,goalVersion:item.goalVersion},at);
   return {...get(o,id),created:!old,changed:true};
  })
 }
 function decide(o,id,{status,expectedVersion,reason,assignee=null}={}){
  owner(o);if(!STATES.has(status)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
   typeof reason!=='string'||!reason.trim()||reason.length>1000)fail('需要当前版本和人工理由');
  if(assignee!==null)name(assignee,120);
  return transaction(()=>{
   const old=get(o,id);if(!old)fail('机会不存在或无权限',404);
   if(old.version!==expectedVersion)fail('机会版本冲突',409);
   if(old.status===status)return {...old,reused:true};
   const at=now(),version=old.version+1;
   const body={...old,assignee:assignee||old.assignee||null,
    humanDecision:{status,reason,at}};
   db.prepare('UPDATE gw_agent_opportunities SET status=?,version=?,body_json=?,updated_at=? WHERE owner_id=? AND id=? AND version=?')
    .run(status,version,JSON.stringify(body),at,o,id,old.version);
   log(o,id,version,'status-changed',{from:old.status,to:status,reason,assignee},at);
   return get(o,id);
  })
 }
 function ranked(o,opts={}){return compare(list(o,opts))}
 return {upsert,get,list,ranked,history,decide};
}
module.exports={createOpportunityStore,STATES};
