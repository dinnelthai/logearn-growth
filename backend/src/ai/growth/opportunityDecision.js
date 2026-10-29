'use strict';
// Explainable, non-monetized ordering. Unknown impact and unknown effort are
// missing facts, not fabricated zeroes or hidden numeric weights.
const CHOICES=['investigate','implement','defer','not_comparable'];
const CONFIDENCE=['high','medium','low','unknown'];
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function decide(item){
 const reasons=[];
 if(!Array.isArray(item.evidenceIds)||!item.evidenceIds.length)
  return {choice:'defer',reasons:['没有可引用的证据']};
 if(item.impact?.affectedUsers==null)reasons.push('影响人数未知');
 if(item.effort?.hours==null)reasons.push('实施投入未知');
 if(item.confidence==='unknown'||item.confidence==='low')reasons.push('证据置信度有限');
 if(item.state==='unavailable'||item.state==='immature')reasons.push('数据不可用或未成熟');
 if(reasons.length)return {choice:'investigate',reasons};
 if(!finite(item.impact.affectedUsers)||!finite(item.effort.hours))
  return {choice:'not_comparable',reasons:['影响或投入不是可比较的有限非负数']};
 return {choice:item.confidence==='high'?'implement':'investigate',
  reasons:item.confidence==='high'?
   ['证据覆盖较强，影响与投入均已知，仍须人工批准']:['继续验证支持证据与目标关联']};
}
const tier={implement:0,investigate:1,defer:2,not_comparable:3};
function compare(items){
 if(!Array.isArray(items)||items.length>200)throw Error('机会比较数量无效');
 const ranked=items.map(item=>({...item,decision:decide(item)}));
 ranked.sort((a,b)=>tier[a.decision.choice]-tier[b.decision.choice]||
  // Prefer known observed impact within same decision tier; never mix
  // unknown impact with zero. Do not manufacture ROI.
  ((a.metricId&&a.metricId===b.metricId&&a.definitionVersion&&
    a.definitionVersion===b.definitionVersion&&
    JSON.stringify(a.period)===JSON.stringify(b.period)&&
    JSON.stringify(a.scope)===JSON.stringify(b.scope)&&
    a.impact?.affectedUsers!=null&&b.impact?.affectedUsers!=null)
   ?b.impact.affectedUsers-a.impact.affectedUsers:0)||
  String(a.id||a.subject).localeCompare(String(b.id||b.subject)));
 return {items:ranked,method:'evidence-then-observed-impact-v1',
  caveat:'不是预测收益或因果排序；不同口径、不同时段与不同成熟度的影响值不能直接比较',
  counts:Object.fromEntries(CHOICES.map(k=>[k,ranked.filter(x=>x.decision.choice===k).length]))};
}
module.exports={decide,compare,CHOICES,CONFIDENCE};
