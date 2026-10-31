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
 const engagement=registration.available?(()=>{
  const rows=registration.rows,eligible=rows.filter(r=>finite(r.registered_at)&&Number(r.registered_at)+7*DAY<=asOf+1);
  const pending=rows.filter(r=>!eligible.includes(r));
  const withinWindow=field=>eligible.filter(r=>finite(r[field])&&
   Number(r[field])>=Number(r.registered_at)&&
   Number(r[field])<Number(r.registered_at)+7*DAY&&Number(r[field])<=asOf);
  return {
   eligible:put('cohort:registered:engagement:eligible',eligible),
   pending:put('cohort:registered:engagement:pending',pending),
   chip_analysis_users:put('cohort:registered:engagement:chip',withinWindow('first_chip_at')),
   holder_view_users:put('cohort:registered:engagement:holders',withinWindow('first_holder_at')),
   strategy_started_users:put('cohort:registered:engagement:strategy',withinWindow('first_strategy_at')),
   signal_view_users:put('cohort:registered:engagement:signals',withinWindow('first_signal_at')),
   repeat_analysis_users:put('cohort:registered:engagement:repeat',withinWindow('first_repeat_chip_at')),
   definition:'各产品入口分别统计注册后7日内的首次观测；分母仅为已成熟注册账户。产品入口可重叠，不合并成单一转化率。'
  };
 })():null
 // Source is a *currently observed analytics association*, not an
 // acquisition attribution at registration time. Aggregate only verified
 // registration rows; never emit account identities or raw source strings.
 const bySource=registration.available?(()=>{
  const sourceKey=value=>{
   if(value==null||value===''||value==='未知'||value==='unknown')return 'unknown';
   return typeof value==='string'&&/^[a-z][a-z0-9_-]{0,31}$/i.test(value)?
    value.toLowerCase():'other';
  };
  const groups=new Map();
  for(const row of registration.rows){
   const key=sourceKey(row.source);
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(row);
  }
  // Keep the four largest named observed sources; preserve unclassified
  // accounts and aggregate every remaining key into an explicit other bucket.
  const named=[...groups].filter(([key])=>key!=='unknown'&&key!=='other')
   .sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
  const buckets=named.slice(0,4);
  const extras=[...(groups.get('other')||[]),...named.slice(4).flatMap(x=>x[1])];
  if(extras.length)buckets.push(['other',extras]);
  if(groups.has('unknown'))buckets.push(['unknown',groups.get('unknown')]);
  return buckets.map(([source,sourceRows])=>{
   const oneDay=sourceRows.filter(r=>finite(r.registered_at)&&Number(r.registered_at)+DAY<=asOf+1);
   const activated=oneDay.filter(r=>finite(r.first_chip_at)&&Number(r.first_chip_at)>=Number(r.registered_at)&&
    Number(r.first_chip_at)<Number(r.registered_at)+DAY);
   const sevenDay=sourceRows.filter(r=>finite(r.registered_at)&&Number(r.registered_at)+7*DAY<=asOf+1);
   const engaged=field=>sevenDay.filter(r=>finite(r[field])&&Number(r[field])>=Number(r.registered_at)&&
    Number(r[field])<Number(r.registered_at)+7*DAY&&Number(r[field])<=asOf).length;
   return {source,users:sourceRows.length,
    activation:{eligible:oneDay.length,activated:activated.length,
     pending:sourceRows.length-oneDay.length,
     rate:oneDay.length?activated.length/oneDay.length:null},
    engagement:{eligible:sevenDay.length,pending:sourceRows.length-sevenDay.length,
     chip_analysis_users:engaged('first_chip_at'),
     holder_view_users:engaged('first_holder_at'),
     strategy_started_users:engaged('first_strategy_at'),
     signal_view_users:engaged('first_signal_at'),
     repeat_analysis_users:engaged('first_repeat_chip_at')}}
  });
 })():null;
 const cohort=rows.filter(r=>finite(r.first_chip_at)&&r.first_chip_at>=start&&r.first_chip_at<end)
 const mature=cohort.filter(r=>r.first_chip_at+7*DAY<=asOf+1)
 const matureIds=new Set(mature.map(r=>r.user_key))
 const repeats=[['other_day','首次分析后7天内另日分析','first_later_day_at'],['after_24h','首次分析后24小时至7天内再分析','first_after_24h_at']].map(([id,label,field])=>{
  const valid=r=>finite(r[field])&&Number(r[field])>r.first_chip_at&&Number(r[field])<r.first_chip_at+7*DAY&&Number(r[field])<=asOf&&(id==='other_day'?Math.floor((Number(r[field])+OFFSET)/DAY)>Math.floor((r.first_chip_at+OFFSET)/DAY):Number(r[field])>=r.first_chip_at+DAY)
  const returned=mature.filter(valid),pending=cohort.filter(r=>!matureIds.has(r.user_key)),key='cohort:repeat:'+id
  return {id,label,users:put(key+':users',cohort),eligible:put(key+':eligible',mature),returned:put(key+':returned',returned),pending:put(key+':pending',pending),observed_returned:put(key+':observed_returned',cohort.filter(valid)),rate:mature.length?returned.length/mature.length:null,list_key:key,window_days:7}
 })
 return {observed,registration:{available:registration.available,error:registration.error||null,scope:registration.scope||'all',metrics:registered,engagement,bySource},repeats,definition:'分析沿用筹码查看/下钻观测口径；注册批次按账号创建时间，包含未观测事件账号。24小时激活窗口左闭右开。复访从首次观测分析起168小时内，另日按UTC+7；满168小时才进入复访率分母。日期成熟不等于采集完整。'}
}
module.exports={growthCohorts}
