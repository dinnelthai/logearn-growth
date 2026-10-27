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
 function saveFollowup(context,round,message,kind){
  if(!['parse-error','validation-error'].includes(kind)||typeof message!=='string'||!message.trim())
    throw Error('模型纠正消息格式无效');
  const ownerId=owner(context);
  db.exec('BEGIN IMMEDIATE');
  try{
   const row=db.prepare("SELECT result FROM agent_calls WHERE owner_id=? AND run_id=? AND trace_id=? AND round=? AND status='received'").get(ownerId,context.runId,context.traceId,round);
   if(!row||!row.result)throw Error('不能给未确认的模型调用保存纠正消息');
   const saved=JSON.parse(row.result);
   if(typeof saved.responseContent!=='string'||saved.investigations?.length)throw Error('存在调查步骤或缺失模型响应，不能追加纠正消息');
   if(saved.followup){
    if(saved.followup.kind!==kind||saved.followup.content!==message)throw Error('模型纠正消息已存在且不一致');
   }else{
    saved.followup={kind,content:message};
    db.prepare("UPDATE agent_calls SET result=? WHERE owner_id=? AND run_id=? AND trace_id=? AND round=? AND status='received'").run(JSON.stringify(saved),ownerId,context.runId,context.traceId,round);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function saveValidatedAnalysis(context,round,analysis){
  const ownerId=owner(context);
  db.exec('BEGIN IMMEDIATE');
  try{
   const row=db.prepare("SELECT result FROM agent_calls WHERE owner_id=? AND run_id=? AND trace_id=? AND round=? AND status='received'").get(ownerId,context.runId,context.traceId,round);
   if(!row?.result)throw Error('缺少已接收的模型响应，禁止保存完成检查点');
   const saved=JSON.parse(row.result);
   if(typeof saved.responseContent!=='string'||saved.followup||saved.investigations?.length)
     throw Error('该模型轮次不是可确认的最终分析');
   if(!analysis||typeof analysis.summary!=='string'||!Array.isArray(analysis.suggestions))
     throw Error('校验后分析结构无效');
   const value=JSON.stringify(analysis);
   if(saved.validatedAnalysis){
    if(JSON.stringify(saved.validatedAnalysis)!==value)throw Error('已验证分析记录冲突');
   }else{
    saved.validatedAnalysis=analysis;
    db.prepare("UPDATE agent_calls SET result=? WHERE owner_id=? AND run_id=? AND trace_id=? AND round=? AND status='received'").run(JSON.stringify(saved),ownerId,context.runId,context.traceId,round);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function unknown(context,round){db.prepare("UPDATE agent_calls SET status='unknown',finished_at=? WHERE owner_id=? AND trace_id=? AND round=?").run(Date.now(),owner(context),context.traceId,round);}
 function list(ownerId,runId){return db.prepare('SELECT trace_id,round,status,prompts,result,started_at,finished_at FROM agent_calls WHERE owner_id=? AND run_id=? ORDER BY started_at,round,trace_id').all(owner({ownerId}),runId).map(r=>({...r,prompts:JSON.parse(r.prompts),result:r.result?JSON.parse(r.result):null}));}
 function promptForRun(ownerId,runId,role){
  owner({ownerId});
  if(!['analysis','review'].includes(role)||typeof runId!=='string'||!runId)
   throw Error('原始提示词定位参数无效');
  const row=db.prepare(`SELECT p.hash,p.content FROM agent_calls c
   JOIN agent_prompts p ON p.hash=json_extract(c.prompts, '$.' || ?)
   WHERE c.owner_id=? AND c.run_id=? AND c.status='received'
   ORDER BY c.started_at,c.round LIMIT 1`).get(role,ownerId,runId);
  if(!row)return null;
  if(createHash('sha256').update(row.content).digest('hex')!==row.hash)
   throw Error('原始提示词内容哈希不一致');
  return row.content;
 }
 return {savePrompt,begin,finish,appendInvestigation,saveFollowup,saveValidatedAnalysis,unknown,list,promptForRun};
}
module.exports={createTraceStore};
