const {randomUUID}=require('node:crypto');
const {owner}=require('./scope');
function createContextStore(db){
 const requireOwner=id=>owner({ownerId:id});
 function getGoal(ownerId,id,version){requireOwner(ownerId);const r=version==null?db.prepare('SELECT body FROM agent_goals WHERE owner_id=? AND id=? ORDER BY version DESC LIMIT 1').get(String(ownerId),id):db.prepare('SELECT body FROM agent_goals WHERE owner_id=? AND id=? AND version=?').get(String(ownerId),id,version);return r?JSON.parse(r.body):null;}
 function saveGoal(ownerId,input){
  requireOwner(ownerId);const {id=randomUUID(),value,deadline,resources=[],budget={},priority='P1'}=input;
  if(typeof id!=='string'||!id||id.length>200||!Number.isFinite(value)||!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||!Array.isArray(resources)||resources.some(r=>typeof r!=='string')||!budget||typeof budget!=='object'||Array.isArray(budget)||!['P0','P1','P2'].includes(priority))throw Object.assign(Error('业务目标格式无效'),{status:400});
  const version=(getGoal(ownerId,id)?.version||0)+1,goal={id,version,value,deadline,resources,budget,priority,createdAt:Date.now()};
  db.prepare('INSERT INTO agent_goals(owner_id,id,version,body) VALUES(?,?,?,?)').run(String(ownerId),id,version,JSON.stringify(goal));return goal;
 }
 function pinRun(ownerId,runId,id,version){if(!getGoal(ownerId,id,version))throw Object.assign(Error('目标不存在'),{status:404});const r=db.prepare('SELECT goal_id,goal_version FROM agent_run_goals WHERE owner_id=? AND run_id=?').get(String(ownerId),runId);if(r&&(r.goal_id!==id||r.goal_version!==version))throw Object.assign(Error('运行目标版本已固定'),{status:409});if(!r)db.prepare('INSERT INTO agent_run_goals VALUES(?,?,?,?)').run(String(ownerId),runId,id,version);}
 function getRunGoal(ownerId,runId){requireOwner(ownerId);const r=db.prepare('SELECT goal_id,goal_version FROM agent_run_goals WHERE owner_id=? AND run_id=?').get(String(ownerId),runId);return r?getGoal(ownerId,r.goal_id,r.goal_version):null;}
 function saveChange(ownerId,input){requireOwner(ownerId);if(!['activity','product','entry','collection'].includes(input.kind)||typeof input.content!=='string'||!input.content.trim()||input.content.length>5000||typeof input.source!=='string'||!input.source.trim()||!Number.isSafeInteger(input.occurredAt)||(input.validUntil!=null&&(!Number.isSafeInteger(input.validUntil)||input.validUntil<input.occurredAt)))throw Object.assign(Error('业务变化格式无效'),{status:400});const change={id:randomUUID(),kind:input.kind,content:input.content,source:input.source,occurredAt:input.occurredAt,validUntil:input.validUntil??null,recordedAt:Date.now()};db.prepare('INSERT INTO agent_changes VALUES(?,?,?)').run(String(ownerId),change.id,JSON.stringify(change));return change;}
 function listChanges(ownerId){requireOwner(ownerId);return db.prepare('SELECT body FROM agent_changes WHERE owner_id=? ORDER BY rowid DESC LIMIT 100').all(String(ownerId)).map(r=>JSON.parse(r.body));}
 return {getGoal,saveGoal,pinRun,getRunGoal,saveChange,listChanges};
}
module.exports={createContextStore};
