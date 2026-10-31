'use strict';
// Weekly AI report is an explicit user-initiated analysis, never a scheduled or free report.
// Its context contains only owner-scoped aggregate counts; no user/event rows or action text.
const {lastCompleted}=require('./workspace/period');
const {validateRange}=require('../../analytics/businessPriorities');

function weeklyModelTimeoutMs(){
 const value=Number(process.env.AI_WEEKLY_MODEL_TIMEOUT_MS||300000);
 if(!Number.isSafeInteger(value)||value<30000||value>540000)
  throw Error('AI_WEEKLY_MODEL_TIMEOUT_MS 必须为 30000 至 540000 毫秒');
 return value;
}
function weeklyPeriod(now=Date.now()){return lastCompleted('weekly',now);}
function reportPeriod(input={},now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('报告时间范围无效');
 const hasStart=input.start!==undefined&&input.start!==null&&input.start!=='';
 const hasEnd=input.end!==undefined&&input.end!==null&&input.end!=='';
 if(!hasStart&&!hasEnd){
  const base=weeklyPeriod(now),duration=base.end-base.start;
  return {...base,previousStart:base.start-duration,previousEnd:base.start};
 }
 if(hasStart!==hasEnd)throw Error('自定义报告必须同时填写开始和结束时间');
 const parse=value=>{
  if(typeof value==='number')return value;
  if(typeof value==='string'&&/^\d+$/.test(value))return Number(value);
  return NaN;
 };
 const start=parse(input.start),end=parse(input.end);
 try{validateRange(start,end,now)}catch(error){
  throw Object.assign(Error('请选择有效的1–31天历史时间范围，且结束时间不能晚于当前时间'),{status:400});
 }
 const duration=end-start;
 return {kind:'custom',start,end,previousStart:start-duration,
  previousEnd:start,timezone:'Asia/Bangkok'};
}
function weeklyKey(period){
 const prefix=period.kind==='custom'?'ai-report-custom-v1:':'weekly-ai-v1:';
 return prefix+period.start+':'+period.end;
}
function reportKey(period){return weeklyKey(period);}
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
const businessBrainPromptV1="经营分析必须以 context.businessBrain 为业务语义基线：\n- 先读取 businessBrain.focus、lifecycle、productMap、operatingModel 和 metricDictionary，明确本期经营目标、相关阶段、运营数据层次和指标的正式含义；northStarIntent 是经营方向，不是已验证的单一KPI。\n- 按获客→注册→首次价值/激活→产品参与→留存→真实交易→商业经济检查业务链路，但产品功能是多个价值入口，不得假设所有用户必须按同一顺序使用。\n- 重点回答“经营结果发生了什么、影响最大的环节在哪里、哪些原因已被证实、哪些仍是假设、下一步做什么”，不要把13个模块平均分配篇幅。\n- 获客渠道只有在身份和时间窗口能可靠连接时，才能继续解释注册、激活和交易；GSC、X、KOL数据默认是渠道观察，不是站内转化或增量归因。\n- 对AI策略、筹码峰、Holder和钱包交易分别解释其产品角色；没有可核对的事件和交易事实时，不得宣称某功能带来交易。\n- 优先读取 weeklyCoverage 中的 operations-timeline 模块复盘实际运营；人工活动、渠道观察、AI建议/执行/复盘必须分层。未收集、未连接或读取失败不等于没有运营。\n- 活动效果只采用已结算冻结汇总；未结算或分析/交易来源覆盖缺失时保持未知。treatment/control 是人工固定分组，不是随机实验；送达状态、跨组曝光与分组结果不证明增量因果。\n- 读取 context.operatingMemory 时，区分提议、采纳、执行、拒绝和已复盘；它只覆盖已有AI建议/复盘记录，不代表完整运营活动。不得将人工采纳视为有效，不得重复推荐已有反证的行动。\n- 每个优先问题必须给出影响范围、事实证据、可能根因、反证/未知、置信程度和下一步验证。每个行动必须对应可测量的主指标、目标或观察条件、负责人/资源未知时明确标注未知。\n- 优先选择能解决经营关键歧义的少量调查，不为追求模块覆盖而重复调用工具；数据不足时形成条件化建议，而不是虚构经营判断。";
const weeklyDecisionPromptV2=`
周报还必须提供经营生命周期、正向机会和历史行动复盘三个区块：
- lifecycle 必须覆盖 acquisition、registration、activation、engagement、retention、trading、economics 七个阶段，每阶段一项。status 只能为 observed、partial、unknown、not-investigated；只有有直接证据时才写 observed/partial 并引用证据。它是多入口经营地图，不是强制线性漏斗。
- opportunities 只列出有真实正向观测证据、样本成熟且范围/持续性值得进一步验证的机会；正向变化不等于可复制增长或因果贡献。没有证据时返回空数组，不要凑数。
- previousActions 只读取 context.operatingMemory 和 operations-timeline 已记录的行动；区分 executed、executing、accepted、rejected。采纳不等于执行，建议不等于行动。review 只能为 observed-supported、observed-contradicted、insufficient、not-reviewed、not-applicable；未复盘或证据不足不得标为有效/无效。没有可核对记录时返回空数组，并在 dataGaps 说明“现有记录不足，不代表没有运营”。
每项 opportunities 和 previousActions 必须引用已经出现在 claims 中的证据ID；lifecycle 中 observed/partial 阶段也必须引用 claims 证据。unknown/not-investigated 阶段可以 evidenceIds 为空。
weeklyReport 额外字段：
"lifecycle":[{"stage":"acquisition|registration|activation|engagement|retention|trading|economics","status":"observed|partial|unknown|not-investigated","finding":"事实或缺口说明","evidenceIds":[]}],
"opportunities":[{"text":"有证据支持的正向机会或待验证方向","evidenceIds":["证据ID"]}],
"previousActions":[{"action":"已记录的实际行动或决策","status":"executed|executing|accepted|rejected","review":"observed-supported|observed-contradicted|insufficient|not-reviewed|not-applicable","outcome":"复盘结论或尚未复盘","metric":"相关指标或未知","evidenceIds":["证据ID"]}]。
`;
const weeklyPromptV3=weeklyPromptV2+'\n'+businessBrainPromptV1+'\n'+weeklyDecisionPromptV2;
const customPeriodInstruction='本报告使用自定义统计时间范围，而非自然周。context.period.start 为开始时间（包含），context.period.end 为结束时间（不包含），时区以 context.period.timezone 为准。所有对比必须使用 context.period.previousStart 至 previousEnd 的紧邻前一段等长周期；如数据源只支持日期级聚合，必须说明时间粒度差异，不能伪装成分钟级精确。不得使用“上周/本周”替代实际日期范围。';
const customPeriodBaseV2=weeklyPromptV2
 .replace('完整自然周（Asia/Bangkok 周一至周日）','自定义时间范围（Asia/Bangkok）')
 .replace('比较当前周与同口径上一周','比较指定报告期与紧邻前一段等长周期')
 .replaceAll('本周','报告期')
 .replaceAll('当前周','报告期')
 .replaceAll('上一周','前一周期')
 .replaceAll('上周','前一周期')
 .replaceAll('下周','下一步')
 .replaceAll('周度','报告期')
 .replaceAll('周报','报告');
