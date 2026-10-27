'use strict';
const {createHash}=require('node:crypto');
const {parseJSON}=require('./runner');

// This policy checks every paid response and each saved tool result before
// the worker acquires an expired execution lease. Never replay an unknown call.
function planInvestigationResume({rows,guards,context,systemPrompt}) {
  const block=reason=>({allowed:false,reason});
  if(!Array.isArray(rows)||!Array.isArray(guards)||!rows.length||rows.length!==guards.length)return block('journal-count-mismatch');
  const hash=createHash('sha256').update(systemPrompt).digest('hex');
  const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
  let toolsToRun=0;
  for(let i=0;i<rows.length;i++){
    const row=rows[i],guard=guards[i],last=i===rows.length-1;
    if(row.round!==i||Number(guard.round)!==i||row.status!=='received'||guard.status!=='received')
      return block('unconfirmed-paid-call');
    if(row.prompts?.analysis!==hash||row.result?.contextHash!==contextHash||typeof row.result.responseContent!=='string')
      return block('source-or-prompt-mismatch');
    const savedTools=row.result.investigations||[];
    if(!Array.isArray(savedTools))return block('invalid-tool-journal');
    let parsed;
    try{parsed=parseJSON(row.result.responseContent)}catch{
      if(savedTools.length||row.result.followup?.kind!=='parse-error')return block('unrecorded-parse-repair');
      continue;
    }
    const requested=parsed.investigations||[];
    if(!Array.isArray(requested)||requested.length>6||savedTools.length>requested.length)
      return block('invalid-investigation-plan');
    for(let j=0;j<savedTools.length;j++){
      if(JSON.stringify(savedTools[j]?.query)!==JSON.stringify(requested[j])||!Object.hasOwn(savedTools[j]||{},'result'))
        return block('tool-checkpoint-mismatch');
    }
    if(requested.length){
      if(!last&&savedTools.length!==requested.length)return block('nonterminal-partial-tools');
      toolsToRun+=requested.length-savedTools.length;
    }else if(!last&&!row.result.followup&&!row.result.validatedAnalysis)
      return block('unrecorded-validation-turn');
  }
  return {allowed:true,reason:'confirmed-checkpoints',replayedModelCalls:rows.length,
    savedToolResults:rows.reduce((n,r)=>n+(r.result.investigations?.length||0),0),remainingTools:toolsToRun};
}
module.exports={planInvestigationResume};
