'use strict';
// Pure, read-only daily operating inbox. Existing DB remains the source of truth.
const {diagnoseProposal}=require('./diagnosis');
function buildGrowthInbox({analyses=[],suggestions=[],reviewEntries=[],alerts=[],proposals=[],now=Date.now()}={}){
 if(![analyses,suggestions,reviewEntries,alerts,proposals].every(Array.isArray)||!Number.isSafeInteger(now))
   throw Error('增长待办输入无效');
 const tasks=[];
 // Only the proposal for the alert's most recent observed business day
 // supersedes an untriaged alert; older dismissed proposals remain historical.
 const latestProposals=new Map();
 for(const p of proposals.slice(0,100)){
  if(!p||typeof p.id!=='string'||typeof p.alert_id!=='string')continue;
  if(Number(p.period_end)!==Number(p.last_period_end))continue;
  latestProposals.set(p.alert_id,p);
  if(p.alert_status!=='open'||Number(p.snooze_until)>now)continue;
  if(p.status==='proposed')tasks.push({
   id:'proposal:'+p.id,kind:'investigation-approval',priority:'P0',
   title:'审批重大异常调查：'+String(p.metric||'').slice(0,50),
   proposalId:p.id,alertId:p.alert_id,status:'awaiting-human-approval',
   source:p.source||'all',goal:p.goal||null,
   evidenceStatus:diagnoseProposal(p).dataQuality.status,
   guidance:'审阅原始异常证据；只有人工批准才可能创建付费模型调用'
  });
  if(p.status==='approved'&&!p.analysis_id)tasks.push({
   id:'proposal:'+p.id,kind:'investigation-dispatch',priority:'P0',
   title:'核查已批准但尚未关联分析的异常提案',
   proposalId:p.id,alertId:p.alert_id,status:'needs-dispatch-review',
   source:p.source||'all',goal:p.goal||null,
   evidenceStatus:diagnoseProposal(p).dataQuality.status,
   guidance:'检查队列及固定请求标识，勿为相同提案创建新的付费任务'
  });
 }
 for(const a of alerts.slice(0,100)){
  if(!a||typeof a.id!=='string'||a.status!=='open'||
     Number(a.snooze_until)>now||latestProposals.has(a.id))continue;
  tasks.push({id:'alert:'+a.id,kind:'growth-alert',
   priority:a.priority==='P0'?'P0':'P1',title:'复查跨日异常：'+String(a.metric||'').slice(0,50),
   alertId:a.id,status:'needs-triage',source:a.source||'all',goal:a.goal||null,
   guidance:'连续完整业务日的观测变化不代表因果；需先确认采集覆盖再决定是否调查'});
 }
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
   failed:tasks.filter(x=>x.kind==='analysis-failed').length,
   alerts:tasks.filter(x=>x.kind==='growth-alert').length,
   proposalApprovals:tasks.filter(x=>x.kind==='investigation-approval').length,
   dispatchReview:tasks.filter(x=>x.kind==='investigation-dispatch').length},
  tasks:tasks.slice(0,100),readOnly:true,paidCalls:0,externalActions:0,
  warnings:['工作台基于已保存的分析与跨日告警，不证明因果；无自动审批或执行']};
}
module.exports={buildGrowthInbox};
