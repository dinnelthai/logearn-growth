'use strict';
const {requiredString}=require('./contracts');
function fromExistingEvidence(owner,legacy){
 if(!legacy||typeof legacy!=='object'||legacy.ownerId!==owner)throw Object.assign(Error('现有证据不属于当前用户'),{status:403});
 const period=legacy.period;
 if(period?.timezone!=='Asia/Bangkok'||!Number.isSafeInteger(period.start)||!Number.isSafeInteger(period.end))throw Error('来源证据时区/期间无效');
 const countIsObserved=typeof legacy.value==='number'&&Number.isFinite(legacy.value);
 const completeCoverage=legacy.coverage?.events==='history_confirmed'||legacy.coverage?.status==='verified';
 const watermark=legacy.watermarks?.events;
 const hasWatermark=typeof watermark==='string'&&Number.isFinite(Date.parse(watermark))||Number.isSafeInteger(watermark);
 const state=countIsObserved&&completeCoverage&&hasWatermark?'verified':countIsObserved?'partial':'unavailable';
 return {id:requiredString(legacy.id,'原始证据ID'),source:'legacy-business-evidence',definitionVersion:requiredString(legacy.definitionVersion,'指标定义版本'),
  state,value:state==='verified'?legacy.value:null,period,
  watermarks:legacy.watermarks||{},coverage:legacy.coverage||{status:'unknown'},
  warnings:[...(legacy.warnings||[]),...(state!=='verified'?['源覆盖或水位尚未独立验证，不能把此数字作为目标达成事实']:[])],
  observedAt:Number.isFinite(Date.parse(legacy.generatedAt))?Date.parse(legacy.generatedAt):Date.now(),
  originalLocator:legacy.reportLocator||{evidenceId:legacy.id}}
}
function importExistingEvidence(store,owner,legacy){return store.saveEvidence(owner,fromExistingEvidence(owner,legacy))}
module.exports={fromExistingEvidence,importExistingEvidence};
