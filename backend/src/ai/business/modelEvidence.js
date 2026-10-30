'use strict';
const {modelEvidence,safeText}=require('./modelTransport');
// Every output follows a positive aggregate-only schema, including small
// results. Old size-only trimming leaked entire user-level "rows" when short.
// V4 projects each aggregate evidence item independently. Previously, two
// large items could cause ALL values to become {omitted:true}, leaving the AI
// without a single observed statistic. Full values remain in the tool journal.
function forModelV4(result,{maxBytes=3500,legacy=false}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>64000)
  throw Error('模型证据字节预算无效');
 const rows=Array.isArray(result?.evidence)?result.evidence:[];
 const status=['ok','unavailable','error','not-executed'].includes(result?.status)?
  result.status:'unavailable';
 const knownReasons=new Set(['duplicate_investigation',
  'investigation_budget_exceeded','permission_denied',
  'query_budget_exceeded','result_too_large','invalid_parameters']);
 const reason=knownReasons.has(result?.error?.type)?result.error.type:null;
 const number=v=>typeof v==='number'&&Number.isFinite(v);
 const extract=value=>{
  if(value==null||number(value))return value;
  if(typeof value!=='object')return null;
  const out={};
  const fields=['metrics','totals','summary','counts','global','conversion',
   'retention','trade','contentSignals','xOfficial','product_chain'];
  const nums=o=>o&&typeof o==='object'&&!Array.isArray(o)?
   Object.fromEntries(Object.entries(o).filter(([key,v])=>
    number(v)&&!/^(?:id|timestamp|postId|tweetId)$/.test(key)).slice(0,8)):{};
  Object.assign(out,nums(value));
  for(const field of fields){
   const nested=nums(value[field]);
   if(Object.keys(nested).length)out[field]=nested;
  }
  // modelEvidence has already removed row-level data and identifiers.
  for(const field of legacy?[]:['steps','stages','drops','channels','groups','cohorts','sources']){
   if(Array.isArray(value[field]))out[field]=value[field].slice(0,6);
  }
  if(typeof value.available==='boolean')out.available=value.available;
  if(!Object.keys(out).length)out.detailOmitted=true;
  return out;
 };
 const projected=rows.slice(0,24).map(row=>{
  const e=modelEvidence(row);
  return {id:e.id,metricId:e.metricId,value:extract(e.value),
   ...(e.unit?{unit:e.unit}:{}),
   ...(e.numerator!=null?{numerator:e.numerator}:{}),
   ...(e.denominator!=null?{denominator:e.denominator}:{}),
   ...(e.sampleSize!=null?{sampleSize:e.sampleSize}:{}),
   ...(e.period?{period:{start:e.period.start,end:e.period.end}}:{}),
   ...(e.coverage?{coverage:{status:e.coverage.status,
    periodMatched:e.coverage.periodMatched}}:{}),
   ...(!legacy&&e.warnings?.length?{warnings:e.warnings.slice(0,2)}:{})};
 });
 const base={status,evidence:[],omittedEvidence:rows.length,
  transport:'aggregated-business-v4',
  ...(reason?{reason}:{}),
  warnings:[...(legacy?[]:(result?.warnings||[]).slice(0,2).map(x=>safeText(x))),
   '保留逐条聚合数值与证据ID；未传输的维度未知而非0，完整证据保留在只读档案']};
 const fits=()=>Buffer.byteLength(JSON.stringify(base),'utf8')<=maxBytes;
 // Always prioritize several distinct metrics over many similarly shaped
 // values. Each item is individually compacted before budget decisions.
 const seenMetrics=new Set(),ordered=[];
 for(const item of projected)if(!seenMetrics.has(item.metricId)){
  ordered.push(item);seenMetrics.add(item.metricId);
 }
 for(const item of projected)if(!ordered.includes(item))ordered.push(item);
 for(const row of ordered){
  base.evidence.push(row);
  base.omittedEvidence=rows.length-base.evidence.length;
  if(!fits()){
   base.evidence.pop();
   base.omittedEvidence=rows.length-base.evidence.length;
   break;
  }
 }
 // An oversized single item may still carry large provenance: keep its
 // identity and numeric scalar, not a guessed zero or unverified placeholder.
 if(!base.evidence.length&&projected.length){
  const first=projected[0];
  base.evidence=[{id:first.id,metricId:first.metricId,
   value:typeof first.value==='number'||first.value===null?first.value:
    Object.fromEntries(Object.entries(first.value||{}).filter(([k,v])=>number(v)).slice(0,3)),
   period:first.period}];
  base.omittedEvidence=rows.length-1;
  if(!fits()){base.evidence=[];base.omittedEvidence=rows.length;}
 }
 return base;
}
function forModel(result,{maxBytes=12000,projectionVersion='v1',legacy=false}={}){
 if(projectionVersion==='v4')return forModelV4(result,{maxBytes,legacy});
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>64000)
  throw Error('模型证据字节预算无效');
 const rows=Array.isArray(result?.evidence)?result.evidence:[];
 const basic={status:['ok','unavailable','error'].includes(result?.status)?result.status:'unavailable',
  evidence:rows.slice(0,24).map(modelEvidence),
  warnings:[...(result?.warnings||[]).slice(0,7).map(x=>safeText(x)),
   ...(rows.some(r=>r?.value&&typeof r.value==='object')?
     ['模型仅接收白名单业务统计；行级明细未传输，遗漏不代表零']:[])],
  ...(rows.length>24?{omittedEvidence:rows.length-24}:{}),
  ...(result?.cursor?{moreAvailable:true}:{}),
  transport:'aggregated-business-v1'};
 const fits=o=>Buffer.byteLength(JSON.stringify(o),'utf8')<=maxBytes;
 if(fits(basic))return basic;
 let evidence=basic.evidence.map(e=>({...e,
  value:typeof e.value==='number'||e.value==null?e.value:{omitted:true},
  warnings:['仅保留证据元信息，统计摘要超出模型传输预算'],
  coverage:e.coverage,watermarks:e.watermarks}));
 let view={...basic,evidence,warnings:['部分维度摘要已省略；不允许将缺失视为零']};
 if(fits(view))return view;
 evidence=evidence.slice(0,6).map(e=>({id:e.id,metricId:e.metricId,
  definitionVersion:e.definitionVersion,unit:e.unit,
  value:typeof e.value==='number'||e.value==null?e.value:null,
  numerator:e.numerator,denominator:e.denominator,sampleSize:e.sampleSize,
  period:e.period,coverage:{status:'partial',note:'摘要过大'},
  warnings:['需要以证据ID查询更窄的统计范围']}));
 view={status:basic.status,evidence,
  omittedEvidence:rows.length-evidence.length,
  warnings:['只传输可核对的证据身份和统计数值；其他数据已归档，不能视为零'],
  transport:'aggregated-business-v1'};
 if(fits(view))return view;
 // Fail closed instead of sending oversized or unsanitized data to the model.
 return {status:'unavailable',evidence:[],warnings:[
  '统计结果超出模型传输预算；原始证据留在内部档案，请缩小查询范围'],
  transport:'aggregated-business-v1',omittedEvidence:rows.length};
}
module.exports={forModel,forModelV4};
