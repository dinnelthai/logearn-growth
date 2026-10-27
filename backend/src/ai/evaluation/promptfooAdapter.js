'use strict';
// Strict adapter for the mature Promptfoo JSON v3 export.
// This only ingests externally executed evaluation; never launches a provider.
const {createHash}=require('node:crypto');
const {CRITICAL}=require('./promptGate');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function importPromptfoo(report){
 const result=report?.results,configuration=report?.config;
 if(result?.version!==3||!Array.isArray(result.results)||!Array.isArray(configuration?.tests)||
   !configuration.tests.length||!Array.isArray(configuration.providers)||configuration.providers.length!==1)
  throw Error('Unsupported or incomplete Promptfoo v3 export');
 const provider=configuration.providers[0];
 const providerId=typeof provider==='string'?provider:provider?.id;
 if(typeof providerId!=='string'||!providerId.startsWith('openai:chat:')||
   providerId.includes('echo')||providerId.includes('mock'))
  throw Error('Only explicitly configured OpenAI-compatible real-model evaluation is accepted');
 if(result.stats?.errors!==0)throw Error('Evaluation contains provider/runtime errors');
 if(result.results.length!==configuration.tests.length)throw Error('Evaluation did not cover every case once');
 const seen=new Set(),rows=[];
 for(const item of result.results){
  if(!Number.isSafeInteger(item.testIdx)||item.testIdx<0||
    item.testIdx>=configuration.tests.length||item.promptIdx!==0)
   throw Error('Unexpected Promptfoo test or prompt index');
  const fixture=configuration.tests[item.testIdx],id=fixture?.metadata?.caseId;
  if(typeof id!=='string'||!id||id.length>100||seen.has(id))throw Error('Case ID missing or repeated');
  seen.add(id);
  const cost=item.response?.cost??item.cost,latencyMs=item.response?.latencyMs??item.latencyMs;
  if(!Number.isFinite(cost)||cost<0||!Number.isFinite(latencyMs)||latencyMs<0||
    !Number.isFinite(item.score)||item.score<0||item.score>1||
    typeof item.success!=='boolean')
   throw Error('Missing actual cost, latency or graded result; fail closed');
  rows.push({id,passed:item.success===true,quality:item.score,cost,latencyMs});
 }
 if(CRITICAL.some(id=>!seen.has(id)))throw Error('Security holdout cases missing');
 return {providerId:providerId,results:rows,
  suiteHash:digest(configuration.tests.map(x=>({id:x.metadata.caseId,assert:x.assert,vars:x.vars}))),
  source:'promptfoo-v3-export',independentVerified:false};
}
module.exports={importPromptfoo};
