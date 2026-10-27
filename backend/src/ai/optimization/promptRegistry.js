'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {validateCandidate,evaluateCandidate,authorizePromotion}=require('../evaluation/promptGate');
const VALID_ROLES=new Set(['analysis','planning','review','tool-selection','conclusion']);
const hash=value=>createHash('sha256').update(value).digest('hex');
function refuse(message,status=409){throw Object.assign(Error(message),{status})}
function createPromptRegistry(db){
 if(!db?.prepare)throw Error('Prompt registry requires the existing SQLite database');
 function owner(id){
  if(typeof id!=='string'||!id.trim()||id.length>256)refuse('用户身份无效',400);
  return id;
 }
 function getCandidate(ownerId,id){
  owner(ownerId);
  const row=db.prepare(`SELECT * FROM agent_prompt_candidates
   WHERE owner_id=? AND id=?`).get(ownerId,id);
  if(!row)return null;
  return {...row,evaluation:row.evaluation?JSON.parse(row.evaluation):null};
 }
 function propose(ownerId,{role,baseline,appendix,reason,sourceTraceIds=[]}={}){
  owner(ownerId);
  if(!VALID_ROLES.has(role)||typeof baseline!=='string'||!baseline.trim()||
    baseline.length>50000||typeof appendix!=='string'||!appendix.trim()||
    appendix.length>2000||typeof reason!=='string'||!reason.trim()||reason.length>2000||
    !Array.isArray(sourceTraceIds)||sourceTraceIds.length>30||
    sourceTraceIds.some(x=>typeof x!=='string'||x.length>256))
   refuse('提示词候选格式无效',400);
  if(/(-----BEGIN [A-Z ]+PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,}|password\s*[:=])/i.test(appendix))
   refuse('候选内容可能包含密钥，拒绝保存',400);
  // The candidate can only ADD bounded guidance; original business instructions
  // and the system's tool/evidence validation remain part of every version.
  const content=baseline+'\n\n【候选增量规则，不得改变业务指标、范围或权限】\n'+appendix;
  const base=validateCandidate({role,content:baseline});
  const next=validateCandidate({role,content});
  const id=randomUUID(),now=Date.now();
  db.exec('BEGIN IMMEDIATE');
  try{
   const insert=db.prepare('INSERT OR IGNORE INTO agent_prompts(hash,role,content) VALUES(?,?,?)');
   insert.run(base.hash,role,baseline);insert.run(next.hash,role,content);
   db.prepare(`INSERT INTO agent_prompt_candidates
    (owner_id,id,role,baseline_hash,candidate_hash,reason,trace_ids,status,version,created_at)
    VALUES(?,?,?,?,?,?,?,'proposed',1,?)`).run(
      ownerId,id,role,base.hash,next.hash,reason,JSON.stringify(sourceTraceIds),now);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
  return {id,role,baselineHash:base.hash,candidateHash:next.hash,status:'proposed',
   humanApprovalRequired:true,automaticActivation:false};
 }
 function getWithContents(ownerId,id){
  const row=getCandidate(ownerId,id);
  if(!row)return null;
  const get=hash=>db.prepare('SELECT role,content FROM agent_prompts WHERE hash=?').get(hash);
  return {...row,baseline:get(row.baseline_hash)?.content,candidate:get(row.candidate_hash)?.content};
 }
 function list(ownerId,{limit=30}={}){
  owner(ownerId);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)refuse('候选查询数量无效',400);
  return db.prepare(`SELECT id,role,status,version,baseline_hash,candidate_hash,reason,
   evaluated_at,approved_at,created_at FROM agent_prompt_candidates
   WHERE owner_id=? ORDER BY created_at DESC LIMIT ?`).all(ownerId,limit);
 }
 function recordEvaluation(ownerId,id,{results,limits,suiteHash}={}){
  const row=getWithContents(ownerId,id);
  if(!row||row.status!=='proposed')refuse('候选不存在或不可评估');
  if(typeof suiteHash!=='string'||!/^[0-9a-f]{64}$/.test(suiteHash))
   refuse('独立评估集版本缺失',400);
  const evaluation=evaluateCandidate({candidate:{role:row.role,content:row.candidate},
   baseline:{role:row.role,content:row.baseline},results,limits});
  const saved={...evaluation,suiteHash,method:'independent-offline-evaluation',
   source:'operator-attested-promptfoo-results'};
  const r=db.prepare(`UPDATE agent_prompt_candidates SET
   status=?,evaluation=?,suite_hash=?,evaluated_at=?,version=version+1
   WHERE owner_id=? AND id=? AND status='proposed' AND version=?`).run(
    evaluation.eligible?'evaluated':'rejected',JSON.stringify(saved),
    suiteHash,Date.now(),ownerId,id,row.version);
  if(r.changes!==1)refuse('并发评估版本冲突');
  return {id,status:evaluation.eligible?'evaluated':'rejected',evaluation:saved};
 }
 function approve(ownerId,id,expectedVersion){
  const row=getCandidate(ownerId,id);
  if(!row||row.status!=='evaluated'||row.version!==expectedVersion||
    !row.evaluation?.eligible)refuse('未通过评估或版本已变化');
  const r=db.prepare(`UPDATE agent_prompt_candidates
    SET status='approved',approved_by=?,approved_at=?,version=version+1
    WHERE owner_id=? AND id=? AND version=? AND status='evaluated'`).run(
     ownerId,Date.now(),ownerId,id,expectedVersion);
  if(!r.changes)refuse('审批冲突');
  return {id,status:'approved',version:expectedVersion+1};
 }
 function activate(ownerId,id,expectedVersion,{env=process.env}={}){
  const row=getWithContents(ownerId,id);
  if(!row||row.status!=='approved'||row.version!==expectedVersion)
   refuse('候选尚未通过人工审批，或版本不符');
  const existing=db.prepare('SELECT * FROM agent_active_prompts WHERE owner_id=? AND role=?')
   .get(ownerId,row.role);
  const baselineHash=existing?.candidate_hash||row.baseline_hash;
  if(baselineHash!==row.baseline_hash)refuse('当前线上提示词版本已变化，请重新评估');
  authorizePromotion({candidate:{role:row.role,content:row.candidate},
   baseline:{role:row.role,content:row.baseline},evaluation:row.evaluation,
   approval:{candidateHash:row.candidate_hash,approvedBy:row.approved_by},env});
  const now=Date.now();
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=db.prepare('SELECT * FROM agent_active_prompts WHERE owner_id=? AND role=?')
    .get(ownerId,row.role);
   if((previous?.candidate_hash||row.baseline_hash)!==row.baseline_hash)
    refuse('线上版本变更冲突');
   db.prepare(`INSERT INTO agent_active_prompts
    (owner_id,role,candidate_hash,previous_hash,version,updated_at)
    VALUES(?,?,?,?,1,?) ON CONFLICT(owner_id,role) DO UPDATE SET
     candidate_hash=excluded.candidate_hash,previous_hash=agent_active_prompts.candidate_hash,
     version=agent_active_prompts.version+1,updated_at=excluded.updated_at`).run(
      ownerId,row.role,row.candidate_hash,row.baseline_hash,now);
   db.prepare(`INSERT INTO agent_prompt_rollouts (owner_id,role,candidate_hash,percent,version)
    VALUES(?,?,?,0,1) ON CONFLICT(owner_id,role) DO UPDATE SET
    candidate_hash=excluded.candidate_hash,percent=0,version=agent_prompt_rollouts.version+1`)
    .run(ownerId,row.role,row.candidate_hash);
   const updated=db.prepare(`UPDATE agent_prompt_candidates
     SET status='active',version=version+1 WHERE owner_id=? AND id=? AND
     version=? AND status='approved'`).run(ownerId,id,expectedVersion);
   if(updated.changes!==1)refuse('候选发布版本冲突');
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
  return {status:'active',id,hash:row.candidate_hash,
   runtimeEnabled:env.AI_PROMPT_RUNTIME_ENABLED==='1',
   rollbackAvailable:true};
 }
 function rollback(ownerId,role,expectedVersion){
  owner(ownerId);
  if(!VALID_ROLES.has(role)||!Number.isSafeInteger(expectedVersion))
   refuse('回滚参数无效',400);
  const active=db.prepare('SELECT * FROM agent_active_prompts WHERE owner_id=? AND role=?')
   .get(ownerId,role);
  if(!active||active.version!==expectedVersion)refuse('待回滚版本不匹配');
  const result=db.prepare(`UPDATE agent_active_prompts SET
   candidate_hash=previous_hash,previous_hash=candidate_hash,
   version=version+1,updated_at=?
   WHERE owner_id=? AND role=? AND version=?`).run(
    Date.now(),ownerId,role,expectedVersion);
  if(result.changes!==1)refuse('回滚冲突');
  db.prepare('UPDATE agent_prompt_rollouts SET percent=0,candidate_hash=?,version=version+1 WHERE owner_id=? AND role=?')
   .run(active.previous_hash,ownerId,role);
  return {status:'rolled-back',version:expectedVersion+1,activeHash:active.previous_hash};
 }
 function setRollout(ownerId,role,expectedVersion,percent){
  owner(ownerId);
  const steps=[0,5,10,25,50,100];
  if(!VALID_ROLES.has(role)||!steps.includes(percent)||!Number.isSafeInteger(expectedVersion))
   refuse('灰度比例或版本不合法',400);
  const current=db.prepare('SELECT * FROM agent_prompt_rollouts WHERE owner_id=? AND role=?')
   .get(ownerId,role);
  if(!current||current.version!==expectedVersion)refuse('灰度版本已变化');
  const index=steps.indexOf(current.percent),requested=steps.indexOf(percent);
  if(requested>index+1)refuse('灰度只能逐档扩展，允许随时回到0');
  const active=db.prepare('SELECT candidate_hash FROM agent_active_prompts WHERE owner_id=? AND role=?')
   .get(ownerId,role);
  if(!active||active.candidate_hash!==current.candidate_hash)refuse('灰度版本与当前提示词不一致');
  const updated=db.prepare(`UPDATE agent_prompt_rollouts SET percent=?,version=version+1
    WHERE owner_id=? AND role=? AND version=?`)
   .run(percent,ownerId,role,expectedVersion);
  if(updated.changes!==1)refuse('并发灰度修改冲突');
  return {role,percent,version:expectedVersion+1};
 }
 function resolve(ownerId,role,baseline,{env=process.env,runId=null}={}){
  owner(ownerId);
  if(env.AI_PROMPT_RUNTIME_ENABLED!=='1'||typeof runId!=='string'||!runId)
   return baseline;
  validateCandidate({role,content:baseline});
  const row=db.prepare(`SELECT p.content,r.percent FROM agent_active_prompts a
   JOIN agent_prompts p ON p.hash=a.candidate_hash
   JOIN agent_prompt_rollouts r ON r.owner_id=a.owner_id AND r.role=a.role
    AND r.candidate_hash=a.candidate_hash
   WHERE a.owner_id=? AND a.role=?`).get(ownerId,role);
  if(!row||!Number.isSafeInteger(row.percent)||row.percent<=0)return baseline;
  const slot=parseInt(hash(JSON.stringify([ownerId,role,runId])).slice(0,8),16)%100;
  return slot<row.percent&&row.content.startsWith(baseline+'\\n\\n【候选增量规则')
   ?row.content:baseline;
 }
 return {propose,getCandidate,getWithContents,list,recordEvaluation,approve,activate,rollback,setRollout,resolve};
}
module.exports={createPromptRegistry};
