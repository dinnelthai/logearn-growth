'use strict';
// Weekly AI report is an explicit user-initiated analysis, never a scheduled or free report.
// Its context contains only owner-scoped aggregate counts; no user/event rows or action text.
const {lastCompleted}=require('./workspace/period');

function weeklyPeriod(now=Date.now()){return lastCompleted('weekly',now);}
function weeklyKey(period){return 'weekly-ai-v1:'+period.start+':'+period.end;}
function weeklyOperations(store,owner,period){
 const problems=store.problems(owner,{limit:200}),actions=store.actions(owner,{limit:200});
 const inWeek=(at)=>Number(at)>=period.start&&Number(at)<period.end;
 return {
  source:'saved-workspace-aggregate',observedAt:Date.now(),
  goalsCount:store.listGoals(owner,{start:period.start,end:period.end,versions:true}).length,
  newProblemCount:problems.filter(p=>inWeek(p.first_seen)).length,
  unresolvedCount:problems.filter(p=>['open','monitoring'].includes(p.status)).length,
  dataQualityCount:problems.filter(p=>p.type==='data-quality'&&['open','monitoring'].includes(p.status)).length,
  newActionCount:actions.filter(a=>inWeek(a.created_at)).length,
  executedActionCount:actions.filter(a=>a.status==='executed'&&inWeek(a.executed_at)).length,
  reviewedActionCount:actions.filter(a=>a.review&&inWeek(a.updated_at)).length,
  pendingActionCount:actions.filter(a=>['proposed','accepted','executing'].includes(a.status)).length,
  note:'新增/执行按已保存时间筛选完整周；未解决/待办为报告生成时的当前状态；列表最多200条，数量仅为已保存记录，不代表全站总量。'
 };
}
const weeklyPrompt=`
本任务是 LogEarn「真实 AI 运营周报」，不是泛化建议或模板重排。仅分析 context.period 的最后一个完整自然周（周一00:00至下周一00:00，Asia/Bangkok），对比同口径前一周已观测数据。先判定来源、数据新鲜度、业务事件覆盖，不能把缺失观测记为0，不能把SEO曝光/点击当作注册和交易，不得把相关性写成因果。
结合 context.weeklyOperations（仅存储记录的聚合数量，未覆盖全量运营系统）与 context.evidence：
1. 本周业务概览及与前周的真实变化；
2. 核心业务指标及证据ID，绝不凭空写当前/环比数字；
3. 重要发现、增长阻碍、渠道观察；无法验证的明确标记；
4. 保存的运营决策工作量、执行复盘覆盖；缺失就说明；
5. 下周优先行动、验证指标、具体观察条件，按影响/证据强度排序；
6. 指标口径、数据范围、来源缺失及模型不确定性。
保留已有 summary,keyFindings,suggestions,claims 的完整输出和证据校验要求，并且额外输出：
"weeklyReport":{
 "executiveSummary":"本周执行摘要",
 "metrics":[{"label":"指标名","current":null,"previous":null,"changePct":null,"evidenceIds":["证据ID"]}],
 "highlights":[{"text":"有证据支持的亮点","evidenceIds":["证据ID"]}],
 "issues":[{"text":"待处理问题及影响","evidenceIds":["证据ID"]}],
 "channelFindings":[{"text":"渠道观察或覆盖缺口","evidenceIds":["证据ID"]}],
 "nextWeek":[{"priority":"P0|P1|P2","action":"操作建议","metric":"验证指标","reviewCondition":"观察条件","evidenceIds":["证据ID"]}],
 "dataGaps":["未覆盖或未知项"]
}
每一个真实数值必须有对应可核对证据ID；没有数据则使用 null、空数组及 dataGaps，不得套用虚构数字。上述各项中的 evidenceIds 必须同时出现在经过校验的 claims.evidenceIds 中；如果没有对应证据，应改写为数据缺口，不列为确定性事实。
`;
function validateWeeklyReport(analysis){
 const r=analysis?.weeklyReport;
 const required=['metrics','highlights','issues','channelFindings','nextWeek','dataGaps'];
 if(!r||typeof r.executiveSummary!=='string'||!r.executiveSummary.trim()||
  required.some(k=>!Array.isArray(r[k])||r[k].length>25))
  throw Error('周报缺少必要的业务结论、指标或限制说明');
 const cited=new Set((analysis.claims||[]).flatMap(c=>c.evidenceIds||[]));
 const verify=(row,{numeric=false}={})=>{
  if(!row||!Array.isArray(row.evidenceIds)||row.evidenceIds.length>12||
   row.evidenceIds.some(id=>typeof id!=='string'||!cited.has(id)))
   throw Error('周报引用了未核实的证据编号');
  if(numeric){
   if(typeof row.label!=='string'||!row.label.trim())throw Error('周报指标名缺失');
   for(const key of ['current','previous','changePct'])
    if(row[key]!=null&&(typeof row[key]!=='number'||!Number.isFinite(row[key])))
     throw Error('周报指标必须是有限数字或未知');
   if([row.current,row.previous,row.changePct].some(v=>v!=null)&&!row.evidenceIds.length)
    throw Error('周报数值不能没有证据');
  }else if(typeof row.text!=='string'||!row.text.trim())throw Error('周报发现内容缺失');
 };
 r.metrics.forEach(row=>verify(row,{numeric:true}));
 for(const kind of ['highlights','issues','channelFindings'])r[kind].forEach(row=>verify(row));
 r.nextWeek.forEach(row=>{
  if(!['P0','P1','P2'].includes(row?.priority)||typeof row.action!=='string'||!row.action.trim()||
   typeof row.metric!=='string'||typeof row.reviewCondition!=='string')throw Error('周报行动项无效');
  if(!Array.isArray(row.evidenceIds)||row.evidenceIds.length>12||row.evidenceIds.some(id=>!cited.has(id)))
   throw Error('周报行动引用了无效证据');
 });
 if(r.dataGaps.some(x=>typeof x!=='string'))throw Error('周报数据限制格式无效');
 return r;
}
// If a provider returns a valid base analysis but omits the additional report
// schema, preserve the paid, evidence-validated result as a clearly partial report.
// Never retry automatically or reuse unverifiable numbers and citations.
function ensureWeeklyReport(analysis){
 try{validateWeeklyReport(analysis);return analysis.weeklyReport}
 catch(error){
  const cited=new Set((analysis.claims||[]).flatMap(c=>c.evidenceIds||[]));
  const references=row=>(Array.isArray(row.evidenceIds)?row.evidenceIds:[]).filter(id=>cited.has(id));
  analysis.weeklyReport={
   executiveSummary:analysis.summary||'AI 调查完成，但摘要缺失。',
   metrics:[],
   highlights:(analysis.claims||[]).filter(c=>c.kind==='fact'&&typeof c.text==='string')
    .slice(0,8).map(c=>({text:c.text,evidenceIds:references(c)})),
   issues:(analysis.claims||[]).filter(c=>c.kind==='hypothesis'&&typeof c.text==='string')
    .slice(0,8).map(c=>({text:'待验证：'+c.text,evidenceIds:references(c)})),
   channelFindings:[],
   nextWeek:(analysis.suggestions||[]).slice(0,8).map(s=>({
    priority:s.priority,action:s.action,metric:s.validationMetrics?.primary||'待定义',
    reviewCondition:(s.reviewConditions||[]).join('；')||'需人工确定观察条件',
    evidenceIds:references(s.evidence||{})})),
   dataGaps:['本次 AI 返回的结构化周报不完整，已按通过验证的 AI 结论生成部分版；未重新调用模型。',
    '周度 KPI 对照和渠道分项未能形成完整证据表，不能视为零增长。'],
   partial:true
  };
  validateWeeklyReport(analysis);
  return analysis.weeklyReport;
 }
}
module.exports={weeklyPeriod,weeklyKey,weeklyOperations,weeklyPrompt,validateWeeklyReport,ensureWeeklyReport};
