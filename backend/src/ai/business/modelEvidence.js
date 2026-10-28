'use strict';
const {modelEvidence,safeText}=require('./modelTransport');
// Every output follows a positive aggregate-only schema, including small
// results. Old size-only trimming leaked entire user-level "rows" when short.
function forModel(result,{maxBytes=12000}={}){
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
module.exports={forModel};
