const remote=require('../data/hologres');
const evidence=require('../data/businessEvidence');
const {definitions,validateRange,validateScope,rankEvidence,reviewPeriods,metricChanges}=require('../analytics/businessPriorities');
const goalLabels={activation:'提升激活',retention:'提升留存',conversion:'提升转化',revenue:'收入策略'};
const metricLabels={active_users:'分析用户',new_users:'首次分析用户',returning_users:'回访分析用户',activation_rate:'24小时激活比例',d7:'成熟队列D7回访',weekly_core:'周核心用户'};
function warnings(snapshot,growth,weekly){
  const rows=[];
  if(snapshot.history_complete!==true)rows.push('历史覆盖未确认，首次观测不等于首次使用。');
  if(!snapshot.events_complete_through)rows.push('连续采集覆盖未确认，未观测回访不等于真实流失。');
  if(growth.quality?.lag_ms>3600000)rows.push('事件水位落后超过1小时，先核查采集完整性。');
  if(!weekly.available)rows.push('周核心指标不可用：'+(weekly.error||'观察期不足'));
  if(growth.quality?.truncated)rows.push('数据存在截断，不能按完整数据下结论。');
  return rows;
}
function explainCandidate(candidate){
  const metric=candidate.metric;
  const checks=metric==='weekly_core'?['核对业务目标日期与全平台范围','查看进入、退出核心的人数和天数分布','结合渠道和活动记录决定下一步动作']:
    metric==='activation_rate'?['核对成熟样本分母与待成熟人数','检查该来源从首次观测到首次分析的流程','核对近期入口或活动变更，不先认定因果']:
    metric==='d7'?['核对D7成熟队列分母与待成熟人数','对比渠道与入组日期，避免把样本变化当效果','检查回访行为和采集是否连续']:
    ['核对当前期、等长对比期和采集覆盖','查看来源、设备、版本的变化贡献','核对同期活动和产品变更，记录人工判断'];
  return {...candidate,priorityExplanation:metric==='weekly_core'?'目标完成度低于50%列P0，否则列P1':metric==='activation_rate'?'成熟样本至少30且激活低于30%列P1，否则列P2':metric==='d7'?'成熟样本至少30列P1，否则列P2':'规则分至少70列P0、至少30列P1，否则列P2；同等级按分数排序',label:(candidate.source?candidate.source+' · ':'')+(metricLabels[metric]||metric),checks,
    ruleVersion:'business-priority-v1',scoreExplanation:metric==='weekly_core'?'目标缺口比例 × 100':metric==='activation_rate'||metric==='d7'?'未激活或未回访比例 × log₂(1+成熟样本) × 15':'log₂(1+绝对人数变化) × 10 × (1+相对变化幅度，最多2) × 覆盖系数（确认历史=1，否则0.6）',
    interpretation:candidate.change==null?'请结合目标差距与样本判断；对比基数为0时不生成增长率':candidate.change>0?'观测增长，需判断是否值得扩大或优先复查':'观测减少，需核对原因与数据覆盖，不直接解释为流失'};
}
function compact(value){return JSON.parse(JSON.stringify(value,(key,v)=>['list_key','members','lists'].includes(key)?undefined:v));}
function createService(deps={remote,evidence}){
  async function snapshotFor(end){
    const s=await deps.remote.status();
    if(!Number.isFinite(Date.parse(s.as_of))||end>Date.parse(s.as_of)+1)throw Object.assign(Error('所选截止时间超出数据水位，请选择更早的日期'),{status:400});
    return s;
  }
  async function build({start,end,businessScope={},focusGoal='activation',question=''}){
    validateRange(start,end);const scope=validateScope(businessScope);
    if(!Object.hasOwn(goalLabels,focusGoal))throw Object.assign(Error('业务目标无效'),{status:400});
    const snapshot=await snapshotFor(end),source=scope.source,duration=end-start;
    const [current,previous,growth,weekly]=await Promise.all([
      deps.evidence.fetchNorthStar(start,end,source,snapshot),deps.evidence.fetchNorthStar(start-duration,start,source,snapshot),
      deps.evidence.fetchGrowthInsights({start,end,source,snapshot}),
      deps.evidence.fetchWeeklyCore({end,source,snapshot}).catch(error=>({available:false,error:error.message}))
    ]);
    const candidates=rankEvidence(current.totals,previous.totals,growth,weekly,focusGoal).map(explainCandidate);
    return compact({version:'business-evidence-v1',business:{product:'LogEarn',scope,focusGoal,question},focusGoal,
      period:{start,end,previousStart:start-duration,previousEnd:start,timezone:'Asia/Bangkok'},definitions,
      snapshot:{id:snapshot.snapshot_id,asOf:snapshot.as_of,cutoff:snapshot.snapshot_cutoff,historyComplete:snapshot.history_complete===true,eventsCompleteThrough:snapshot.events_complete_through||null},
      current,previous,growth,weekly,candidates,warnings:warnings(snapshot,growth,weekly),
      summary:{goal:goalLabels[focusGoal],candidateCount:candidates.length,definition:'规则排序只提供核查顺序；不证明因果、收益或行动效果，最终优先级由运营人员确认。'}});
  }
  // Fetch the same immutable, read-only facts once for the selected day.
  // Each goal retains its own unchanged rankEvidence and reporting contract.
  async function buildMany({start,end,businessScope={},goals=['activation'],question=''}={}){
    validateRange(start,end);
    const scope=validateScope(businessScope);
    if(!Array.isArray(goals)||!goals.length||goals.length>4||
      goals.some(g=>!Object.hasOwn(goalLabels,g))||new Set(goals).size!==goals.length)
      throw Object.assign(Error('增长目标列表无效'),{status:400});
    const snapshot=await snapshotFor(end),source=scope.source,duration=end-start;
    const [current,previous,growth,weekly]=await Promise.all([
      deps.evidence.fetchNorthStar(start,end,source,snapshot),
      deps.evidence.fetchNorthStar(start-duration,start,source,snapshot),
      deps.evidence.fetchGrowthInsights({start,end,source,snapshot}),
      deps.evidence.fetchWeeklyCore({end,source,snapshot})
        .catch(error=>({available:false,error:error.message}))
    ]);
    return Object.fromEntries(goals.map(focusGoal=>{
      const candidates=rankEvidence(current.totals,previous.totals,growth,weekly,focusGoal).map(explainCandidate);
      return [focusGoal,compact({
        version:'business-evidence-v1',business:{product:'LogEarn',scope,focusGoal,question},focusGoal,
        period:{start,end,previousStart:start-duration,previousEnd:start,timezone:'Asia/Bangkok'},
        definitions,
        snapshot:{id:snapshot.snapshot_id,asOf:snapshot.as_of,cutoff:snapshot.snapshot_cutoff,
          historyComplete:snapshot.history_complete===true,
          eventsCompleteThrough:snapshot.events_complete_through||null},
        current,previous,growth,weekly,candidates,
        warnings:warnings(snapshot,growth,weekly),
        summary:{goal:goalLabels[focusGoal],candidateCount:candidates.length,
          definition:'规则排序只提供核查顺序；不证明因果、收益或行动效果，最终优先级由运营人员确认。'}
      })];
    }));
  }
  async function review(report,action){
    const snapshot=await deps.remote.status(),periods=reviewPeriods(Number(action.executed_at),Math.min(Date.now(),Date.parse(snapshot.as_of)+1));
    const candidate=report.candidates.find(c=>c.id===action.candidate_id),source=candidate?.source||report.business.scope.source;
    const {baselineStart,baselineEnd,effectStart,effectEnd}=periods;
    if(candidate?.metric==='weekly_core'&&periods.days<7)throw Object.assign(Error('周核心指标需要执行后至少7个完整业务日'),{status:400});
    const [baseline,effect,bg,eg]=await Promise.all([
      deps.evidence.fetchNorthStar(baselineStart,baselineEnd,source,snapshot),deps.evidence.fetchNorthStar(effectStart,effectEnd,source,snapshot),
      deps.evidence.fetchGrowthInsights({start:baselineStart,end:baselineEnd,source,snapshot}),deps.evidence.fetchGrowthInsights({start:effectStart,end:effectEnd,source,snapshot})
    ]);
    function values(north,growth){
      const cs=growth.channels||[],eligible=cs.reduce((n,c)=>n+c.eligible,0),activated=cs.reduce((n,c)=>n+c.activated,0),d7=cs.reduce((n,c)=>n+(c.d7?.eligible||0),0),returned=cs.reduce((n,c)=>n+(c.d7?.returned||0),0);
      return {...north.totals,activation_rate:eligible?activated/eligible:null,d7:d7?returned/d7:null};
    }
    const metrics=[...new Set([candidate?.metric||'active_users','active_users','new_users','returning_users'])];
    const before=values(baseline,bg),after=values(effect,eg);
    let weeklyWindows=null;
    if(candidate?.metric==='weekly_core'){
      const [bw,ew]=await Promise.all([deps.evidence.fetchWeeklyCore({end:baselineEnd,source,snapshot}),deps.evidence.fetchWeeklyCore({end:effectEnd,source,snapshot})]);
      before.weekly_core=bw.available?bw.users:null;after.weekly_core=ew.available?ew.users:null;
      weeklyWindows={baseline:bw,effect:ew,definition:'周核心指标比较各观察期截止前7个完整业务日，其余人数指标比较整个等长观察期'};
    }
    const changes=metricChanges(before,after,metrics);
    return compact({periods,source,metricChanges:changes,weeklyWindows,baseline:{...baseline,channels:bg.channels},effect:{...effect,channels:eg.channels},
      snapshot:{id:snapshot.snapshot_id,asOf:snapshot.as_of},warnings:warnings(snapshot,eg,{available:true}),
      conclusion:'这是等长完整业务日的观测对比，没有对照实验，不自动判定有效或无效；请结合样本和同期变化作人工判断。'});
  }
  return {build,buildMany,review};
}
module.exports={createService,goalLabels,metricLabels};
