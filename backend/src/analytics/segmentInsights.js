const DAY=86400000,OFFSET=25200000
const FILTERS={registration:['all','7','28','older'],login:['all','7','28','older','unknown'],binding:['all','telegram','email','both','neither'],identity:['all','phantom','metamask','multiple'],invitation:['all','referred','none','inviter'],trade:['all','none','first','repeat'],status:['all','active','locked'],asset:['all','balance','nft','points','vip','balance_unknown','points_unknown'],segment:['all','未观测分析','新分析用户','分析型','高频核心','策略型','流失风险','已流失','回流','观察不足']}
FILTERS.credits=['all','available','used','empty','unknown']
FILTERS.task=['all','single_page_no_action','token_detail_no_analysis','value_unobserved','login_no_analysis','analysis_no_d1','absent_3d','new_no_activity','analysis_no_trade','repeat_analysis_no_trade','strategy_no_trade','trade_no_analysis','analysis_no_binding','checkin_no_analysis','referred_no_analysis']
FILTERS.points=['all','ledger','recent','earned','negative','checkin','streak']
const POOLS=['business','registered','contact_only','no_signal']
const GROUPS=['signal','binding','registration','identity','invitation','trade','status','segment']
function validateOptions(body){
  if(body.pool&&!POOLS.includes(body.pool))throw Object.assign(new Error('未知用户池'),{status:400})
  const filters=body.filters||{}
  if(typeof filters!=='object'||Array.isArray(filters)||Object.entries(filters).some(([k,v])=>!FILTERS[k]?.includes(v)))throw Object.assign(new Error('未知分群筛选条件'),{status:400})
  if(body.group_by&&!GROUPS.includes(body.group_by))throw Object.assign(new Error('未知对比维度'),{status:400})
  return filters
}
function ageGroup(t,now){if(t==null)return 'unknown';return t>=now-7*DAY?'7':t>=now-28*DAY?'28':'older'}
function binding(r){return r.telegram_bound&&r.email_bound?'两者已绑定':r.telegram_bound?'仅Telegram':r.email_bound?'仅邮箱':'均未验证绑定'}
function identity(r){return r.identity_count>1?'多种已验证身份':r.phantom_bound?'Phantom':r.metamask_bound?'MetaMask':'其他已验证身份或无身份'}
function segment(r,asOf,historyComplete){
  if(r.first_chip_at==null)return '未观测分析'
  if(r.returned_28)return historyComplete?'回流':'观察不足'
  if(r.last_chip_at<asOf-7*DAY&&!historyComplete)return '观察不足'
  if(r.last_chip_at<asOf-28*DAY)return '已流失'
  if(r.last_chip_at<asOf-7*DAY)return '流失风险'
  if(r.chip_days_28>=6)return '高频核心'
  if(r.ai_strategies_28>=2)return '策略型'
  if(asOf-r.first_chip_at<=7*DAY)return '新分析用户'
  return '分析型'
}
function groupLabel(r,by,now){
  if(by==='signal')return r.signal_tier
  if(by==='binding')return binding(r)
  if(by==='identity')return identity(r)
  if(by==='registration')return {'7':'近7日注册','28':'8–28日注册',older:'28日前注册'}[ageGroup(r.created_at,now)]
  if(by==='invitation')return r.referred_user?'有有效邀请人':'无有效邀请关系'
  if(by==='trade')return r.trade_count===0?'无交易记录':r.trade_count===1?'一条交易记录':'重复交易记录'
  if(by==='status')return String(r.account_status??'未知状态')
  return r.segment
}
function matches(r,f,now){
  if(f.credits==='available'&&!(r.credits_available>0)||f.credits==='used'&&!(r.credits_used>0)||f.credits==='empty'&&r.credits_available!==0||f.credits==='unknown'&&r.credits_available!=null)return false
  const operational={single_page_no_action:r.single_page_no_action===true,token_detail_no_analysis:r.token_detail_no_analysis===true,new_no_activity:r.created_at>=now-7*DAY&&r.first_observed_at==null,analysis_no_trade:r.analysis_days_period>0&&r.trade_count===0,repeat_analysis_no_trade:r.analysis_days_period>=2&&r.trade_count===0,strategy_no_trade:r.strategy_period&&r.trade_count===0,trade_no_analysis:r.trade_count_period>0&&r.analysis_days_period===0,analysis_no_binding:r.analysis_days_period>0&&!r.telegram_bound&&!r.email_bound,checkin_no_analysis:r.checkin_days_period>0&&r.analysis_days_period===0,referred_no_analysis:r.referred_user&&r.analysis_days_period===0}
  if(Object.hasOwn(operational,f.task)&&!operational[f.task])return false
  if(f.task==='login_no_analysis'&&!(r.login_period&&r.analysis_days_period===0))return false
  if(f.task==='analysis_no_d1'&&!(r.first_chip_at!=null&&Math.floor((now+OFFSET)/DAY)-Math.floor((r.first_chip_at+OFFSET)/DAY)>=2&&r.analysis_returned_d1===false))return false
  if(f.task==='absent_3d'&&!(r.last_observed_at!=null&&Math.floor((now+OFFSET)/DAY)-Math.floor((r.last_observed_at+OFFSET)/DAY)>=4))return false
  if(f.task==='value_unobserved'&&!(r.value_signal&&!r.recent_used))return false
  if(f.points==='ledger'&&!(r.points_records>0)||f.points==='recent'&&!(r.points_period_records>0)||f.points==='earned'&&!(r.points_earned_period>0)||f.points==='negative'&&!(r.points_negative_period<0)||f.points==='checkin'&&!(r.checkin_days_period>0)||f.points==='streak'&&!(r.checkin_streak_period>=3))return false
  if(f.asset==='balance'&&r.has_balance!==true||f.asset==='nft'&&!(r.nft_count>0)||f.asset==='points'&&!(r.available_points>0)||f.asset==='vip'&&r.vip_active!==true||f.asset==='balance_unknown'&&r.has_balance!=null||f.asset==='points_unknown'&&r.available_points!=null)return false
  if(f.status&&f.status!=='all'&&r.account_status!==f.status)return false
  if(f.segment&&f.segment!=='all'&&r.segment!==f.segment)return false
  if(f.registration&&f.registration!=='all'&&ageGroup(r.created_at,now)!==f.registration)return false
  if(f.login&&f.login!=='all'&&ageGroup(r.last_login_at,now)!==f.login)return false
  if(f.binding==='telegram'&&!r.telegram_bound||f.binding==='email'&&!r.email_bound||f.binding==='both'&&!(r.telegram_bound&&r.email_bound)||f.binding==='neither'&&(r.telegram_bound||r.email_bound))return false
  if(f.identity==='phantom'&&!r.phantom_bound||f.identity==='metamask'&&!r.metamask_bound||f.identity==='multiple'&&r.identity_count<2)return false
  if(f.invitation==='referred'&&!r.referred_user||f.invitation==='none'&&r.referred_user||f.invitation==='inviter'&&!r.inviter)return false
  if(f.trade==='none'&&r.trade_count!==0||f.trade==='first'&&r.trade_count!==1||f.trade==='repeat'&&r.trade_count<2)return false
  return true
}
function summary(rows,start,end){const analysts=rows.filter(r=>r.analysis_days_period>0);return {
  users:rows.length,new_users:rows.filter(r=>r.created_at>=start&&r.created_at<end).length,
  login_users:rows.filter(r=>r.login_period).length,analysis_users:analysts.length,
  analysis_rate:rows.length?analysts.length/rows.length:null,
  avg_analysis_days:analysts.length?analysts.reduce((n,r)=>n+r.analysis_days_period,0)/analysts.length:null,
  strategy_users:rows.filter(r=>r.strategy_period).length,strategy_rate:rows.length?rows.filter(r=>r.strategy_period).length/rows.length:null,
  trade_users:rows.filter(r=>r.trade_count_period>0).length,trade_rate:rows.length?rows.filter(r=>r.trade_count_period>0).length/rows.length:null,
  new_referred_users:rows.filter(r=>r.invitation_at>=start&&r.invitation_at<end).length,
  new_referred_analysis_users:rows.filter(r=>r.invitation_at>=start&&r.invitation_at<end&&r.referred_analysis_period).length,
  d1_rate:null,d7_rate:null,registration_7d_rate:null,coverage:'partial'
}}
function businessSignals(r,now){
  const contactable=!!(r.telegram_bound||r.email_bound),used=r.first_chip_at!=null||!!r.used_strategy||r.credits_used>0,
    value=Number(r.trade_count)>0||r.nft_count>0||r.has_balance===true||r.vip_active===true||r.credits_available>0,points=r.available_points>0||r.points_records>0||r.checkin_days>0,
    recent=r.last_chip_at!=null&&r.last_chip_at>=now-28*DAY||r.last_strategy_at!=null&&r.last_strategy_at>=now-28*DAY
  return {...r,contactable,business_signal:value||used||points,value_signal:value,recent_used:recent,
    signal_tier:value?'价值线索':used?'使用用户':points?'积分线索':contactable?'仅可联系':'无已知业务信号'}
}
function computeInsights(input,{asOf,factsAsOf,start,end,pointsData=null,creditsQuality=null,filters={},groupBy='signal',pool='business',historyComplete=false}){
  const rows=input.filter(r=>r.account_id!=null).map(r=>businessSignals({...r,segment:segment(r,asOf,historyComplete)},factsAsOf))
  const inPool=r=>pool==='registered'||pool==='business'&&r.business_signal||pool==='contact_only'&&!r.business_signal&&r.contactable||pool==='no_signal'&&!r.business_signal&&!r.contactable
  const selected=rows.filter(r=>inPool(r)&&matches(r,filters,asOf)),lists={all:selected.map(r=>r.user_key),unmatched:input.filter(r=>r.account_id==null).map(r=>r.user_key)},groups=new Map(),segments=new Map(),cohorts=new Map()
  for(const r of selected){const label=groupLabel(r,groupBy,factsAsOf);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(r)
    if(!segments.has(r.segment))segments.set(r.segment,[]);segments.get(r.segment).push(r)
    // Calendar Monday registration cohorts, UTC+7.
    const day=Math.floor((r.created_at+OFFSET)/DAY),monday=day-((day+3)%7),key=new Date(monday*DAY).toISOString().slice(0,10)
    if(!cohorts.has(key))cohorts.set(key,[]);cohorts.get(key).push(r)
  }
  function periodLists(key,rs){
    lists[key+':analysis']=rs.filter(r=>r.analysis_days_period>0).map(r=>r.user_key)
    lists[key+':unobserved']=rs.filter(r=>!(r.analysis_days_period>0)).map(r=>r.user_key)
    lists[key+':strategy']=rs.filter(r=>r.strategy_period).map(r=>r.user_key)
    lists[key+':trade']=rs.filter(r=>r.trade_count_period>0).map(r=>r.user_key)
  }
  const compare=[...groups].map(([label,rs],i)=>{const key='group:'+i;lists[key]=rs.map(r=>r.user_key);periodLists(key,rs);return {label,list_key:key,...summary(rs,start,end)}})
  const main=[...segments].map(([label,rs],i)=>{const key='segment:'+i;lists[key]=rs.map(r=>r.user_key);return {segment:label,users:rs.length,list_key:key}})
  const cohortRows=[...cohorts].sort(([a],[b])=>b.localeCompare(a)).map(([label,rs])=>{const key='registration:'+label;lists[key]=rs.map(r=>r.user_key);periodLists(key,rs);return {label,list_key:key,...summary(rs,start,end)}})
  const focus={value_users:selected.filter(r=>r.value_signal).length,recent_used_users:selected.filter(r=>r.recent_used).length,contactable_value_users:selected.filter(r=>r.value_signal&&r.contactable).length,value_without_recent_use:selected.filter(r=>r.value_signal&&!r.recent_used).length,
    nft_users:selected.filter(r=>r.nft_count>0).length,positive_balance_users:selected.filter(r=>r.has_balance===true).length,points_users:selected.some(r=>r.available_points!=null)?selected.filter(r=>r.available_points>0).length:null,vip_users:null}
  for(const [key,condition]of Object.entries({value:r=>r.value_signal,recent_used:r=>r.recent_used,contactable_value:r=>r.value_signal&&r.contactable,value_without_recent_use:r=>r.value_signal&&!r.recent_used}))lists[key]=selected.filter(condition).map(r=>r.user_key)
  periodLists('period',selected)
  for(const [key,condition]of Object.entries({'credits:available':r=>r.credits_available>0,'credits:used':r=>r.credits_used>0,'credits:empty':r=>r.credits_available===0,'credits:unknown':r=>r.credits_available==null,nft:r=>r.nft_count>0,balance:r=>r.has_balance===true,points:r=>r.available_points>0,
    'period:login':r=>r.login_period,'period:new':r=>r.created_at>=start&&r.created_at<end,
    'referral:new':r=>r.invitation_at>=start&&r.invitation_at<end,
    'referral:analysis':r=>r.invitation_at>=start&&r.invitation_at<end&&r.referred_analysis_period}))lists[key]=selected.filter(condition).map(r=>r.user_key)
  const details=Object.fromEntries(input.map(r=>[r.user_key,{registered:r.account_id!=null,created_at:r.created_at,last_login_at:r.last_login_at,account_status:r.account_status,
    source:r.source||'未知',first_chip_at:r.first_chip_at,last_chip_at:r.last_chip_at,chip_days_28:r.chip_days_28,
    telegram_bound:r.telegram_bound,email_bound:r.email_bound,identity: r.account_id!=null?identity(r):'未知',
    nft_count:r.nft_count,has_balance:r.has_balance,balance_updated_at:r.balance_updated_at,available_points:r.available_points,vip_active:r.vip_active,
    ...(r.credits_available!=null?{credits_available:r.credits_available,credits_total:r.credits_total,credits_used:r.credits_used,credits_cumulative:r.credits_cumulative,credits_updated_at:r.credits_updated_at}:{}),
    ...(r.points_records>0||r.checkin_days>0?{points_records:r.points_records,points_period_records:r.points_period_records,points_earned_period:r.points_earned_period,points_negative_period:r.points_negative_period,last_points_at:r.last_points_at,checkin_days_period:r.checkin_days_period,checkin_streak_period:r.checkin_streak_period,last_checkin_at:r.last_checkin_at}:{}),
    business_signal:r.account_id!=null?businessSignals(r,factsAsOf).business_signal:null,signal_tier:r.account_id!=null?businessSignals(r,factsAsOf).signal_tier:'身份未匹配',
    referred_user:r.referred_user,inviter:r.inviter,trade_count:r.account_id!=null?r.trade_count:null,segment:r.account_id!=null?segment(r,asOf,historyComplete):'身份未匹配'}]))
  const points=pointsData?require('./pointsInsights').pointsInsights(selected,pointsData,start,end,lists):null
  return {lists,details,payload:{credits:{available_users:lists['credits:available'].length,used_users:lists['credits:used'].length,empty_users:lists['credits:empty'].length,unknown_users:lists['credits:unknown'].length,quality:creditsQuality},points,focus,business_total:rows.filter(r=>r.business_signal).length,contact_only_total:rows.filter(r=>!r.business_signal&&r.contactable).length,no_signal_total:rows.filter(r=>!r.business_signal&&!r.contactable).length,pool,summary:summary(selected,start,end),total:selected.length,registered_total:rows.length,unmatched_users:lists.unmatched.length,
    segments:main,comparison:compare,registration_cohorts:cohortRows,group_by:groupBy,filters,
    start,end,as_of:asOf,facts_as_of:new Date(factsAsOf).toISOString(),user_pool:pool,binding_facts_available:true,
    retention_reason:'历史首次与连续完整覆盖未确认，D1/D7及注册后7日分析率暂不可计算'}}
}
module.exports={validateOptions,computeInsights,businessSignals,FILTERS,GROUPS,POOLS}
