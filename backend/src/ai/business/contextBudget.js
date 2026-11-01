'use strict';
// These are model-facing summaries, not changes to stored/source evidence.
// Omitted records stay explicit; truncated structured fields remain valid JSON.
const text=(value,limit)=>{
 if(typeof value!=='string')return '';
 if(Buffer.byteLength(value,'utf8')<=limit)return value;
 return Buffer.from(value,'utf8').subarray(0,limit).toString('utf8')
  .replace(/\uFFFD+$/g,'');
};
function compactValidationMetrics(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const primary=typeof value.primary==='string'?text(value.primary,80):'';
 const secondary=Array.isArray(value.secondary)?
  [...new Set(value.secondary.filter(x=>typeof x==='string').map(x=>text(x,80)).filter(Boolean))].slice(0,3):[];
 if(!primary&&!secondary.length)return null;
 return {...(primary?{primary}:{}),...(secondary.length?{secondary}:{})};
}
function compactApplicableScope(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const source=typeof value.source==='string'&&/^[a-z0-9_-]{1,80}$/i.test(value.source)?
  value.source:'all';
 return {source};
}
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
 const seenRows=new Set(chosen);
 const seenIds=new Set(chosen.map(r=>r.id).filter(id=>typeof id==='string'));
 const seen=row=>seenRows.has(row)||(typeof row.id==='string'&&seenIds.has(row.id));
 const add=row=>{
  if(seen(row))return;
  chosen.push(row);seenRows.add(row);
  if(typeof row.id==='string')seenIds.add(row.id);
 };
 // Keep older positive and negative outcomes as counterexamples.
 for(const kind of ['ineffective','effective','unknown','rejected']){
  if(chosen.length>=limit)break;
  const match=rows.slice(10).find(x=>!seen(x)&&x.effectiveness===kind);
  if(match)add(match)
 }
 for(const row of rows){
  if(chosen.length>=limit)break;
  if(seen(row))continue;
  add(row);
 }
 const items=chosen.map(r=>({
  id:r.id,business_problem:text(r.business_problem,360),
  action:text(r.action,240),actual_action:text(r.actual_action,240),
  result_summary:text(r.result_summary,400),
  effectiveness:r.effectiveness??null,user_status:r.user_status??null,
  rejection_reason:text(r.rejection_reason,240),
  validation_metrics:compactValidationMetrics(r.validation_metrics),
  applicable_scope:compactApplicableScope(r.applicable_scope),
  executed_at:r.executed_at??null,reviewed_at:r.reviewed_at??null,
  updated_at:r.updated_at??null
 }));
 return {items,meta:{total:rows.length,shown:items.length,
  omitted:rows.length-items.length,
  truncatedEntries:chosen.filter(r=>Object.entries({
   business_problem:360,action:240,actual_action:240,result_summary:400
  }).some(([key,limit])=>Buffer.byteLength(String(r[key]||''),'utf8')>limit)).length,
  note:'摘要保留不同效果的复盘反证；原始结果未被修改，遗漏不等于不存在'}};
}
module.exports={compactChanges,compactMemory};
