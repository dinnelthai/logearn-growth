'use strict';
const {randomUUID}=require('node:crypto');
const {owner}=require('../scope'),{fingerprint}=require('../evidence');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const redact=/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|https?:\/\/\S+|\b0x[a-fA-F0-9]{35,}\b/gi;
function clean(v,depth=0){
 if(depth>6)return null;
 if(typeof v==='string')return v.slice(0,180).replace(redact,'[detail withheld]');
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(v===null||typeof v==='boolean')return v;
 if(Array.isArray(v))return v.slice(0,30).map(x=>clean(x,depth+1));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,40)
  .filter(([key])=>!/(?:secret|api.?key|auth|credential|email|wallet|personal|instruction)/i.test(key))
  .map(([key,val])=>[key,clean(val,depth+1)]));
 return null;
}
// This type is not a LogEarn metric or GSC observation; it is a third-party
// record. It deliberately does not call describeMetric().
function makeExternalEvidence(input,context){
 const ownerId=owner(context),period=context.period;
 if(!period||!Number.isSafeInteger(period.start)||!Number.isSafeInteger(period.end)||
    period.start>=period.end)fail('外部证据查询期间无效');
 const value=clean(input.value),acquiredAt=new Date().toISOString();
 const checkedAt=typeof value.checkedAt==='string'&&Number.isFinite(Date.parse(value.checkedAt))?
  value.checkedAt:null;
 const warnings=Array.isArray(value.warnings)?value.warnings.slice(0,6).filter(x=>typeof x==='string'):[];
 const query={metricId:'external_rank_snapshot',definitionVersion:input.version,
  filters:{scope:context.scope||{source:'all'}},period,
  query:{tool:input.capabilityId,parametersFingerprint:fingerprint(input.input||{})}};
 return JSON.parse(JSON.stringify({id:randomUUID(),ownerId,...query,unit:'rank',value,
  numerator:null,denominator:null,sampleSize:null,
  external:{provider:input.provider,capabilityId:input.capabilityId,
   version:input.version,sourceType:input.sourceType,connectionId:input.connectionId,
   projectId:input.projectId,acquiredAt,checkedAt,costStatus:'not_billable',
   truncated:Array.isArray(input.value?.rankings)&&input.value.rankings.length>30},
  sourceVersions:{events:null,searchConsole:null,provider:input.provider},
  watermarks:{events:null,searchConsole:null,external:checkedAt},
  coverage:{status:typeof value.coverage?.status==='string'?value.coverage.status:'unknown'},
  warnings,queryFingerprint:fingerprint(query),generatedAt:acquiredAt,
  reportLocator:{page:'external-connector',period,scope:query.filters.scope},supersedesId:null}));
}
module.exports={makeExternalEvidence};
