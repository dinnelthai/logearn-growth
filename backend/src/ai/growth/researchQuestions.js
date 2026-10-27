'use strict';
const {createHash}=require('node:crypto');
const KINDS=Object.freeze({collection:3,product:3,entry:2,activity:2});
const LIMIT=50;
function validateOwner(ownerId){
 if(typeof ownerId!=='string'||!ownerId.trim()||ownerId.length>256)
  throw Object.assign(Error('研究问题所属用户无效'),{status:400});
}
function questionFor(change,{source='all',now=Date.now()}={}){
 if(!change||typeof change.id!=='string'||!change.id||
   !Object.hasOwn(KINDS,change.kind)||!Number.isSafeInteger(change.occurredAt)||
   change.occurredAt>now||change.validUntil!=null&&change.validUntil<now||
   typeof source!=='string'||!source||source.length>200)
  return null;
 // Never infer data completeness or business impact merely from an event.
 const kind=change.kind;
 const label={collection:'采集口径变化',product:'产品版本变化',
  entry:'入口变化',activity:'活动变化'}[kind];
 const id=createHash('sha256').update(JSON.stringify([change.id,source])).digest('hex').slice(0,32);
 return {id:'research-'+id,changeId:change.id,kind,source,
  title:label+'后关键指标是否发生可验证变化？',
  question:'先检查变更前后源数据水位、成熟分母和采集覆盖，再对照同来源的激活、留存、转化指标；只报告观测关联，必须有可打开的原始证据。',
  priority:KINDS[kind],occurredAt:change.occurredAt,
  status:'awaiting-review',requiresApproval:true,paidCalls:0};
}
function createResearchQuestions(db){
 if(!db?.prepare)throw Error('缺少现有业务数据库');
 function plan(ownerId,changes,{source='all',now=Date.now()}={}){
  validateOwner(ownerId);
  if(!Array.isArray(changes)||changes.length>100||!Number.isSafeInteger(now))
   throw Error('研究变化输入无效');
  const selected=changes.map(change=>questionFor(change,{source,now})).filter(Boolean)
   .sort((a,b)=>b.priority-a.priority||b.occurredAt-a.occurredAt)
   .slice(0,LIMIT);
  const statement=db.prepare(`INSERT OR IGNORE INTO agent_research_questions
   (owner_id,id,change_id,source,kind,title,question,priority,status,occurred_at,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const inserted=[];
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const item of selected){
    const r=statement.run(ownerId,item.id,item.changeId,item.source,item.kind,
     item.title,item.question,item.priority,item.status,item.occurredAt,now);
    if(r.changes)inserted.push(item);
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
  return {planned:selected.length,inserted,duplicates:selected.length-inserted.length,
   paidCalls:0,externalActions:0};
 }
 function list(ownerId,{limit=30,status='awaiting-review'}={}){
  validateOwner(ownerId);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||
    !['awaiting-review','dismissed','approved'].includes(status))
   throw Error('研究列表过滤无效');
  return db.prepare(`SELECT id,change_id AS changeId,source,kind,title,question,priority,
    status,occurred_at AS occurredAt,created_at AS createdAt
    FROM agent_research_questions WHERE owner_id=? AND status=?
    ORDER BY priority DESC,occurred_at DESC LIMIT ?`).all(ownerId,status,limit);
 }
 function decide(ownerId,id,action){
  validateOwner(ownerId);
  if(typeof id!=='string'||!id||!['approve','dismiss'].includes(action))
   throw Error('研究审核参数无效');
  const status=action==='approve'?'approved':'dismissed';
  const changed=db.prepare(`UPDATE agent_research_questions SET status=?
   WHERE owner_id=? AND id=? AND status='awaiting-review'`).run(status,ownerId,id);
  return {changed:changed.changes===1,status,requiresHumanExecution:true};
 }
 return {plan,list,decide};
}
module.exports={questionFor,createResearchQuestions};
