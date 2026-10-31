'use strict';
// Review-only query efficiency signals from a trusted, owner-scoped evidence
// store. Measured server wall time is NOT monetary cost, database scan size,
// API billing, future runtime guarantee or evidence of causal information gain.
const BASIS='owner-archived-successful-tool-wall-time';
function timingFor(tool,timings){
 const row=timings&&Object.hasOwn(timings,tool)?timings[tool]:null;
 return row?.basis===BASIS&&row.monetaryCostKnown===false&&
  Number.isSafeInteger(row.sampleCount)&&row.sampleCount>=3&&row.sampleCount<=30&&
  Number.isSafeInteger(row.medianMs)&&row.medianMs>=0&&row.medianMs<=120000?
  {sampleCount:row.sampleCount,medianMs:row.medianMs,basis:BASIS}:null;
}
function compareQueries(queries,timings){
 if(!Array.isArray(queries)||queries.length>30||
  queries.some(q=>!q||typeof q.tool!=='string'||!/^[a-z][a-z0-9_.]{1,60}$/.test(q.tool)))
  throw Error('查询比较必须来自有界授权工具候选');
 const candidates=queries.map(q=>({tool:q.tool,timing:timingFor(q.tool,timings)}));
 const known=candidates.filter(c=>c.timing),unknown=candidates.filter(c=>!c.timing);
 // Conservative: an unknown tool may be faster; a known wall-clock median
 // never proves cheaper monetary spend or a more discriminating answer.
 const comparable=candidates.length>0&&unknown.length===0;
 const best=comparable?[...candidates].sort((a,b)=>a.timing.medianMs-b.timing.medianMs||
  b.timing.sampleCount-a.timing.sampleCount||a.tool.localeCompare(b.tool))[0]:null;
 return {status:comparable?'observed-latency-comparable':'insufficient-observed-cost-data',
  bestObservedLatencyTool:best?.tool||null,
  measuredMedianMs:best?.timing.medianMs??null,
  candidates,unknownTools:unknown.map(c=>c.tool),
  monetaryCost:'unknown',costBasis:comparable?'observed-latency-only':'unknown',
  interpretation:'已观测的服务器耗时中位数不是未来耗时、SQL扫描量、美元费用或信息增益；缺样本时不推断最便宜查询'};
}
module.exports={BASIS,timingFor,compareQueries};
