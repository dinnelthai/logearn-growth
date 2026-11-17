'use strict';
// Provider usage is not necessarily present on relay/stream responses. Missing
// tokens are recorded as UNKNOWN, never interpreted as a free completion.
const valid=n=>Number.isSafeInteger(n)&&n>=0;
function normalizeUsage(raw){
 const input=raw?.inputTokens??raw?.prompt_tokens??raw?.promptTokens;
 const output=raw?.outputTokens??raw?.completion_tokens??raw?.completionTokens;
 const total=raw?.totalTokens??raw?.total_tokens??(valid(input)&&valid(output)?input+output:null);
 if(valid(input)&&valid(output)&&valid(total)&&total>=input+output)
  return {inputTokens:input,outputTokens:output,totalTokens:total,known:true};
 return {inputTokens:0,outputTokens:0,totalTokens:0,known:false};
}
module.exports={normalizeUsage};
