const DAY = 86400000, OFFSET = 25200000
const day = t => Math.floor((t + OFFSET) / DAY)
const inRange = (t, a, b) => t != null && t >= a && t < b
function validateGrowth(b) {
  if(!Number.isSafeInteger(b.start)||!Number.isSafeInteger(b.end)||b.start<0||b.end<=b.start||b.end-b.start>31*DAY)
    throw Object.assign(new Error('增长诊断支持有效的1–31天统计期'),{status:400})
  if(b.source!=null&&(typeof b.source!=='string'||b.source.length>200))throw Object.assign(new Error('来源无效'),{status:400})
}
function interval(n, total) {
  if(!total)return null
  const z=1.96,p=n/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d
  return [Math.max(0,c-h),Math.min(1,c+h)]
}
function growthInsights(rows, qualityRows, b, s, tradeFacts={known:null,trades:[],error:'交易事实尚未接入'}, evidence={}) {
  const asOf=Date.parse(s.as_of),end=Math.min(b.end,asOf+1),start=b.start
  if(end<=start)throw Object.assign(new Error('统计期尚未到达数据截至时间，请选择更早的日期'),{status:400})
  const previousStart=start-(end-start),lists={},members={}
  const put=(key,rs)=>{lists[key]=[...new Set(rs.map(r=>r.user_key))];return lists[key].length}
  for(const r of rows)members[r.user_key]={id:r.user_key,source:r.source||'未知'}
  const current=rows.filter(r=>r.current_active),previous=rows.filter(r=>r.previous_active)
  const fresh=current.filter(r=>inRange(r.first_chip_at,start,end))
  const resumed=current.filter(r=>!r.previous_active&&r.first_chip_at<start)
  const continuing=current.filter(r=>r.previous_active)
  const absent=previous.filter(r=>!r.current_active)
  const change={current:put('growth:current',current),previous:put('growth:previous',previous),
    fresh:put('growth:fresh',fresh),resumed:put('growth:resumed',resumed),continuing:put('growth:continuing',continuing),absent:put('growth:absent',absent)}
  change.delta=change.current-change.previous
  change.rate=change.previous?change.delta/change.previous:null
  change.actionable=put('growth:absent:registered',absent.filter(r=>/^user:[1-9]\d{0,19}$/.test(r.user_key)))
  const dimensionRows=dimension=>[...new Set(rows.filter(r=>r.current_active||r.previous_active).map(r=>r[dimension]||'未知'))].map((value,i)=>{
    const rs=rows.filter(r=>(r[dimension]||'未知')===value),prefix='growth:'+dimension+':'+i
    const a=put(prefix+':current',rs.filter(r=>r.current_active)),p=put(prefix+':previous',rs.filter(r=>r.previous_active))
    return {value,current:a,previous:p,delta:a-p,list_key:prefix}
  }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.value.localeCompare(b.value))
  function retention(rs,anchor,n,prefix){
    const eligible=rs.filter(r=>(day(r[anchor])+n+1)*DAY-OFFSET<=asOf+1),eligibleIds=new Set(eligible.map(r=>r.user_key))
    const returned=eligible.filter(r=>r.chip_days.includes(day(r[anchor])+n))
    return {eligible:put(prefix+':eligible',eligible),returned:put(prefix+':returned',returned),pending:put(prefix+':pending',rs.filter(r=>!eligibleIds.has(r.user_key))),
      rate:eligible.length?returned.length/eligible.length:null,interval:interval(returned.length,eligible.length),list_key:prefix}
  }
  const summarizeTradeCohort=(cohortRows,anchorOf,prefix,{registrationWindow=false}={})=>{
    const engaged=cohortRows.filter(r=>{
      const anchor=Number(anchorOf(r));
      return r.first_chip_at!=null&&Number.isFinite(Number(r.first_chip_at))&&
        Number.isFinite(anchor)&&Number(r.first_chip_at)>=anchor&&Number(r.first_chip_at)<=asOf&&
        (!registrationWindow||Number(r.first_chip_at)<anchor+7*DAY)
    });
    const mature=engaged.filter(r=>Number(r.first_chip_at)+7*DAY<=asOf+1);
    const matched=tradeFacts.known===null?[]:mature.filter(r=>tradeFacts.known.has(r.user_key));
    const traders=[];let volume=0,transactions=0,missingValues=0,excluded=0;
    for(const r of matched){
      let traded=false;const anchor=Number(r.first_chip_at);
      for(const t of tradesByUser.get(r.user_key)||[]){
        const at=Date.parse(t.transaction_time);
        if(!inRange(at,anchor,anchor+7*DAY))continue;
        if(!t.valid||!t.transaction_hash||t.chain==null){excluded++;continue}
        traded=true;transactions++;
        const amount=t.trade_value==null?null:Number(t.trade_value);
        if(amount==null||!Number.isFinite(amount))missingValues++;else volume+=Math.abs(amount);
      }
      if(traded)traders.push(r);
    }
    const available=tradeFacts.known!==null;
    return {
      available,error:tradeFacts.error,association:'user-level-after-first-analysis',
      engaged:put(prefix+':engaged',engaged),
      eligible:available?put(prefix+':eligible',matched):null,
      unmatched:available?mature.length-matched.length:null,
      pending:engaged.length-mature.length,
      not_engaged:cohortRows.length-engaged.length,
      traders:available?put(prefix+':traders',traders):null,
      conversion_rate:available&&matched.length?traders.length/matched.length:null,
      transactions:available?transactions:null,
      volume_usd:!available||!matched.length||missingValues>0||excluded>0?null:volume,
      missing_values:available?missingValues:null,
      excluded_trades:available?excluded:null,
      list_key:prefix
    };
  };
  const entrants=rows.filter(r=>inRange(r.first_seen_at,start,end)),tradesByUser=new Map()
  for(const t of tradeFacts.trades){const id='user:'+t.account_id;if(!tradesByUser.has(id))tradesByUser.set(id,[]);tradesByUser.get(id).push(t)}
  const channels=[...new Set(entrants.map(r=>r.source||'未知'))].map((source,i)=>{
    const rs=entrants.filter(r=>(r.source||'未知')===source),key='quality:source:'+i
    const mature=rs.filter(r=>r.first_seen_at+DAY<=asOf+1)
    const activated=mature.filter(r=>r.first_chip_at!=null&&r.first_chip_at>=r.first_seen_at&&r.first_chip_at<r.first_seen_at+DAY)
    const latencies=activated.map(r=>r.first_chip_at-r.first_seen_at).sort((a,b)=>a-b)
    const trade=summarizeTradeCohort(rs,r=>r.first_seen_at,key+':trade')
    return {source,users:put(key+':users',rs),eligible:put(key+':eligible',mature),activated:put(key+':activated',activated),pending:rs.length-mature.length,trade,
      activation_rate:mature.length?activated.length/mature.length:null,activation_interval:interval(activated.length,mature.length),
      median_ms:latencies.length?latencies[Math.floor((latencies.length-1)/2)]:null,
      d7:retention(rs,'first_seen_at',7,key+':d7'),d30:retention(rs,'first_seen_at',30,key+':d30'),list_key:key}
  }).sort((a,b)=>b.users-a.users||a.source.localeCompare(b.source))
  const cohort=rows.filter(r=>inRange(r.first_chip_at,start,end))
  const associations=[
    ['strategy','首24小时启动策略',r=>r.first_day_strategy===true],
    ['hours','首24小时至少3个小时观测到分析',r=>r.first_day_hours>=3],
    ['fast','首次观测后5分钟内分析',r=>r.first_chip_at-r.first_seen_at<=300000],
  ].map(([id,label,predicate])=>({id,label,groups:[true,false].map(yes=>{
    const rs=cohort.filter(r=>predicate(r)===yes),key='association:'+id+':'+yes
    return {label:yes?'满足条件':'未满足条件',users:put(key+':users',rs),list_key:key,d7:retention(rs,'first_chip_at',7,key+':d7')}
  })}))
  const families=[['analysis','分析请求','analysis_requested','analysis_request_finished'],['login','登录尝试','login_attempt_started','login_attempt_finished'],['page_load','页面加载','page_content_load_started','page_content_load_finished']].map(([key,label,a,z])=>{
    const selected=qualityRows.filter(r=>r.event_name===a||r.event_name===z),count=name=>selected.filter(r=>r.event_name===name).reduce((n,r)=>n+Number(r.events),0)
    return {key,label,started_events:count(a),finished_events:count(z),missing_id_events:selected.reduce((n,r)=>n+Number(r.missing_id_events),0),available:selected.length>0}
  })
  const registration=evidence.registration||{available:false,rows:[],error:'该结果未包含注册事实'}
  for(const r of registration.rows)if(!members[r.user_key])members[r.user_key]={id:r.user_key,source:r.source||'未知'}
  const cohorts=require('./growthCohorts').growthCohorts(rows,registration,{start,end,asOf},put)
  if(registration.available)cohorts.registration.trade=summarizeTradeCohort(
    registration.rows,r=>r.registered_at,'cohort:registered:trade',{registrationWindow:true})
  const coverage=evidence.coverage||{available:false,rows:[]}
  for(const f of families){const row=coverage.rows.find(r=>r.scope==='family'&&r.family===f.key);f.users=coverage.available?(row?.users||0):null}
  const events=qualityRows.reduce((n,r)=>n+Number(r.events),0),linked=qualityRows.reduce((n,r)=>n+Number(r.linked_events),0),missingSource=qualityRows.reduce((n,r)=>n+Number(r.missing_source_events),0)
  const quality={events,linked_events:linked,linked_rate:events?linked/events:null,missing_source_events:missingSource,source_rate:events?(events-missingSource)/events:null,
    history_complete:s.history_complete===true,events_complete_through:s.events_complete_through||null,latest_event_at:s.latest_event_at||s.as_of,source_seen_at:s.source_seen_at||null,
    snapshot_cutoff:s.snapshot_cutoff,lag_ms:Math.max(0,Date.parse(s.snapshot_cutoff)-Date.parse(s.latest_event_at||s.as_of)),
    truncated:false,families,diagnostic_coverage:{...coverage,definition:'当前窗口内诊断事件的去重用户数；设备/应用/诊断版本间用户可重叠，不能相加。不是全站覆盖率或部署证明。'},versions:qualityRows.filter(r=>r.version!=='未知').map(r=>({event_name:r.event_name,version:r.version,events:Number(r.events),first_at:Number(r.first_at),latest_at:Number(r.latest_at)}))}
  return {lists,members,payload:{start,end,requested_end:b.end,previous_start:previousStart,previous_end:start,as_of:asOf,source:b.source||'all',change,
    dimensions:{source:dimensionRows('source'),device:dimensionRows('device'),app_version:dimensionRows('app_version')},channels,associations,cohorts,quality,
    candidate_count:rows.length,truncated:false,user_pool:'observed_growth_users',definition:'北极星沿用筹码查看或下钻的观测口径。两期按相同时长比较；新增与重新活跃减去本期未观测回访等于人数变化。历史及连续采集覆盖未确认，不能确认真实流失或因果。来源、设备、版本分别拆分，跨维度不相加；设备和版本为首次分析时最早非空观测值。'}}
}
module.exports={growthInsights,validateGrowth,interval}
