'use strict';
// Versioned model-facing analysis contract and its structural validation.
const {assertReviewMetrics,REVIEWABLE_METRIC_IDS}=require('../growth/reviewMetrics');
const ANALYSIS_CONTRACT_VERSION='analysis-contract-v2';
const analysisPrompt=`analysis-contract-v2。你是LogEarn业务增长分析师。依据业务目标和真实观测证据排序任务，先比较目标相关性，再比较可验证的影响人数、同单位变化幅度、证据完整度和调查成本；不同单位的绝对值不能直接比较。
筹码查看/下钻是行为代理，不代表成功、理解或付费；未观测不等于流失。历史及采集覆盖未知时降低结论强度。
先核对指标口径、期间和覆盖，区分已证实事实、待验证假设和未知。补查应能够区分关键假设或改变决策；证据足够或无法取得关键证据时停止。不得以相关性证明因果。证据不足时优先提出验证行动，不把假设写成确定结论。根因未确定时，每条重要建议应给出2至3个竞争性假设，分别列出支持证据、反证/缺失证据，以及能区分假设的最小调查。调查工具必须来自当前 context.capabilities；优先复用已有证据，选择最少且预期信息增益最高的已授权查询。没有成本元数据时将调查成本标为未知，不得臆造费用或自动选择外部付费采集。
上下文提供历史行动或复盘时可参考；未提供时不得假设历史记录不存在。不得原样重复历史行动；完全重复的行动文本不得再次生成；对已执行但未观察到改善、被拒绝或已失效的行动，即使出现新证据，也必须形成不同的验证步骤或行动方案。业务范围以请求为准。
最终输出必须包含claims数组，每项为{id,kind:"fact|hypothesis|recommendation",text,evidenceIds,values:[{evidenceId,path:"stats.<白名单聚合字段路径>或value.<字段路径>",value}],uncertainties}。事实和建议必须引用提供的证据ID；引用数值必须在values中写明精确的evidenceId、path和value；path必须是模型可见的stats.指标路径或value.字段路径，单个数值使用value。建议evidence对象必须包含evidenceIds数组。补查可返回investigations:[{tool:"能力目录中的ID",input:{}}]。
输出JSON：{"summary":"摘要","keyFindings":["发现"],"suggestions":[{"problem":"问题","evidence":{"evidenceIds":["证据ID"],"metrics":["可核对数值"],"dataPoints":["证据"]},"hypothesis":"假设","uncertainties":["未知"],"action":"具体行动","priority":"P0或P1或P2","priorityReason":"数据影响、实施成本及排序依据","scope":{"source":"请求来源"},"expectedImpact":"有依据的预期或未知","impactBasis":"依据","validationMetrics":{"primary":"active_users/new_users/returning_users/activation_rate/d7","secondary":[]},"reviewConditions":["验证条件与观察期"],"executionPlan":{"ownerRole":"负责人角色而非虚构姓名","effort":"有依据的工作量估计或待评估","resourceNeeds":["必要资源；没有则空数组"],"dependencies":["前置依赖；没有则空数组"],"steps":["具体可执行步骤"],"target":"明确目标或先验证方向","successCriteria":"可观测成功判据","suggestedObservationDays":7,"stopConditions":["停止或回滚条件"]},"competingHypotheses":[{"cause":"可能原因","supportingEvidenceIds":["证据ID"],"contradictingEvidenceIds":[],"missingEvidence":["缺失数据"],"discriminatingQuery":{"tool":"已授权能力ID","input":{},"why":"该查询如何区分假设"}}]}]}。
validationMetrics.primary 与 secondary 必须全部使用当前复盘服务真正支持的指标：${REVIEWABLE_METRIC_IDS.join(', ')}。指标必须与问题和行动语义直接匹配，不得为了通过校验选择不相关指标；若不存在直接匹配的可复盘指标，不生成无法验证的行动建议，应说明需要先扩展指标读取/复盘能力。每条建议必须提供完整 executionPlan，包含负责人角色、工作量、资源、依赖、步骤、目标、成功判据、3–30天观察窗口和停止条件；expectedImpact、impactBasis、scope.source 与 reviewConditions 也必须完整。\n每条建议可以增加可选 forecast 字段，包含 metric（必须等于 validationMetrics.primary）、direction（increase/decrease）、horizonDays（3–14整数）、minRelativeChangePct（0–100）、confidence（low/medium/high）以及 evidenceIds（已引用的证据ID）。预测不是必要字段；没有足够证据就不要提供数字预测，绝不宣称行动的因果收益。可不提出建议，但必须解释原因；指标不存在时不能自行造数。不得自行承诺收益。`;

