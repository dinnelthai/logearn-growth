const {createHash}=require('node:crypto');
const {owner}=require('./scope');
function createTraceStore(db){
 function savePrompt(role,content){const hash=createHash('sha256').update(content).digest('hex');db.prepare('INSERT OR IGNORE INTO agent_prompts(hash,role,content) VALUES(?,?,?)').run(hash,role,content);return hash;}
 function begin(context,round){
  const ownerId=owner(context);
  db.exec('BEGIN IMMEDIATE');try{
   if(db.prepare("SELECT 1 FROM agent_calls WHERE owner_id=? AND run_id=? AND status IN ('started','unknown') LIMIT 1").get(ownerId,context.runId))throw Object.assign(Error('先前付费调用状态不明，需要人工核查，禁止盲目重放'),{status:409});
   db.prepare('INSERT INTO agent_calls(owner_id,run_id,trace_id,round,status,prompts,started_at) VALUES(?,?,?,?,?,?,?)').run(ownerId,context.runId,context.traceId,round,'started',JSON.stringify(context.promptVersions),Date.now());db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function finish(context,round,result){db.prepare("UPDATE agent_calls SET status='received',result=?,finished_at=? WHERE owner_id=? AND trace_id=? AND round=?").run(JSON.stringify(result),Date.now(),owner(context),context.traceId,round);}
 function appendInvestigation(context,round,index,query,result){
  if(!Number.isSafeInteger(index)||index<0)throw Error('调查步骤序号无效');
  const ownerId=owner(context);
  db.exec('BEGIN IMMEDIATE');
  try{
   const row=db.prepare("SELECT result FROM agent_calls WHERE owner_id=? AND run_id=? AND trace_id=? AND round=? AND status='received'").get(ownerId,context.runId,context.traceId,round);
   if(!row||!row.result)throw Error('未找到已确认的模型响应，禁止保存孤立调查结果');
   const saved=JSON.parse(row.result);
   if(typeof saved.responseContent!=='string')throw Error('模型响应内容未持久化');
   const items=saved.investigations||[];
   if(index<items.length){
    if(JSON.stringify(items[index])!==JSON.stringify({query,result}))throw Error('调查步骤已存在且结果冲突');
   }else{
    if(index!==items.length)throw Error('调查步骤必须按顺序保存');
    items.push({query,result});
    saved.investigations=items;
    db.prepare("UPDATE agent_calls SET result=? WHERE owner_id=? AND run_id=? AND trace_id=? AND round=? AND status='received'").run(JSON.stringify(saved),ownerId,context.runId,context.traceId,round);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function unknown(context,round){db.prepare("UPDATE agent_calls SET status='unknown',finished_at=? WHERE owner_id=? AND trace_id=? AND round=?").run(Date.now(),owner(context),context.traceId,round);}
 function list(ownerId,runId){return db.prepare('SELECT trace_id,round,status,prompts,result,started_at,finished_at FROM agent_calls WHERE owner_id=? AND run_id=? ORDER BY started_at,round,trace_id').all(owner({ownerId}),runId).map(r=>({...r,prompts:JSON.parse(r.prompts),result:r.result?JSON.parse(r.result):null}));}
 return {savePrompt,begin,finish,appendInvestigation,unknown,list};
}
module.exports={createTraceStore};