const customPeriodPromptV0=customPeriodBaseV2+'\n'+customPeriodInstruction;
const customPeriodPromptV1=customPeriodBaseV2+'\n'+businessBrainPromptV1+'\n'+weeklyDecisionPromptV2+'\n'+customPeriodInstruction;
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
const LIFECYCLE_STAGES=Object.freeze(['acquisition','registration','activation','engagement','retention','trading','economics']);
function hydrateWeeklyReport(analysis,{strict=false}={}){
 const w=analysis?.weeklyReport;
 if(!w||typeof w!=='object'||Array.isArray(w))return;
 const known=new Set((analysis.claims||[]).flatMap(claim=>claim.evidenceIds||[]));
 const refs=list=>Array.isArray(list)?list.filter(id=>typeof id==='string'&&known.has(id)).slice(0,12):[];
 if(!strict){
  if(!Array.isArray(w.lifecycle))w.lifecycle=LIFECYCLE_STAGES.map(stage=>({stage,status:'not-investigated',finding:'历史报告未保存该阶段的结构化判断',evidenceIds:[]}));
  if(!Array.isArray(w.opportunities))w.opportunities=[];
  if(!Array.isArray(w.previousActions))w.previousActions=[];
 }
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
function validateWeeklyReport(analysis,{strict=false}={}){
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
 if(strict){
  if(!Array.isArray(r.lifecycle)||r.lifecycle.length!==LIFECYCLE_STAGES.length||
   !Array.isArray(r.opportunities)||r.opportunities.length>10||
   !Array.isArray(r.previousActions)||r.previousActions.length>10)
   throw Error('新周报必须包含完整生命周期、机会和历史行动区块');
  const stages=new Set();
  for(const row of r.lifecycle){
   if(!row||!LIFECYCLE_STAGES.includes(row.stage)||stages.has(row.stage)||
    !['observed','partial','unknown','not-investigated'].includes(row.status)||
    typeof row.finding!=='string'||!row.finding.trim()||
    !Array.isArray(row.evidenceIds)||row.evidenceIds.length>12||
    row.evidenceIds.some(id=>typeof id!=='string'||!cited.has(id))||
    ['observed','partial'].includes(row.status)&&!row.evidenceIds.length)
    throw Error('生命周期阶段缺少有效状态或证据');
   stages.add(row.stage);
  }
  if(stages.size!==LIFECYCLE_STAGES.length)throw Error('生命周期阶段不完整');
  for(const row of r.opportunities){
   if(!row||typeof row.text!=='string'||!row.text.trim()||
    !Array.isArray(row.evidenceIds)||!row.evidenceIds.length||row.evidenceIds.length>12||
    row.evidenceIds.some(id=>typeof id!=='string'||!cited.has(id)))
    throw Error('增长机会必须引用已验证证据');
  }
  for(const row of r.previousActions){
   if(!row||typeof row.action!=='string'||!row.action.trim()||
    !['executed','executing','accepted','rejected'].includes(row.status)||
    !['observed-supported','observed-contradicted','insufficient','not-reviewed','not-applicable'].includes(row.review)||
    typeof row.outcome!=='string'||!row.outcome.trim()||
    typeof row.metric!=='string'||!Array.isArray(row.evidenceIds)||
    !row.evidenceIds.length||row.evidenceIds.length>12||
    row.evidenceIds.some(id=>typeof id!=='string'||!cited.has(id)))
    throw Error('历史行动复盘必须区分执行状态、观察结论并引用证据');
  }
 }
 if(r.dataGaps.some(x=>typeof x!=='string'))throw Error('周报数据限制格式无效');
 return r;
}
// If a provider returns a valid base analysis but omits the additional report
// schema, preserve the paid, evidence-validated result as a clearly partial report.
// Never retry automatically or reuse unverifiable numbers and citations.
function ensureWeeklyReport(analysis,{context=null}={}){
 const strict=context?.weeklyReportContractVersion==='weekly-report-v2';
 hydrateWeeklyReport(analysis,{strict});
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
module.exports={weeklyPeriod,reportPeriod,weeklyKey,reportKey,weeklyOperations,weeklyPrompt,weeklyPromptV2,weeklyPromptV3,customPeriodPromptV0,customPeriodPromptV1,validateWeeklyReport,ensureWeeklyReport,trustedWeeklyMetrics,weeklyModelTimeoutMs,LIFECYCLE_STAGES};
