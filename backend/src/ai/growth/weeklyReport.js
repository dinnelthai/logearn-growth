'use strict';
// Weekly AI report is an explicit user-initiated analysis, never a scheduled or free report.
// Its context contains only owner-scoped aggregate counts; no user/event rows or action text.
const {lastCompleted}=require('./workspace/period');

function weeklyModelTimeoutMs(){
 const value=Number(process.env.AI_WEEKLY_MODEL_TIMEOUT_MS||300000);
 if(!Number.isSafeInteger(value)||value<30000||value>540000)
  throw Error('AI_WEEKLY_MODEL_TIMEOUT_MS 必须为 30000 至 540000 毫秒');
 return value;
}
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
每一个真实数值必须有对应可核对证据ID；没有数据则使用 null、空数组及 dataGaps，不得套用虚构数字。 changePct 表示相对变化百分数（如10变12写20），分母为0或上周未知时使用 null。上述各项中的 evidenceIds 必须同时出现在经过校验的 claims.evidenceIds 中；如果没有对应证据，应改写为数据缺口，不列为确定性事实。
`;
// v2 asks for only the weekly-specific parts. Highlights, issues and action
// items are derived from the already-validated canonical claims/suggestions.
// This avoids paying the model to write the same ideas twice.
const weeklyPromptV2=`
本任务是 LogEarn 完整自然周（Asia/Bangkok 周一至周日）的 AI 运营周报。比较当前周与同口径上一周，优先依据证据判断趋势、数据质量和下周动作。未观测不是0；SEO曝光/点击不是注册或交易；不得把相关性当因果。
输出必须保留基础契约的 summary、keyFindings、suggestions、claims；其中 claims 的 evidenceIds 与 values 引用必须准确，suggestions 只写可验证的高优先级行动，不得重复堆叠。不要把同一段发现再写成另一套长篇周报正文。
额外只输出周报特有的 weeklyReport 字段：
{"executiveSummary":"不超过180字的关键判断",
"metrics":[{"label":"业务指标","current":null,"previous":null,"changePct":null,"evidenceIds":["证据ID"]}],
"channelFindings":[{"text":"来自已观测渠道证据的差异，未覆盖的明确说明","evidenceIds":["证据ID"]}],
"dataGaps":["数据覆盖、归因、口径与有效期的明确限制"]}
首先阅读 context.weeklyCoverage：它包含12个模块的调查状态与证据ID。已取数的模块优先直接核对现有证据；不要无必要地重复调用相同工具。未调查或未连接不能冒充已分析；只对影响最大且缺少关键证据的问题发起有限补查。周报结构化输出不必重复12组指标明细，模块状态由服务端按真实查询日志和证据引用生成。
结合业务目标、影响范围和证据强度识别重要增长异常与用户流失信号，不直接比较不同单位指标的绝对变化。为每个核心问题交代影响规模、已知证据、未证实假设和下周核查动作。增长周报需要覆盖 SEO（GSC）、渠道获客、激活、留存、产品到交易；对不可用来源明确列出缺口，不能因为主要目标是 activation 就忽略 SEO。GSC 可能使用 PT 日期，不得对不匹配的快照计算本业务周环比，更不能把搜索点击当作注册或交易。
本周亮点将从事实型 claims 自动生成；风险从假设型 claims 自动生成；下周行动从 suggestions 自动生成，不要重复输出 highlights、issues、nextWeek。必须保留每项真实数值对应证据 ID；无验证数据用 null，不编造周环比；changePct 为相对百分数（10→12 为20，前周0或未知时为null）。运营执行统计只表示已保存记录，不等于全部工作量。
`;
// v3 changes the decision frame, not the validated output contract. It is used only by new v5 reports.
const weeklyPromptV3=weeklyPromptV2+'\n'+"经营分析必须以 context.businessBrain 为业务语义基线：\n- 先读取 businessBrain.focus、lifecycle、productMap 和 metricDictionary，明确本期经营目标、相关阶段和指标的正式含义；northStarIntent 是经营方向，不是已验证的单一KPI。\n- 按获客→注册→首次价值/激活→产品参与→留存→真实交易→商业经济检查业务链路，但产品功能是多个价值入口，不得假设所有用户必须按同一顺序使用。\n- 重点回答“经营结果发生了什么、影响最大的环节在哪里、哪些原因已被证实、哪些仍是假设、下一步做什么”，不要把12个模块平均分配篇幅。\n- 获客渠道只有在身份和时间窗口能可靠连接时，才能继续解释注册、激活和交易；GSC、X、KOL数据默认是渠道观察，不是站内转化或增量归因。\n- 对AI策略、筹码峰、Holder和钱包交易分别解释其产品角色；没有可核对的事件和交易事实时，不得宣称某功能带来交易。\n- 读取 context.operatingMemory 时，区分提议、采纳、执行、拒绝和已复盘；它只覆盖已有AI建议/复盘记录，不代表完整运营活动。不得将人工采纳视为有效，不得重复推荐已有反证的行动。\n- 每个优先问题必须给出影响范围、事实证据、可能根因、反证/未知、置信程度和下一步验证。每个行动必须对应可测量的主指标、目标或观察条件、负责人/资源未知时明确标注未知。\n- 优先选择能解决经营关键歧义的少量调查，不为追求模块覆盖而重复调用工具；数据不足时形成条件化建议，而不是虚构经营判断。";
// Server-derived KPIs come from the exact owner-scoped immutable evidence
// already saved for this run. They never depend on the model inventing JSON.
function trustedWeeklyMetrics(context){
 const period=context?.period,items=Array.isArray(context?.evidence)?context.evidence:[];
 if(!period)return [];
 const definitions=[
  ['new_users','首次分析用户'],
  ['active_users','分析活跃用户'],
  ['returning_users','回访分析用户']
 ];
 return definitions.map(([metricId,label])=>{
  const find=(start,end)=>items.find(e=>e.metricId===metricId&&
   e.period?.start===start&&e.period?.end===end&&
   typeof e.value==='number'&&Number.isFinite(e.value));
  const now=find(period.start,period.end);
  const before=find(period.previousStart,period.previousEnd);
  if(!now&&!before)return null;
  const current=now?.value??null,previous=before?.value??null;
  return {metricId,label,current,previous,
   changePct:current!=null&&previous!=null&&previous!==0?
    Math.round((current-previous)/previous*10000)/100:null,
   evidenceIds:[now?.id,before?.id].filter(Boolean)};
 }).filter(Boolean);
}
function hydrateWeeklyReport(analysis){
 const w=analysis?.weeklyReport;
 if(!w||typeof w!=='object'||Array.isArray(w))return;
 const known=new Set((analysis.claims||[]).flatMap(claim=>claim.evidenceIds||[]));
 const refs=list=>Array.isArray(list)?list.filter(id=>typeof id==='string'&&known.has(id)).slice(0,12):[];
 if(!Array.isArray(w.highlights))
  w.highlights=(analysis.claims||[]).filter(x=>x.kind==='fact'&&typeof x.text==='string')
   .filter(x=>refs(x.evidenceIds).length).slice(0,8)
   .map(x=>({text:x.text,evidenceIds:refs(x.evidenceIds)}));
 if(!Array.isArray(w.issues))
  w.issues=(analysis.claims||[]).filter(x=>x.kind==='hypothesis'&&typeof x.text==='string')
   .slice(0,8).map(x=>({text:'待验证：'+x.text,evidenceIds:refs(x.evidenceIds)}));
 if(!Array.isArray(w.nextWeek))
  w.nextWeek=(analysis.suggestions||[]).slice(0,8).map(s=>({
   priority:s.priority,action:s.action,metric:s.validationMetrics?.primary||'待定义',
   reviewCondition:(s.reviewConditions||[]).join('；')||'需人工确认观察期',
   evidenceIds:refs(s.evidence?.evidenceIds)
  }));
}
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
   if(row.changePct!=null&&
     (row.current==null||row.previous==null||row.previous===0||
      Math.abs((row.current-row.previous)/row.previous*100-row.changePct)>0.55))
    throw Error('周报环比数据与本周、上周数值不一致');
  }else if(typeof row.text!=='string'||!row.text.trim())throw Error('周报发现内容缺失');
 };
 r.metrics.forEach(row=>verify(row,{numeric:true}));
 for(const kind of ['highlights','issues','channelFindings'])r[kind].forEach(row=>verify(row));
 if(r.highlights.some(row=>row.evidenceIds.length===0))throw Error('周报亮点必须有原始证据');
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
function ensureWeeklyReport(analysis,{context=null}={}){
 hydrateWeeklyReport(analysis);
 const derived=trustedWeeklyMetrics(context);
 const complete=()=>{
  // The report contract was separately validated against model-cited claims.
  // Replace only server-owned KPI labels with independently derived values.
  const w=analysis.weeklyReport;
  w.metrics=[...derived,...w.metrics.filter(x=>
   !derived.some(d=>d.label===x.label||d.metricId===x.metricId))].slice(0,25);
  if(derived.length)w.dataGaps=w.dataGaps.map(gap=>
   gap.startsWith('周度 KPI 对照和渠道分项未能形成完整证据表')?
    '模型未提供完整的渠道分项；核心业务指标由已保存的周度证据补齐，仍需核验覆盖与归因。':gap);
  const seo=context?.weeklySources?.seo;
  if(seo&&seo.status!=='period-matched'){
   const reason=seo.status==='reference-only'?
    'SEO：仅有日期不完全匹配的 GSC 参考快照，不能形成业务周环比或注册归因。':
    'SEO：本业务周没有可验证的 GSC 数据，不能推定搜索流量为零。';
   if(!w.dataGaps.includes(reason))w.dataGaps.push(reason);
  }
  return w;
 };
 try{validateWeeklyReport(analysis);return complete()}
 catch(error){
  const cited=new Set((analysis.claims||[]).flatMap(c=>c.evidenceIds||[]));
  const references=row=>(Array.isArray(row.evidenceIds)?row.evidenceIds:[]).filter(id=>cited.has(id));
  analysis.weeklyReport={
   executiveSummary:analysis.summary||'AI 调查完成，但摘要缺失。',
   metrics:[],
   highlights:(analysis.claims||[]).filter(c=>c.kind==='fact'&&typeof c.text==='string'&&references(c).length)
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
  return complete();
 }
}
module.exports={weeklyPeriod,weeklyKey,weeklyOperations,weeklyPrompt,weeklyPromptV2,weeklyPromptV3,validateWeeklyReport,ensureWeeklyReport,trustedWeeklyMetrics,weeklyModelTimeoutMs};
