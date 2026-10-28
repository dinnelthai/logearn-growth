'use strict';
// This is a model transport view only. Tool evidence, query results and the
// execution transcript are archived in their original form before this runs.
const CORE=['id','metricId','definitionVersion','unit','value','numerator','denominator',
 'sampleSize','period','filters','sourceVersions','watermarks','coverage','warnings','page'];
function excerpt(value,depth=0){
 if(depth>=5)return Array.isArray(value)?{omittedItems:value.length}:'[nested detail omitted]';
 if(Array.isArray(value))return value.length>4
  ?{sample:value.slice(0,4).map(v=>excerpt(v,depth+1)),omittedItems:value.length-4}
  :value.map(v=>excerpt(v,depth+1));
 if(value&&typeof value==='object'){
  const entries=Object.entries(value),parts=entries.slice(0,35)
   .map(([key,v])=>[key,excerpt(v,depth+1)]);
  return {...Object.fromEntries(parts),...(entries.length>35?{omittedFields:entries.length-35}:{})};
 }
 if(typeof value==='string'&&value.length>1200)return value.slice(0,1200)+' [text truncated]';
 return value;
}
function forModel(result,{maxBytes=12000}={}){
 if(!result||Buffer.byteLength(JSON.stringify(result))<=maxBytes)return result;
 if(result.status!=='ok'||!Array.isArray(result.evidence))return result;
 const evidence=result.evidence.map(row=>{
  const copy=Object.fromEntries(CORE.filter(k=>row&&Object.hasOwn(row,k)).map(k=>[k,k==='value'?excerpt(row[k]):excerpt(row[k])]));
  return copy;
 });
 let view={status:result.status,evidence,cursor:result.cursor,
  warnings:[...(result.warnings||[]),'模型只收到分页/摘要，原始调查结果仍在证据库']};
 // Hard transport bound: preserve the identity and data quality of each
 // evidence item even when its nested value cannot fit.
 if(Buffer.byteLength(JSON.stringify(view))>maxBytes){
  view={status:result.status,evidence:result.evidence.map(row=>({
   id:row.id,metricId:row.metricId,definitionVersion:row.definitionVersion,
   value:typeof row.value==='number'||row.value==null?row.value:{omitted:true,reason:'large-object; query evidence by ID'},
   unit:row.unit,period:row.period,coverage:excerpt(row.coverage,1),
   sourceVersions:excerpt(row.sourceVersions,1),watermarks:excerpt(row.watermarks,1),
   warnings:['大对象已归档，模型未接收原始明细']
  })),cursor:result.cursor,warnings:['结果摘要已截断；不可据此断言缺失值为零']};
 }
 return view;
}
module.exports={forModel};
