// A table existing is not sufficient evidence that the AI schema has been
// upgraded. CostTracker inserts trace_id, round and cost_known, and deduplicates
// by the owner/trace partial unique index. Verify these before reporting ready.
async function aiSchemaReady(db=require('../../db/aiPool')){
 const r=await db.query(`SELECT
   to_regclass('public.ai_analysis_records') AS records,
   to_regclass('public.ai_suggestions') AS suggestions,
   to_regclass('public.ai_usage_logs') AS usage_logs,
   to_regclass('public.idx_ai_usage_owner_trace') AS trace_index,
   (SELECT ARRAY_AGG(column_name) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ai_usage_logs'
        AND column_name = ANY($1::text[])) AS usage_columns`,
   [['trace_id','round','cost_known']]);
 const row=r.rows?.[0]||{};
 const found=new Set(row.usage_columns||[]);
 return Boolean(row.records&&row.suggestions&&row.usage_logs&&row.trace_index&&
  ['trace_id','round','cost_known'].every(column=>found.has(column)));
}

async function checkHealth(probes=defaultProbes()){
 const components={};
 await Promise.all(Object.entries(probes).map(async([name,probe])=>{
  let timer;try{const ok=await Promise.race([probe(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),6000)})]);components[name]={status:ok?'ok':'unavailable'};}
  catch{components[name]={status:'unavailable'};}finally{clearTimeout(timer);}
 }));
 return {ready:Object.values(components).every(c=>c.status==='ok'),components,paidProbe:false,replay:'completed返回存档；processing不可盲重放付费调用，需核查调用状态',checkedAt:new Date().toISOString()};
}
function defaultProbes(){return {
 api:async()=>true,
 dataSource:async()=>!!(await require('../../data/hologres').status()).as_of,
 redis:async()=>(await (await require('../../queues/queues').queues.aiAnalysis.client).ping())==='PONG',
 worker:async()=>(await require('../../queues/queues').queues.aiAnalysis.getWorkers()).length>0,
 aiDatabase:async()=>!!(await require('../../db/aiPool').query('SELECT 1')).rows.length,
 migrations:()=>aiSchemaReady(),
 modelConfig:async()=>{const {getConfig,validateConfig}=require('../llm/config');validateConfig();return !!getConfig().openai.baseURL;}
};}
module.exports={checkHealth,aiSchemaReady};
