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
 migrations:async()=>{const r=await require('../../db/aiPool').query("SELECT to_regclass('public.ai_analysis_records') AS records,to_regclass('public.ai_suggestions') AS suggestions");return !!(r.rows[0]?.records&&r.rows[0]?.suggestions);},
 modelConfig:async()=>{const {getConfig,validateConfig}=require('../llm/config');validateConfig();return !!getConfig().openai.baseURL;}
};}
module.exports={checkHealth};
