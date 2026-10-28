'use strict';
const {normalizeEvidence,goalProgress}=require('./contracts');
const {periodLabel}=require('./period');
function safeSourceHealth(source){
 if(typeof source?.id!=='string'||!/^[a-z0-9_-]{1,64}$/.test(source.id))throw Error('数据源标识无效');
 const state=source.state;
 if(!['connected','not-configured','partial','stale','unknown'].includes(state))throw Error('数据源状态无效');
 return {id:source.id,state,asOf:Number.isSafeInteger(source.asOf)?source.asOf:null,
  coverage:typeof source.coverage==='string'?source.coverage.slice(0,80):'unknown',
  evidenceId:typeof source.evidenceId==='string'?source.evidenceId:null};
}
// A deterministic, read-only signal collector; it cannot infer a business decline
// from a partial, immature or entirely unavailable source.
function discover(owner,store,{sources=[],signals=[],at=Date.now(),maxNew=8}={}){
 if(!Number.isSafeInteger(at)||!Number.isInteger(maxNew)||maxNew<1||maxNew>50)throw Error('发现预算无效');
 const results=[];
 for(const raw of sources.slice(0,30)){
  const source=safeSourceHealth(raw);
  if(source.state==='connected')continue;
  const evidenceIds=source.evidenceId&&store.getEvidence(owner,source.evidenceId)?[source.evidenceId]:[];
  if(!['not-configured','partial','stale'].includes(source.state)&&!source.evidenceId)continue;
  const status=source.state==='stale'&&source.asOf==null?'覆盖未知':source.state==='not-configured'?'尚未配置官方连接':'采样/水位不完整';
  results.push({type:'data-quality',subject:`source:${source.id}`,scope:{source:source.id},
   description:`${source.id} 数据可信度待核验：${status}。不能推断无用户或无转化。`,
   evidenceIds,priority:source.state==='not-configured'?2:3,
   impact:{status:'unknown',affectedJudgement:'相关渠道增长及归因判断'},
   nextStep:'核查该来源授权、采集范围、事件水位及身份映射'});
 }
 for(const s of signals.slice(0,30)){
  if(!s||typeof s.subject!=='string'||!s.currentEvidenceId||!s.baselineEvidenceId)continue;
  const current=store.getEvidence(owner,s.currentEvidenceId),baseline=store.getEvidence(owner,s.baselineEvidenceId);
  if(!current||!baseline)continue;
  const a=normalizeEvidence(current),b=normalizeEvidence(baseline);
  if(a.state!=='verified'||b.state!=='verified'||a.value===null||b.value===null||
   a.definitionVersion!==b.definitionVersion||a.source!==b.source||a.period.start===b.period.start)continue;
  if(b.value<=0||!Number.isFinite(b.value))continue;
  const change=(a.value-b.value)/b.value;
  const threshold=Number.isFinite(s.threshold)&&s.threshold>0?s.threshold:0.20;
  const minBase=Number.isInteger(s.minBaseline)&&s.minBaseline>0?s.minBaseline:20;
  if(b.value<minBase||change>-threshold)continue;
  const id=`${s.metricId||'metric'}:${s.subject}`.slice(0,256);
  results.push({type:'business',subject:id,scope:s.scope||{source:'all'},metricId:s.metricId,
   goalId:s.goalId||null,goalVersion:s.goalVersion||null,
   description:`已验证来源的指标出现下降，当前值 ${a.value}，基线 ${b.value}（相对变化 ${(change*100).toFixed(1)}%），原因待验证。`,
   evidenceIds:[b.id,a.id],priority:s.goalId?4:3,
   impact:{status:'observed-relative-change',fraction:change,affectedJudgement:s.subject},
   nextStep:'先核对口径、分母、渠道与路径，再确定是否需要运营动作'});
 }
 const created=[],updated=[],skipped=[];
 for(const item of results){if(created.length>=maxNew&&results.length>maxNew){skipped.push(item.subject);continue}
  const p=store.observeProblem(owner,item);(p.created?created:updated).push({id:p.id,subject:p.subject})}
 return {created,updated,skipped,sourceCount:sources.length,signalsInspected:signals.length,
  paidCalls:0,externalWrites:0,visibility:results.length?'signals-or-gaps-found':'no-verified-new-signal',
  caveat:'无新信号不代表全部渠道健康；没有配置的源须单独报告'};
}
function questionDecision({missingBusinessAnswer,previousAnswer,canLookup,blocking=false,reason,impact}){
 if(previousAnswer!=null)return {ask:false,reuseAnswer:true};
 if(canLookup)return {ask:false,investigateWithTools:true};
 if(missingBusinessAnswer!==true)return {ask:false};
 return {ask:true,blocking:blocking===true,reason:String(reason||'缺少人工业务事实').slice(0,500),impact:String(impact||'影响下一步判断').slice(0,500)};
}
module.exports={discover,questionDecision,safeSourceHealth};
