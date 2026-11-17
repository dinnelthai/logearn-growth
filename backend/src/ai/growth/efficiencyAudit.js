'use strict';
// Offline A/B audit: exact measured usage only. Never estimate tokens from
// byte length or mistake absent/unknown prices for zero charges.
const round=x=>Math.round(x*100)/100;
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function key(signal){
 if(!signal||typeof signal.metric!=='string'||!signal.metric)return null;
 return [signal.metric,signal.source||'all',signal.priority||'unknown'].join('|');
}
function measured(run){
 return run&&Number.isSafeInteger(run.calls)&&run.calls>=0&&
  Number.isSafeInteger(run.inputTokens)&&run.inputTokens>=0&&
  Number.isSafeInteger(run.outputTokens)&&run.outputTokens>=0&&
  Number.isSafeInteger(run.totalTokens)&&
  run.totalTokens>=run.inputTokens+run.outputTokens&&
  run.costKnown===true&&numeric(run.costUsd);
}
function compareCases(cases){
 if(!Array.isArray(cases)||!cases.length)throw Error('Provide labeled paired evaluation cases');
 const rows=[];
 for(const item of cases){
  if(typeof item?.id!=='string'||!item.id||!Array.isArray(item.expectedSignals)||
   !item.before||!item.after||!Array.isArray(item.after.signals)||
   !Array.isArray(item.before.signals)||typeof item.after.quality?.complete!=='boolean')
   throw Error('Case lacks ground-truth signal labels or quality state');
  const baseline=measured(item.before),candidate=measured(item.after);
  const expected=new Set(item.expectedSignals.map(key));
  if(expected.has(null))throw Error('Expected signals need metric labels');
  const observed=new Set(item.after.signals.map(key).filter(Boolean));
  const missing=[...expected].filter(x=>!observed.has(x));
  const qualityPass=missing.length===0&&item.after.quality.complete===true&&
   item.after.quality.sourceContextVerified===true&&
   item.after.quality.causalProof!==true;
  const eligible=baseline&&candidate&&qualityPass;
  rows.push({id:item.id,goal:item.goal||'unknown',
   baselineMeasured:baseline,candidateMeasured:candidate,qualityPass,
   missedSignals:missing,eligibleForSavings:eligible,
   beforeCalls:item.before.calls,afterCalls:item.after.calls,
   beforeTokens:baseline?item.before.totalTokens:null,
   afterTokens:candidate?item.after.totalTokens:null,
   beforeUsd:baseline?item.before.costUsd:null,
   afterUsd:candidate?item.after.costUsd:null,
   tokenDelta:eligible?item.after.totalTokens-item.before.totalTokens:null,
   usdDelta:eligible?round(item.after.costUsd-item.before.costUsd):null});
 }
 const passing=rows.filter(x=>x.eligibleForSavings);
 const sum=(k,items=passing)=>items.reduce((n,x)=>n+x[k],0);
 const totalBefore=sum('beforeTokens'),totalAfter=sum('afterTokens');
 const beforeCost=sum('beforeUsd'),afterCost=sum('afterUsd');
 const fullVerified=passing.length===rows.length;
 return {version:'agent-efficiency-audit-v1',cases:rows,
  quality:{caseCount:rows.length,passed:rows.filter(x=>x.qualityPass).length,
   missedSignals:rows.reduce((n,x)=>n+x.missedSignals.length,0)},
  measurement:{fullyVerified:fullVerified,comparableCases:passing.length,
   incompleteOrUnsafe:rows.length-passing.length},
  verifiedComparableSubset:{
   beforeCalls:sum('beforeCalls'),afterCalls:sum('afterCalls'),
   beforeTokens:totalBefore,afterTokens:totalAfter,
   tokenReductionPct:totalBefore>0?round((1-totalAfter/totalBefore)*100):null,
   beforeUsd:round(beforeCost),afterUsd:round(afterCost),
   costReductionPct:beforeCost>0?round((1-afterCost/beforeCost)*100):null},
  conclusion:fullVerified?'all-cases-measured-and-quality-verified':
   'partial-evidence-do-not-claim-overall-savings'};
}
module.exports={compareCases};
