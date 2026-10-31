const DAY = 86400000, OFFSET = 7 * 3600000;
const definitions = {
  active_users: '统计期内观测到筹码查看或下钻的去重用户；不是请求成功、理解或付费证明',
  new_users: '统计期内首次观测到筹码分析的去重用户；不是新注册用户',
  returning_users: '首次分析早于统计期且期内再次观测到分析的去重用户',
  activation_rate: '首次观测人群中成熟24小时内观测到首次分析的比例；按渠道给出分母',
  d7: '成熟队列在第7个业务日再次观测到分析的比例；未成熟不计入分母',
  weekly_core: '近7个完整UTC+7自然日至少4天观测到筹码分析；目标与数据覆盖见原始证据',
  registered_users: '真实注册账户人数，来自 account_v2.created_at；不是首次分析用户',
  registration_activation_rate: '已成熟注册账户中注册后24小时内首次筹码分析行为比例；未成熟注册单列',
  registered_trade_conversion_rate: '已成熟且身份可验证的注册用户中，首次筹码分析后7天内真实交易比例；按用户身份关联，非同Token归因或因果证明'
,  registered_user_journey: '注册账户队列的24小时筹码分析激活、注册后7日内并行产品入口参与、首次分析后7日身份可验证交易转化；各入口可重叠，不构成线性漏斗或因果证明'
};
function validateRange(start, end, now = Date.now()) {
  if (![start, end].every(Number.isSafeInteger) || start < 0 || end <= start || end > now || end-start > 31*DAY || start-(end-start)<0)
    throw Object.assign(Error('请选择有效的1–31天历史时间范围（毫秒时间戳）'), {status:400});
}
function validateScope(scope = {}) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).some(k => k !== 'source'))
    throw Object.assign(Error('当前分析范围支持来源 source；活动或人群范围尚不支持，请勿当作已筛选'), {status:400});
  if (scope.source != null && (typeof scope.source !== 'string' || !scope.source.trim() || scope.source.length>200))
    throw Object.assign(Error('来源格式无效'), {status:400});
  return {source:scope.source || 'all'};
}
function rankEvidence(current, previous, growth, weekly, goal) {
  const candidates = Object.keys(current).filter(k => Number.isFinite(current[k]) && Number.isFinite(previous[k])).map(metric => {
    const absolute = current[metric]-previous[metric];
    const change = previous[metric] > 0 ? absolute/previous[metric] : null;
    const confidence = growth.quality?.history_complete ? 1 : 0.6;
    const score = Math.round(Math.log2(1+Math.abs(absolute))*10 * (1+Math.min(Math.abs(change || 0),2)) * confidence);
    return {id:metric, metric, current:current[metric], previous:previous[metric], absolute, change, score,
      priority:score>=70?'P0':score>=30?'P1':'P2', reason:'观测人数变化 × 相对变化 × 采集证据强度；行动成本由建议单独说明', goal};
  });
  if (weekly?.available && weekly.goal?.users != null && weekly.goal.progress != null && weekly.users<weekly.goal.users) candidates.push({
    id:'weekly_core', metric:'weekly_core', current:weekly.users, target:weekly.goal.users, dueDate:weekly.goal.due_date,
    gap:Math.max(0,weekly.goal.users-weekly.users), score:Math.round(Math.max(0,1-weekly.goal.progress)*100),
    priority:weekly.goal.progress<0.5?'P0':'P1', reason:'周核心用户距业务目标的差距；不承诺因果或收益',goal
  });
  for (const channel of growth.channels || []) {
    if (goal==='activation' && channel.activation_rate != null && channel.eligible>0) candidates.push({id:'activation:'+channel.source,metric:'activation_rate',source:channel.source,
      rate:channel.activation_rate,eligible:channel.eligible,affected:channel.eligible-channel.activated,score:Math.round((1-channel.activation_rate)*Math.log2(1+channel.eligible)*15),
      priority:channel.eligible>=30&&channel.activation_rate<0.3?'P1':'P2',reason:'成熟样本未激活人数与比例；新注册和首次观测不能混淆'});
    if (goal==='retention' && channel.d7?.rate != null && channel.d7.eligible>0) candidates.push({id:'d7:'+channel.source,metric:'d7',source:channel.source,
      rate:channel.d7.rate,eligible:channel.d7.eligible,score:Math.round((1-channel.d7.rate)*Math.log2(1+channel.d7.eligible)*15),priority:channel.d7.eligible>=30?'P1':'P2',reason:'成熟D7样本的观测回访缺口，不证明真实流失'});
  }
  return candidates.filter(c=>c.score>0).sort((a,b)=>a.priority.localeCompare(b.priority)||b.score-a.score||a.id.localeCompare(b.id));
}
function reviewPeriods(executedAt, now = Date.now()) {
  if (!Number.isSafeInteger(now)) throw Error('数据截至时间无效');
  if (!Number.isSafeInteger(executedAt) || executedAt < 0 || executedAt > now) throw Error('执行时间无效');
  const effectStart = Math.floor((executedAt+OFFSET)/DAY)*DAY-OFFSET+DAY;
  const endOfToday = Math.floor((now+OFFSET)/DAY)*DAY-OFFSET;
  const effectEnd = Math.min(effectStart+14*DAY,endOfToday);
  const days = (effectEnd-effectStart)/DAY;
  if (days<3) throw Object.assign(Error('执行后至少需要3个完整业务日才能复盘'), {status:400});
  const baselineEnd=effectStart-DAY;
  return {baselineStart:baselineEnd-days*DAY,baselineEnd,effectStart,effectEnd,days};
}
function metricChanges(baseline, effect, metrics) {
  return Object.fromEntries(metrics.map(metric => {
    const a=baseline[metric],b=effect[metric];
    if (!Number.isFinite(a)||!Number.isFinite(b)) return [metric,{available:false,error:'metric_not_found'}];
    return [metric,{available:true,baseline:a,effect:b,absolute:b-a,change:a>0?(b-a)/a*100:null,direction:b>a?'up':b<a?'down':'flat'}];
  }));
}
module.exports={definitions,validateRange,validateScope,rankEvidence,reviewPeriods,metricChanges};
