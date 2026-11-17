'use strict';
// These are model-facing summaries, not changes to stored/source evidence.
// Omissions remain explicit so the model cannot mistake an excerpt for full history.
const text=(value,limit)=>{
 if(typeof value!=='string')return '';
 if(Buffer.byteLength(value,'utf8')<=limit)return value;
 // Truncate on a UTF-8 byte boundary; never emit a replacement character.
 return Buffer.from(value,'utf8').subarray(0,limit).toString('utf8')
  .replace(/\uFFFD+$/g,'');
};
const boundedJson=(value,limit)=>{
 if(value==null)return null;
 const serialized=JSON.stringify(value);
 return serialized.length>limit?serialized.slice(0,limit)+' [truncated JSON excerpt]':value;
};
function compactChanges(rows,{limit=16,maxContent=650}={}){
 if(!Array.isArray(rows)||!Number.isInteger(limit)||limit<1||limit>50||
   !Number.isInteger(maxContent)||maxContent<100||maxContent>2000)
  throw Error('业务变更摘要配置无效');
 const selected=rows.slice(0,limit);
 const items=selected.map(r=>({
  id:r.id,kind:r.kind,source:r.source,
  occurredAt:r.occurredAt,validUntil:r.validUntil??null,
  content:text(r.content,maxContent)
 }));
 return {items,meta:{
  total:rows.length,shown:items.length,omitted:rows.length-items.length,
  truncatedEntries:selected.filter(x=>Buffer.byteLength(String(x.content||''),'utf8')>maxContent).length,
  note:'仅为模型上下文摘要，未展示的历史记录仍在原始台账；不能据此断言不存在其他变更'
 }};
}
function compactMemory(rows,{limit=16}={}){
 if(!Array.isArray(rows)||!Number.isInteger(limit)||limit<1||limit>30)
  throw Error('历史经验摘要配置无效');
 const chosen=rows.slice(0,Math.min(limit,10));
 const seen=new Set(chosen.map(r=>r.id));
 // Preserve older negative and positive feedback as counterexamples.
 for(const kind of ['ineffective','effective','unknown','rejected']){
  if(chosen.length>=limit)break;
  const match=rows.slice(10).find(x=>!seen.has(x.id)&&x.effectiveness===kind);
  if(match){chosen.push(match);seen.add(match.id)}
 }
 for(const row of rows){
  if(chosen.length>=limit)break;
  if(seen.has(row.id))continue;
  chosen.push(row);seen.add(row.id);
 }
 const items=chosen.map(r=>({
  id:r.id,business_problem:text(r.business_problem,360),
  action:text(r.action,240),actual_action:text(r.actual_action,240),
  result_summary:text(r.result_summary,400),
  effectiveness:r.effectiveness??null,user_status:r.user_status??null,
  rejection_reason:text(r.rejection_reason,240),
  validation_metrics:boundedJson(r.validation_metrics,400),
  applicable_scope:boundedJson(r.applicable_scope,400),
  executed_at:r.executed_at??null,reviewed_at:r.reviewed_at??null,
  updated_at:r.updated_at??null
 }));
 return {items,meta:{total:rows.length,shown:items.length,
  omitted:rows.length-items.length,
  truncatedEntries:chosen.filter(r=>['business_problem','action','actual_action','result_summary']
   .some(k=>String(r[k]||'').length>({business_problem:360,action:240,actual_action:240,result_summary:400}[k]))).length,
  note:'摘要保留不同效果的复盘反证；原始结果未被修改，遗漏不等于不存在'}};
}
module.exports={compactChanges,compactMemory};
