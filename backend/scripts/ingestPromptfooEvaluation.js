#!/usr/bin/env node
'use strict';
// Operator-only CLI. Never expose this entrypoint as an API accepting
// model-authored evaluation artifacts.
const fs=require('node:fs');
const {importPromptfoo}=require('../src/ai/evaluation/promptfooAdapter');
const {createPromptRegistry}=require('../src/ai/optimization/promptRegistry');
function main(args=process.argv.slice(2),db=require('../src/db/connection')){
 const [ownerId,candidateId,jsonFile,baselineQuality,maxCost,maxLatencyMs]=args;
 if(!ownerId||!candidateId||!jsonFile||
   ![baselineQuality,maxCost,maxLatencyMs].every(x=>x!=null&&x!==''))
  throw Error('usage: node scripts/ingestPromptfooEvaluation.js OWNER CANDIDATE output.json BASELINE_QUALITY MAX_COST MAX_LATENCY_MS');
 const limits={baselineQuality:Number(baselineQuality),maxCost:Number(maxCost),
  maxLatencyMs:Number(maxLatencyMs)};
 if(!Object.values(limits).every(Number.isFinite)||limits.baselineQuality<0||
   limits.baselineQuality>1||limits.maxCost<=0||limits.maxLatencyMs<=0)
  throw Error('Evaluation budgets invalid');
 const data=JSON.parse(fs.readFileSync(jsonFile,'utf8'));
 const exportData=importPromptfoo(data);
 const result=createPromptRegistry(db).recordEvaluation(ownerId,candidateId,{
  results:exportData.results,limits,suiteHash:exportData.suiteHash});
 process.stdout.write(JSON.stringify({
  id:candidateId,status:result.status,eligible:result.evaluation.eligible,
  errors:result.evaluation.failures,suiteHash:exportData.suiteHash})+'\n');
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={main};
