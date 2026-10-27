'use strict';
const {createHash}=require('node:crypto');
const {inspectCheckpoint}=require('./checkpointState');

// Rebuild the conversation from already-received model responses and tool
// checkpoints. This is deliberately read-only; it NEVER invokes tools or LLMs.
function reconstructTranscript({rows,systemPrompt,context,operationType='analysis'}) {
  if (typeof systemPrompt!=='string'||!systemPrompt || context==null || typeof context!=='object')
    throw Error('Original prompt and input context are required');
  const role=operationType==='retrospective'?'review':'analysis';
  const promptHash=createHash('sha256').update(systemPrompt).digest('hex');
  const inspection=inspectCheckpoint(rows,promptHash);
  const fail=reason=>({state:'blocked',reason,canAutoResume:false,inspection,messages:null,evidence:null,calls:null});
  if (!rows?.length) return fail('no-recorded-calls');
  if (inspection.state!=='recorded')return fail(inspection.reason||inspection.state);
  const messages=[{role:'system',content:systemPrompt},{role:'user',content:JSON.stringify(context)}];
  const evidence=[],calls=[];
  for(const row of rows){
    if(row.prompts?.[role]!==promptHash)return fail('prompt-version-mismatch');
    const response=row.result.responseContent;
    let parsed;
    try{parsed=JSON.parse(response.trim().replace(/^`{3}(?:json)?\s*/,'').replace(/\s*`{3}$/,''));}
    catch{
      messages.push({role:'assistant',content:response},{role:'user',content:'输出无法解析，请完成原任务并返回完整合法 JSON。'});
      calls.push(row.result);
      continue;
    }
    if (!parsed||typeof parsed!=='object'||Array.isArray(parsed))return fail('invalid-response-shape');
    messages.push({role:'assistant',content:response});
    calls.push({model:row.result.model,provider:row.result.provider,tokens:row.result.tokens,cost:row.result.cost,costKnown:row.result.costKnown,fromCache:row.result.fromCache});
    if(Array.isArray(parsed.investigations)&&parsed.investigations.length){
      const completed=row.result.investigations||[];
      if(completed.length!==parsed.investigations.length)return fail('tool-execution-incomplete');
      evidence.push(...completed);
      messages.push({role:'user',content:JSON.stringify({additionalEvidence:completed,instruction:'根据补充证据继续调查或返回完整结果'})});
    }else if (row!==rows.at(-1)) {
      // Validation errors were not journaled in the original runner; their
      // exact user messages cannot be reconstructed safely.
      return fail('unrecorded-validation-turn');
    }
  }
  return {state:'reconstructed',reason:'requires-source-snapshot-and-validation',canAutoResume:false,
    inspection,messages,evidence,calls};
}
module.exports={reconstructTranscript};
