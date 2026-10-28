'use strict';
const crypto=require('node:crypto');
const {OFFSET}=require('./period');
const STATES=new Set(['verified','partial','immature','unavailable']);
const TYPES=new Set(['business','data-quality','hypothesis','user']);
const key=object=>crypto.createHash('sha256').update(JSON.stringify(object)).digest('hex');
function requiredString(value,name,max=256){if(typeof value!=='string'||!value.trim()||value.length>max)throw Object.assign(Error(name+'无效'),{status:400});return value.trim()}
function scopeKey(input){const clean=input&&typeof input==='object'&&!Array.isArray(input)?input:{source:'all'};const keys=Object.keys(clean).sort();if(keys.length>15)throw Error('范围维度过多');const out=Object.create(null);for(const k of keys){if(['__proto__','prototype','constructor'].includes(k)||!/^[a-zA-Z0-9_]{1,64}$/.test(k)||typeof clean[k]!=='string'||clean[k].length>200)throw Error('范围无效');out[k]=clean[k]}return JSON.stringify(out)}
function normalizeEvidence(input){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('缺少证据对象');
 const state=requiredString(input.state,'证据状态',32);
 if(!STATES.has(state))throw Error('未知证据状态');
 const source=requiredString(input.source,'证据来源',80),definitionVersion=requiredString(input.definitionVersion||'unknown','指标定义版本',80);
 const start=input.period?.start,end=input.period?.end;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end||start<0)throw Error('证据时间窗口无效');
 const value=input.value===undefined?null:input.value;
 if(state!=='verified'&&state!=='partial'&&value!==null)throw Error('未成熟或不可用证据值必须为 null');
 if(value!==null&&(!Number.isFinite(value)||typeof value!=='number'))throw Error('证据值必须是数字或 null');
 const warnings=Array.isArray(input.warnings)?input.warnings.filter(x=>typeof x==='string').slice(0,10).map(x=>x.slice(0,200)):[];
 return Object.freeze({id:requiredString(input.id,'证据 ID'),source,definitionVersion,
  state,value,period:{start,end,timezone:input.period.timezone||'Asia/Bangkok'},
  watermarks:input.watermarks&&typeof input.watermarks==='object'?input.watermarks:{},
  coverage:input.coverage&&typeof input.coverage==='object'?input.coverage:{status:'unknown'},
  warnings,observedAt:Number.isSafeInteger(input.observedAt)?input.observedAt:Date.now(),
  originalLocator:input.originalLocator||null});
}
function goalProgress(goal,evidence){if(!goal)return {status:'no-goal',observed:null,delta:null};
 if(!evidence)return {status:'unknown',reason:'no-evidence',observed:null,delta:null};
 const e=normalizeEvidence(evidence);
 if(e.state!=='verified'||e.value===null)return {status:e.state,reason:'insufficient-or-immature',observed:null,delta:null,evidenceId:e.id};
 if(e.definitionVersion!==goal.definition_version)return {status:'unknown',reason:'definition-version-mismatch',observed:null,delta:null};
 // Rolling distinct users is a single interval observation, NEVER summed from daily rows.
 const delta=goal.direction==='decrease'?goal.target_value-e.value:e.value-goal.target_value;
 return {status:'verified',observed:e.value,target:goal.target_value,delta,met:delta>=0,
  aggregation:goal.aggregation,evidenceId:e.id};}
function fingerprint({type,subject,scope,metricId=null,goalId=null}){
 if(!TYPES.has(type))throw Error('无效问题类型');
 return key([type,requiredString(subject,'业务对象'),scopeKey(scope),metricId||null,goalId||null]);
}
function businessDay(ms){return new Date(ms+OFFSET).toISOString().slice(0,10)}
module.exports={STATES,TYPES,key,requiredString,scopeKey,normalizeEvidence,goalProgress,fingerprint,businessDay};
