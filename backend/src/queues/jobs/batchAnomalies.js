'use strict';
// Transport-only batching for the legacy anomaly detector; never changes KPI data.
// A malformed or incomplete model reply remains an explicit failed analysis.
function summarizeContext(context){
 const dims=context?.dimensions||{};
 return {
  source:Array.isArray(dims.source)?dims.source.slice(0,3):[],
  device:Array.isArray(dims.device)?dims.device.slice(0,3):[]
 };
}
function parseBatch(raw){
 const value=JSON.parse(String(raw||'').trim().replace(/^\`\`\`(?:json)?\\s*/, '').replace(/\\s*\`\`\`$/, ''));
 if(!Array.isArray(value?.analyses))throw Error('Batch response missing analyses');
 const matches=new Map();
 for(const row of value.analyses){
  if(typeof row?.metric!=='string'||typeof row?.analysis!=='string'||!row.analysis.trim()||row.analysis.length>12000)
   throw Error('Batch metric response is invalid');
  if(matches.has(row.metric))throw Error('Duplicate metric in model response');
  matches.set(row.metric,row.analysis);
 }
 return matches;
}
async function analyzeBatches(anomalies,{client,context,date,userId,jobId,batchSize=4}={}){
 if(!Array.isArray(anomalies)||!client?.chat||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>8)
  throw Error('Invalid anomaly batch request');
 let calls=0;
 for(let offset=0;offset<anomalies.length;offset+=batchSize){
  const slice=anomalies.slice(offset,offset+batchSize);
  const items=slice.map(({metric,current,previous,change,trend,severity})=>
   ({metric,current,previous,change,trend,severity}));
  const messages=[
   {role:'system',content:'你是 LogEarn 增长分析师。只依据可观察事实解读每个异常；不能捏造数值、因果或统计显著性。必须返回单个 JSON 对象：{"analyses":[{"metric":"原指标ID","analysis":"该指标的可能解释、数据限制和优先验证动作"}]}。必须覆盖输入中的每个 metric，不添加额外 metric。'},
   {role:'user',content:JSON.stringify({date,anomalies:items,dimensions:summarizeContext(context)})}
  ];
  try{
   const response=await client.chat(messages,{
    userId,operationType:'analysis',operationId:String(jobId||'legacy-anomaly'),
    temperature:0.3,maxTokens:3000,metadata:{jobId,analysisType:'anomaly-batch',date,metrics:items.map(x=>x.metric)}
   });
   calls++;
   const answers=parseBatch(response.content);
   for(const anomaly of slice){
    const analysis=answers.get(anomaly.metric);
    if(!analysis){anomaly.aiAnalysis=null;anomaly.error='模型缺少该指标分析，不视为成功';continue}
    anomaly.aiAnalysis=analysis;
    anomaly.fromCache=response.fromCache===true;
   }
  }catch(error){
   calls++;
   for(const anomaly of slice){
    anomaly.aiAnalysis=null;anomaly.error='本批异常分析未完成：'+String(error.message).slice(0,180);
   }
  }
 }
 return {calls,metrics:anomalies.length};
}
module.exports={analyzeBatches,summarizeContext,parseBatch};