function normalizedAction(value){
 return String(value||'').split(/\n执行计划\n/)[0]
  .normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
}
function assertActionNovelty(suggestion,history){
 if(!Array.isArray(history))return;
 const action=normalizedAction(suggestion.action);
 if(!action)return;
 const metric=suggestion.validationMetrics?.primary;
 const scope=suggestion.scope?.source||'all';
 const duplicate=history.find(row=>
  row&&row.validation_metrics?.primary===metric&&
  (row.applicable_scope?.source||row.action_scope?.source||'all')===scope&&
  [row.action,row.actual_action].some(value=>normalizedAction(value)===action)&&
  ['pending','adopted','executing','executed','rejected','invalid'].includes(row.user_status));
 if(duplicate)throw Error('建议与历史行动完全重复；必须提出不同的验证步骤或行动方案');
}
function plainObject(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
}
function matchesInputSchema(schema,value,depth=0){
 if(!schema||typeof schema!=='object'||depth>6)return false;
 if(Array.isArray(schema.enum)&&!schema.enum.includes(value))return false;
 switch(schema.type){
  case 'object':{
   if(!plainObject(value))return false;
   const properties=schema.properties||{};
   if(schema.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(properties,k)))return false;
   if(Array.isArray(schema.required)&&schema.required.some(k=>!Object.hasOwn(value,k)))return false;
   return Object.entries(value).every(([key,item])=>
    !Object.hasOwn(properties,key)||matchesInputSchema(properties[key],item,depth+1));
  }
  case 'array':
   return Array.isArray(value)&&
    (schema.maxItems===undefined||value.length<=schema.maxItems)&&
    (schema.minItems===undefined||value.length>=schema.minItems)&&
    (!schema.items||value.every(item=>matchesInputSchema(schema.items,item,depth+1)));
  case 'string':
   return typeof value==='string'&&
    (schema.maxLength===undefined||value.length<=schema.maxLength)&&
    (schema.minLength===undefined||value.length>=schema.minLength);
  case 'integer':
   return Number.isSafeInteger(value)&&
    (schema.minimum===undefined||value>=schema.minimum)&&
    (schema.maximum===undefined||value<=schema.maximum);
  case 'number':
   return typeof value==='number'&&Number.isFinite(value)&&
    (schema.minimum===undefined||value>=schema.minimum)&&
    (schema.maximum===undefined||value<=schema.maximum);
  case 'boolean':return typeof value==='boolean';
  case 'null':return value===null;
  default:return false;
 }
}
function assertDiscriminatingQuery(query,context){
 const capabilities=Array.isArray(context?.capabilities)?context.capabilities:[];
 const capability=capabilities.find(item=>item?.id===query?.tool);
 if(!capability)throw Error('竞争性假设的调查工具不属于当前任务授权集合');
 if(!plainObject(query.input)||!matchesInputSchema(capability.inputSchema,query.input))
  throw Error('竞争性假设的调查输入不符合当前工具schema');
 const expectedSource=context.business?.scope?.source||'all';
 const scope=query.input.scope;
 if(scope!==undefined&&(!plainObject(scope)||Object.keys(scope).some(k=>k!=='source')||
  (scope.source!==undefined&&scope.source!==expectedSource)))
  throw Error('竞争性假设的调查范围超出当前任务来源');
 const period=context.period;
 if(period&&Number.isSafeInteger(period.start)&&Number.isSafeInteger(period.end)){
  const start=query.input.start??period.start,end=query.input.end??period.end;
  const duration=period.end-period.start;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||
   start<period.start-duration||end>period.end)
   throw Error('竞争性假设的调查期间超出当前任务授权范围');
 }
 if(query.tool==='query_metrics'&&Array.isArray(query.input.metrics)){
  for(const id of query.input.metrics)require('./metricRegistry').describeMetric(id);
 }
}
function validateAnalysis(a,context={}) {
  const strictContract=context?.analysisContractVersion===ANALYSIS_CONTRACT_VERSION;
  if (typeof a.summary !== 'string' || !Array.isArray(a.keyFindings) || !Array.isArray(a.suggestions)) throw Error('分析结果缺少摘要、发现或建议');
  const allowedTools=new Set((Array.isArray(context?.capabilities)?context.capabilities:[])
    .map(item=>item?.id).filter(id=>typeof id==='string'));
  for (const s of a.suggestions) {
    assertActionNovelty(s,context?.memory);
    if(s.competingHypotheses!==undefined){
      if(!Array.isArray(s.competingHypotheses)||s.competingHypotheses.length<2||
         s.competingHypotheses.length>3)throw Error('竞争性根因假设必须为2至3项');
      const causes=s.competingHypotheses.map(item=>String(item?.cause||'').normalize('NFKC').trim().toLowerCase());
      if(causes.some(x=>!x)||new Set(causes).size!==causes.length)
       throw Error('竞争性根因假设必须是不同的解释');
      for(const hypothesis of s.competingHypotheses){
        if(!hypothesis||typeof hypothesis.cause!=='string'||!hypothesis.cause.trim()||
           !Array.isArray(hypothesis.supportingEvidenceIds)||
           !Array.isArray(hypothesis.contradictingEvidenceIds)||
           !Array.isArray(hypothesis.missingEvidence)||
           !hypothesis.discriminatingQuery||
           typeof hypothesis.discriminatingQuery.tool!=='string'||
           !allowedTools.has(hypothesis.discriminatingQuery.tool)||
           !hypothesis.discriminatingQuery.input||
           typeof hypothesis.discriminatingQuery.input!=='object'||
           Array.isArray(hypothesis.discriminatingQuery.input)||
           typeof hypothesis.discriminatingQuery.why!=='string'||
           !hypothesis.discriminatingQuery.why.trim()||
           hypothesis.discriminatingQuery.why.length>240)
          throw Error('竞争性根因假设缺少证据或使用了未授权调查工具');
        if(strictContract)assertDiscriminatingQuery(hypothesis.discriminatingQuery,context);
      }
      if(strictContract){
       // Candidate tool IDs and inputs passed the current task authorization
       // gate above. Only owner's trusted observed execution times may compare
       // them; do not claim known USD query cost or automatic query permission.
       const queries=s.competingHypotheses.map(h=>h.discriminatingQuery);
       const locked=queries.some(q=>{
        const capability=context.capabilities.find(x=>x.id===q.tool);
        return capability?.cost==='paid'||capability?.cost==='unknown';
       });
       const compared=require('../growth/queryEconomics').compareQueries(queries,
        locked?{}:context.trustedToolTimings||{});
       s.discriminatingQueryEfficiency=locked?
        {...compared,status:'paid-or-unknown-capability-cost',
         bestObservedLatencyTool:null,measuredMedianMs:null}:compared;
      }
    }
    if(strictContract){
      assertReviewMetrics(s.validationMetrics);
      const expectedSource=context.business?.scope?.source||'all';
      if(!s.executionPlan||typeof s.expectedImpact!=='string'||!s.expectedImpact.trim()||
       typeof s.impactBasis!=='string'||!s.impactBasis.trim()||
       !s.scope||typeof s.scope!=='object'||Array.isArray(s.scope)||Object.keys(s.scope).some(k=>k!=='source')||s.scope.source!==expectedSource||
       !Array.isArray(s.reviewConditions)||s.reviewConditions.length<1||
       s.reviewConditions.length>5||
       s.reviewConditions.some(x=>typeof x!=='string'||!x.trim()||x.length>240))
       throw Error('新分析建议必须提供可复盘指标、完整执行计划、预期影响依据、正确范围和复查条件');
    }
    if(s.executionPlan!=null)require('../growth/actionWorkflow').validateExecutionPlan(s.executionPlan);
    if(s.forecast!=null){
      s.forecast=require('../growth/agentForecast').validateForecast(
        s.forecast,s.validationMetrics,s.evidence);
    }
    if (['problem','hypothesis','action','priorityReason'].some(k=>typeof s[k]!=='string'||!s[k].trim()) || !['P0','P1','P2'].includes(s.priority)
      || !s.evidence || typeof s.evidence!=='object' || !Array.isArray(s.uncertainties)
      || !s.validationMetrics || typeof s.validationMetrics.primary!=='string' || !Array.isArray(s.reviewConditions)) throw Error('建议缺少必要的证据、优先级、验证指标或行动');
  }
  return a;
}
function validateEvidenceReferences(analysis,context,store,validateClaims){
 analysis.claims=validateClaims(analysis.claims,context,store);
 for(const suggestion of analysis.suggestions){
  if(!Array.isArray(suggestion.evidence?.evidenceIds)||!suggestion.evidence.evidenceIds.length)
   throw Error('建议必须引用证据ID');
  for(const id of suggestion.evidence.evidenceIds)store.get(id,context);
  for(const hypothesis of suggestion.competingHypotheses||[]){
   for(const id of [...hypothesis.supportingEvidenceIds,...hypothesis.contradictingEvidenceIds]){
    if(typeof id!=='string'||!id)throw Error('竞争性根因假设引用的证据ID无效');
    store.get(id,context);
   }
  }
 }
}
module.exports={ANALYSIS_CONTRACT_VERSION,analysisPrompt,validateAnalysis,validateEvidenceReferences,assertActionNovelty};
