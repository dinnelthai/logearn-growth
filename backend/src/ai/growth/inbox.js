'use strict';
// Pure, read-only daily operating inbox. Existing DB remains the source of truth.
function buildGrowthInbox({analyses=[],suggestions=[],reviewEntries=[],now=Date.now()}={}){
 if(![analyses,suggestions,reviewEntries].every(Array.isArray)||!Number.isSafeInteger(now))
   throw Error('增长待办输入无效');
 const tasks=[];
 for(const a of analyses.slice(0,100)){
  if(!a||typeof a.id!=='string')continue;
  if(a.status==='failed')tasks.push({
   id:'analysis:'+a.id,kind:'analysis-failed',priority:'P1',
   title:'核查失败的 AI 增长分析',analysisId:a.id,status:'review-required',
   guidance:'检查失败原因和付费调用日志，禁止无证据地从头重试'});
  if(a.status==='processing'&&Number(a.created_at)>0&&now-Number(a.created_at)>3600000)
   tasks.push({id:'analysis:'+a.id,kind:'analysis-stalled',priority:'P0',
    title:'核查长时间运行的分析',analysisId:a.id,status:'review-required',
    guidance:'先检查执行租约及 checkpoint；不要重复发起模型调用'});
 }
 for(const s of suggestions.slice(0,200)){
  if(!s||typeof s.id!=='string')continue;
  if(s.user_status==='pending')tasks.push({id:'suggestion:'+s.id,
   kind:'approval',priority:['P0','P1','P2'].includes(s.priority)?s.priority:'P2',
   title:String(s.business_problem||'待审批增长建议').slice(0,180),
   suggestionId:s.id,analysisId:s.analysis_id||null,status:'awaiting-human-approval',
   guidance:'先验证证据、成本及影响范围；批准仅记录决策，不执行外部动作'});
  else if(s.user_status==='adopted'||s.user_status==='executing')
   tasks.push({id:'suggestion:'+s.id,kind:'execution-followup',
    priority:['P0','P1','P2'].includes(s.priority)?s.priority:'P2',
    title:String(s.business_problem||'待跟进增长行动').slice(0,180),
    suggestionId:s.id,analysisId:s.analysis_id||null,status:s.user_status,
    guidance:'记录真实执行情况；系统不得推断操作已生效'});
 }
 for(const r of reviewEntries.slice(0,200)){
  if(r?.status!=='ready'||typeof r.suggestionId!=='string')continue;
  tasks.push({id:'review:'+r.suggestionId,kind:'retrospective',priority:r.priority||'P1',
   title:String(r.title||'到期运营复盘').slice(0,180),
   suggestionId:r.suggestionId,analysisId:r.analysisId||null,status:'ready',
   guidance:'复盘是观测比较，不证明因果；人工决定是否启动付费模型'});
 }
 const rank={P0:0,P1:1,P2:2};
 tasks.sort((a,b)=>(rank[a.priority]??2)-(rank[b.priority]??2)||
  a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 return {version:'growth-inbox-v1',generatedAt:now,
  counts:{total:tasks.length,approval:tasks.filter(x=>x.kind==='approval').length,
   review:tasks.filter(x=>x.kind==='retrospective').length,
   failed:tasks.filter(x=>x.kind==='analysis-failed').length},
  tasks:tasks.slice(0,100),readOnly:true,paidCalls:0,externalActions:0,
  warnings:['工作台基于已有记录，不是全部增长机会或完整异常告警；无自动审批或执行']};
}
module.exports={buildGrowthInbox};
