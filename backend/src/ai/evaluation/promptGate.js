'use strict';
// Offline, deterministic promotion gate. Uses node:test for regression suites;
// the model cannot override thresholds, fixture outcomes or approval records.
const {createHash}=require('node:crypto');
const hash=content=>createHash('sha256').update(content).digest('hex');
const CRITICAL=Object.freeze(['owner-isolation','scope-isolation','evidence-integrity','unknown-is-not-zero','budget-fence','prompt-injection']);
function validateCandidate(candidate){
 if(!candidate||typeof candidate.content!=='string'||!candidate.content.trim()||
   candidate.content.length>50000||!['analysis','planning','review','tool-selection','conclusion'].includes(candidate.role))
  throw Error('Invalid prompt candidate');
 return {role:candidate.role,hash:hash(candidate.content),content:candidate.content};
}
function evaluateCandidate({candidate,baseline,results,limits={}}){
 const next=validateCandidate(candidate),previous=validateCandidate(baseline);
 if(next.role!==previous.role)throw Error('Prompt roles differ');
 if(!Array.isArray(results)||!results.length||results.some(r=>
   !r||typeof r.id!=='string'||!r.id||typeof r.passed!=='boolean'||
   !Number.isFinite(r.quality)||r.quality<0||r.quality>1||
   !Number.isFinite(r.cost)||r.cost<0||!Number.isFinite(r.latencyMs)||r.latencyMs<0))
  throw Error('Invalid independent evaluation results');
 const unique=new Set(results.map(x=>x.id));
 if(unique.size!==results.length)throw Error('Duplicate evaluation case');
 const checks=CRITICAL.map(id=>({id,passed:results.some(x=>x.id===id&&x.passed)}));
 const quality=results.reduce((sum,x)=>sum+x.quality,0)/results.length;
 const baselineQuality=limits.baselineQuality;
 const maxCost=limits.maxCost, maxLatencyMs=limits.maxLatencyMs;
 const configured=[baselineQuality,maxCost,maxLatencyMs].every(Number.isFinite);
 const failures=checks.filter(x=>!x.passed).map(x=>x.id);
 if(results.some(x=>!x.passed))failures.push('regression-failure');
 if(!configured)failures.push('limits-not-configured');
 else{
  if(quality<baselineQuality)failures.push('quality-regression');
  if(results.reduce((s,x)=>s+x.cost,0)>maxCost)failures.push('cost-limit');
  if(Math.max(...results.map(x=>x.latencyMs))>maxLatencyMs)failures.push('latency-limit');
 }
 return Object.freeze({version:'prompt-evaluation-v1',candidateHash:next.hash,baselineHash:previous.hash,
  role:next.role,checks,quality,caseCount:results.length,failures:[...new Set(failures)],
  eligible:failures.length===0,requiresHumanApproval:true,
  independentSuiteRequired:true, evaluatedAt:null});
}
function authorizePromotion({evaluation,candidate,baseline,approval,env=process.env}){
 const next=validateCandidate(candidate),prev=validateCandidate(baseline);
 if(env.AI_PROMPT_AUTO_PUBLISH!=='1')throw Error('Prompt publishing is disabled');
 if(!evaluation?.eligible||evaluation.candidateHash!==next.hash||
   evaluation.baselineHash!==prev.hash||next.hash===prev.hash)
  throw Error('Independent evaluation or baseline does not match');
 if(!approval||approval.candidateHash!==next.hash||
   typeof approval.approvedBy!=='string'||!approval.approvedBy.trim()||
   approval.approvedBy==='model'||approval.approvedBy==='agent')
  throw Error('Explicit human approval required');
 return {from:prev.hash,to:next.hash,role:next.role,approvedBy:approval.approvedBy};
}
module.exports={CRITICAL,validateCandidate,evaluateCandidate,authorizePromotion};
