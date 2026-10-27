'use strict';
// Read-only investigation checkpoint inspector. Never authorize automatic paid-call replay.
function inspectCheckpoint(rows, expectedPromptHash) {
  if (!Array.isArray(rows)) throw Error('Invalid call journal');
  const summary={state:'not-started',completedRounds:0,completedTools:0,pendingTools:0,modelCalls:rows.length,canAutoResume:false,reason:null};
  if (!rows.length) return summary;
  let expectedRound=0;
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.round) || row.round!==expectedRound++)
      return {...summary,state:'blocked',reason:'noncontiguous-rounds'};
    if (row.status==='started'||row.status==='unknown')
      return {...summary,state:'blocked',reason:'unresolved-paid-call'};
    if (row.status!=='received'||!row.result||typeof row.result.responseContent!=='string')
      return {...summary,state:'blocked',reason:'incomplete-received-response'};
    if (expectedPromptHash && row.prompts?.analysis!==expectedPromptHash && row.prompts?.review!==expectedPromptHash)
      return {...summary,state:'blocked',reason:'prompt-version-mismatch'};
    let parsed;
    try {parsed=JSON.parse(row.result.responseContent.trim().replace(/^\x60{3}(?:json)?\s*/,'').replace(/\s*\x60{3}$/,''));}
    catch {summary.completedRounds++;continue;}
    if (!parsed || typeof parsed!=='object'||Array.isArray(parsed))
      return {...summary,state:'blocked',reason:'invalid-response-shape'};
    const queries=parsed.investigations;
    if (queries!=null && !Array.isArray(queries))
      return {...summary,state:'blocked',reason:'invalid-investigations'};
    const results=row.result.investigations||[];
    if (!Array.isArray(results) || results.length>(queries?.length||0))
      return {...summary,state:'blocked',reason:'invalid-tool-checkpoints'};
    for(let i=0;i<results.length;i++) {
      if (!results[i] || JSON.stringify(results[i].query)!==JSON.stringify(queries[i]) || !Object.hasOwn(results[i],'result'))
        return {...summary,state:'blocked',reason:'tool-checkpoint-mismatch'};
    }
    summary.completedTools+=results.length;
    summary.pendingTools+=(queries?.length||0)-results.length;
    summary.completedRounds++;
    if (summary.pendingTools)
      return {...summary,state:'partial-tools',reason:'tool-execution-incomplete'};
  }
  return {...summary,state:'recorded',reason:'requires-validation-before-resume'};
}
module.exports={inspectCheckpoint};
