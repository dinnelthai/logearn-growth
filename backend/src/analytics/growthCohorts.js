const DAY=86400000,OFFSET=25200000
const finite=v=>v!=null&&Number.isFinite(Number(v))
function growthCohorts(rows,registration,{start,end,asOf},put){
 const summarize=(rs,anchor,key)=>{
  const eligible=rs.filter(r=>finite(r[anchor])&&Number(r[anchor])+DAY<=asOf+1)
  const eligibleIds=new Set(eligible.map(r=>r.user_key))
  const activated=eligible.filter(r=>finite(r.first_chip_at)&&Number(r.first_chip_at)>=Number(r[anchor])&&Number(r.first_chip_at)<Number(r[anchor])+DAY)
  return {users:put(key+':users',rs),eligible:put(key+':eligible',eligible),activated:put(key+':activated',activated),pending:put(key+':pending',rs.filter(r=>!eligibleIds.has(r.user_key))),rate:eligible.length?activated.length/eligible.length:null,list_key:key}
 }
 const observed=summarize(rows.filter(r=>r.first_seen_at>=start&&r.first_seen_at<end),'first_seen_at','cohort:observed')
 const registered=registration.available?summarize(registration.rows,'registered_at','cohort:registered'):null
 const cohort=rows.filter(r=>finite(r.first_chip_at)&&r.first_chip_at>=start&&r.first_chip_at<end)
 const mature=cohort.filter(r=>r.first_chip_at+7*DAY<=asOf+1)
 const matureIds=new Set(mature.map(r=>r.user_key))
 const repeats=[['other_day','首次分析后7天内另日分析','first_later_day_at'],['after_24h','首次分析后24小时至7天内再分析','first_after_24h_at']].map(([id,label,field])=>{
  const valid=r=>finite(r[field])&&Number(r[field])>r.first_chip_at&&Number(r[field])<r.first_chip_at+7*DAY&&Number(r[field])<=asOf&&(id==='other_day'?Math.floor((Number(r[field])+OFFSET)/DAY)>Math.floor((r.first_chip_at+OFFSET)/DAY):Number(r[field])>=r.first_chip_at+DAY)
  const returned=mature.filter(valid),pending=cohort.filter(r=>!matureIds.has(r.user_key)),key='cohort:repeat:'+id
  return {id,label,users:put(key+':users',cohort),eligible:put(key+':eligible',mature),returned:put(key+':returned',returned),pending:put(key+':pending',pending),observed_returned:put(key+':observed_returned',cohort.filter(valid)),rate:mature.length?returned.length/mature.length:null,list_key:key,window_days:7}
 })
 return {observed,registration:{available:registration.available,error:registration.error||null,scope:registration.scope||'all',metrics:registered},repeats,definition:'分析沿用筹码查看/下钻观测口径；注册批次按账号创建时间，包含未观测事件账号。24小时激活窗口左闭右开。复访从首次观测分析起168小时内，另日按UTC+7；满168小时才进入复访率分母。日期成熟不等于采集完整。'}
}
module.exports={growthCohorts}
