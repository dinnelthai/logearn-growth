const HOUR=3600000,DAY=24*HOUR
export const RULES=[
 {id:'first_analysis',name:'登录但未分析',condition:'首次登录30分钟后仍未有效分析',action:'引导查看第一个筹码峰',goal:'chip',priority:2},
 {id:'first_strategy',name:'完成分析但未开策略',condition:'首次分析满24小时、近3天仍分析且未启动策略',action:'推荐适合的AI策略',goal:'ai',priority:3},
 {id:'view_signal',name:'策略已启动但未查看信号',condition:'策略结果生成30分钟后仍未查看该结果',action:'提醒查看策略结果',goal:'signal_view',priority:1},
 {id:'inactive_3d',name:'连续3天未分析',condition:'最近分析距今3至7天',action:'推送热门金狗或市场机会',goal:'chip',priority:4},
 {id:'core',name:'核心用户',condition:'近7天至少4天有效分析',action:'邀请参与高级策略或推荐活动',goal:'share_complete',priority:5},
 {id:'churned',name:'流失用户',condition:'最近有效分析距今超过7天',action:'用新功能、金狗复盘召回',goal:'chip',priority:6},
]
export const defaultRules=()=>RULES.map(r=>({...r,enabled:true,channel:'auto'}))
export function selectChannel(user,preference='auto') {
 const available=['telegram','email'].filter(c=>user[c+'_bound']===true)
 return preference==='auto'?available[0]??null:available.includes(preference)?preference:null
}
function match(user,rule,asOf) {
 const es=user.events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).slice().sort((a,b)=>a.t-b.t),chips=es.filter(e=>e.type==='chip'),ais=es.filter(e=>e.type==='ai'),last=chips.at(-1)?.t
 if(rule.id==='first_analysis'){const login=es.find(e=>e.type==='login');return login&&!chips.length&&asOf-login.t>=HOUR/2?{since:login.t}:null}
 if(rule.id==='first_strategy')return chips.length&&!ais.length&&asOf-chips[0].t>=DAY&&asOf-last<3*DAY?{since:chips[0].t}:null
 if(rule.id==='view_signal') {
  const result=es.filter(e=>e.type==='strategy_result'&&e.strategy_run_id&&e.result_id&&ais.some(a=>a.strategy_run_id===e.strategy_run_id&&a.t<=e.t)).reverse().find(e=>asOf-e.t>=HOUR/2&&!es.some(v=>v.type==='signal_view'&&v.result_id===e.result_id&&v.strategy_run_id===e.strategy_run_id&&v.t>=e.t))
  return result?{since:result.t,strategy_run_id:result.strategy_run_id,result_id:result.result_id}:null
 }
 if(rule.id==='inactive_3d')return last!==undefined&&asOf-last>=3*DAY&&asOf-last<=7*DAY?{since:last}:null
 if(rule.id==='churned')return last!==undefined&&asOf-last>7*DAY?{since:last}:null
 if(rule.id==='core'){const days=new Set(chips.filter(e=>e.t>=asOf-7*DAY).map(e=>Math.floor((e.t+7*HOUR)/DAY)));return days.size>=4&&asOf-last<DAY?{since:last}:null}
 return null
}
export function evaluateLifecycle(users,{asOf,rules=defaultRules(),deliveries=[]}) {
 const candidates=[]
 for(const user of users) {
  const matches=rules.filter(r=>r.enabled).map(rule=>({rule,context:match(user,rule,asOf)})).filter(r=>r.context).sort((a,b)=>a.rule.priority-b.rule.priority)
  let chosen=false
  for(const {rule,context} of matches) {
   const channel=selectChannel(user,rule.channel),history=deliveries.filter(d=>d.user_id===user.id&&['queued','sent','delivered','unknown'].includes(d.status)&&Number.isFinite(d.sent_at)&&d.sent_at<=asOf)
   let reason=!user.id.startsWith('user:')?'匿名用户':!channel?'未绑定渠道':history.some(d=>asOf-d.sent_at<DAY)?'24小时频控':history.some(d=>d.rule_id===rule.id&&asOf-d.sent_at<7*DAY)?'同场景7天冷却':chosen?'其他场景优先':null
   if(!reason)chosen=true
   candidates.push({u:user,rule_id:rule.id,rule,channel,...context,eligible:!reason,reason})
  }
 }
 return candidates
}
/** Observed goal after sent time is association, not causal uplift. */
export function deliveryOutcome(delivery,user,asOf) {
 const rule=RULES.find(r=>r.id===delivery.rule_id)
 if(!rule||!user||!['sent','delivered'].includes(delivery.status))return '—'
 const converted=user.events.some(e=>e.type===rule.goal&&e.t>delivery.sent_at&&e.t<=Math.min(asOf,delivery.sent_at+DAY)&&(rule.id!=='view_signal'||(e.strategy_run_id===delivery.strategy_run_id&&e.result_id===delivery.result_id)))
 return converted?'24h内完成目标':asOf<delivery.sent_at+DAY?'待观察':'24h内未完成目标'
}
