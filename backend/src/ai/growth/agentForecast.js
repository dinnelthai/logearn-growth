'use strict';
const {definitions}=require('../../analytics/businessPriorities');
const metrics=new Set(Object.keys(definitions));
function validateForecast(f,validationMetrics,evidence){
 if(f==null)return null;
 if(!f||typeof f!=='object'||Array.isArray(f)||
  !metrics.has(f.metric)||f.metric!==validationMetrics?.primary||
  !['increase','decrease'].includes(f.direction)||
  !Number.isSafeInteger(f.horizonDays)||f.horizonDays<3||f.horizonDays>14||
  !Number.isFinite(f.minRelativeChangePct)||f.minRelativeChangePct<0||
  f.minRelativeChangePct>100||!['low','medium','high'].includes(f.confidence)||
  !Array.isArray(f.evidenceIds)||!f.evidenceIds.length||
  f.evidenceIds.some(id=>typeof id!=='string'||!evidence?.evidenceIds?.includes(id)))
  throw Error('结构化预测需提供已验证指标、3–14天观察期、方向、幅度和真实证据ID');
 return {metric:f.metric,direction:f.direction,horizonDays:f.horizonDays,
  minRelativeChangePct:f.minRelativeChangePct,confidence:f.confidence,
  evidenceIds:[...new Set(f.evidenceIds)].slice(0,12)};
}
function calibrateForecast(f,review){
 if(!f)return {status:'not-issued',observedHit:null};
 const days=Number(review?.effect_period?.days);
 const metric=review?.metric_changes?.[f.metric];
 if(days!==f.horizonDays||metric?.available!==true||
  !Number.isFinite(metric.baseline)||metric.baseline<=0||
  !Number.isFinite(metric.effect)||!['medium','high'].includes(review.confidence))
  return {status:'insufficient',observedHit:null,
   reason:'观察期、分母或复盘可信度不足以校准原预测'};
 const pct=(metric.effect-metric.baseline)/metric.baseline*100;
 const hit=f.direction==='increase'?pct>=f.minRelativeChangePct:pct<=-f.minRelativeChangePct;
 return {status:hit?'observed-hit':'observed-miss',observedHit:hit,
  observedChangePct:pct,requiredChangePct:f.minRelativeChangePct,
  direction:f.direction,horizonDays:f.horizonDays,
  causalProof:false,
  caveat:'预测方向与同周期观测是否一致，不等于运营行动导致结果'};
}
module.exports={validateForecast,calibrateForecast};
