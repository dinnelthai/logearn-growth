'use strict';
// Human labels are observations, not proof that advice caused business growth.
const dimensions=['facts','evidence','investigation','action','uncertainty'];
function compareActivationReviews(cases){
 if(!Array.isArray(cases))throw Error('评测案例必须为数组');
 const ids=new Set(),incomplete=[],pairs=[];
 const complete=review=>typeof review?.reviewer==='string'&&review.reviewer.trim()&&
  dimensions.every(key=>typeof review.ratings?.[key]==='boolean');
 for(const item of cases){
  if(typeof item?.id!=='string'||!item.id.trim()||ids.has(item.id))throw Error('案例 ID 缺失或重复');
  ids.add(item.id);
  if(complete(item.baseline)&&complete(item.candidate))pairs.push(item);
  else incomplete.push(item.id);
 }
 const results=Object.fromEntries(dimensions.map(key=>{
  const baselinePassed=pairs.filter(p=>p.baseline.ratings[key]).length;
  const candidatePassed=pairs.filter(p=>p.candidate.ratings[key]).length;
  return [key,{baselinePassed,candidatePassed,
   improved:pairs.filter(p=>!p.baseline.ratings[key]&&p.candidate.ratings[key]).length,
   regressed:pairs.filter(p=>p.baseline.ratings[key]&&!p.candidate.ratings[key]).length,
   baselineRate:pairs.length?baselinePassed/pairs.length:null,
   candidateRate:pairs.length?candidatePassed/pairs.length:null}];
 }));
 return {version:'activation-human-review-v1',total:cases.length,comparable:pairs.length,
  incomplete,dimensions:results,note:'人工标注的配对结果，不代表模型通过发布门槛或行动带来的因果效果。'};
}
module.exports={compareActivationReviews};
