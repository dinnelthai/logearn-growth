const DAY=86400000
const DEFINITIONS=[
 ['new_analysis','新分析用户','所选期间首次观测到有效分析'],
 ['core','高频核心','截至观测日，近28天有效分析至少6天'],
 ['low_frequency','低频使用用户','近7天有分析，近28天分析1–5天'],
 ['analysis_no_trade','已分析未交易','所选期间有分析，历史未观测交易记录'],
 ['traded','交易用户','所选期间有有效交易记录'],
 ['unactivated','待激活用户','注册账号尚未观测有效分析'],
 ['silent','沉默用户（观测）','曾分析，距最近一次分析已超过7天；不代表真实流失'],
 ['returned','回流用户','历史覆盖完整，确认超过28天分析断档后回归'],
]
function behaviorTags(r,{start,end,asOf,historyComplete=false}){
 const first=r.first_chip_at,last=r.last_chip_at
 const conditions={new_analysis:first!=null&&first>=start&&first<end&&first<=asOf,core:r.chip_days_28>=6,low_frequency:last!=null&&last>=asOf-7*DAY&&r.chip_days_28>0&&r.chip_days_28<6,analysis_no_trade:r.analysis_days_period>0&&r.trade_count===0,traded:r.trade_count_period>0,unactivated:r.account_id!=null&&first==null,silent:last!=null&&last<asOf-7*DAY,returned:historyComplete&&r.returned_28===true}
 return DEFINITIONS.filter(([key])=>conditions[key]).map(([key,label,description])=>({key,label,description}))
}
module.exports={behaviorTags,DEFINITIONS}
