const remote = require('./hologres')
const {userFactsCte}=require('./userFacts')
const {internalType, rawNamesForTypes} = require('../analytics/eventMap')
const MAX_ROWS = Number(process.env.REMOTE_MAX_EVENT_ROWS || 150000)
async function loadUsers(s, {types, start, end, source = 'all', audience = null}) {
  const raws = rawNamesForTypes(types), login = types.includes('logged_in_visit')
  const rows = await remote.query(`${remote.eventsCte()}
    SELECT e.user_key,e.user_id,e.event_name,e.client_ts,e.session_id,e.lang,
      f.first_chip,f.source,COALESCE(e.properties->>'chain',e.chain) AS chain,
      e.properties->>'token_visit_id' AS token_visit_id,e.properties->>'token_address' AS token_address,
      e.properties->>'strategy_run_id' AS strategy_run_id,e.properties->>'strategy_type' AS strategy_type,
      e.properties->>'result_id' AS result_id,e.properties->>'module' AS module,
      e.properties->>'entry_module' AS entry_module,e.properties->>'trade_id' AS trade_id,
      e.properties->>'trade_attempt_id' AS trade_attempt_id,e.properties->>'reason' AS reason
    FROM e JOIN facts f ON f.user_key=e.user_key
    WHERE e.client_ts >= $2 AND e.client_ts < $3 AND e.client_ts <= $4
      AND ($5::text='all' OR f.source=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
      AND (e.event_name=ANY($7::text[]) OR ($8 AND NULLIF(BTRIM(e.user_id),'') IS NOT NULL))
    ORDER BY e.user_key,e.client_ts,e.event_id LIMIT $9`,
    [s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience,raws,login,MAX_ROWS+1])
  if(rows.length>MAX_ROWS) throw Object.assign(new Error('相关事件超过分析上限，请缩小日期或人群范围'),{status:422})
  if(Buffer.byteLength(JSON.stringify(rows))>48*1024*1024) throw Object.assign(new Error('分析数据超过内存预算，请缩小范围'),{status:422})
  const users = new Map()
  for(const r of rows){
    let u=users.get(r.user_key)
    if(!u){u={id:r.user_key,source:r.source||'未知',first_analysis_at:r.first_chip==null?null:Number(r.first_chip),
      preferred_language:null,telegram_bound:null,email_bound:null,events:[]};users.set(r.user_key,u)}
    const e={type:internalType(r.event_name,{module:r.module}),t:Number(r.client_ts),session_id:r.session_id,
      token_visit_id:r.token_visit_id,token_address:r.token_address,chain:r.chain,strategy_run_id:r.strategy_run_id,
      strategy:r.strategy_type,result_id:r.result_id,entry_module:r.entry_module,entry_source:u.source,
      trade_id:r.trade_id,trade_attempt_id:r.trade_attempt_id,reason:r.reason}
    if(e.type&&types.includes(e.type))u.events.push(e)
    if(types.includes('login_verified')&&r.user_id?.trim()&&rawNamesForTypes(['login_verified']).includes(r.event_name))u.events.push({...e,type:'login_verified'})
    if(login&&typeof r.user_id==='string'&&r.user_id.trim())u.events.push({...e,type:'logged_in_visit'})
  }
  return [...users.values()]
}
async function features(s,source='all',audience=null,period=null){
  const start=period?.start??0,end=period?.end??Date.parse(s.snapshot_cutoff)+1
  const rows=await remote.query(`${remote.eventsCte()}${userFactsCte(true)}, grouped AS(
    SELECT e.user_key,
      (ARRAY_AGG(e.first_entry_source ORDER BY e.client_ts,e.event_id) FILTER(WHERE e.first_entry_source IS NOT NULL))[1] AS first_source,
      MIN(e.client_ts) AS first_observed_at, MAX(e.client_ts) AS last_observed_at,
      MIN(e.client_ts) FILTER(WHERE event_name IN('chip_analysis_viewed','chip_analysis_drilldown')) AS first_chip_at,
      MAX(e.client_ts) FILTER(WHERE event_name IN('chip_analysis_viewed','chip_analysis_drilldown')) AS last_chip_at,
      COUNT(DISTINCT FLOOR((e.client_ts+25200000)/86400000.0)) FILTER(WHERE event_name IN('chip_analysis_viewed','chip_analysis_drilldown') AND e.client_ts >= $2-2419200000) AS chip_days_28,
      ARRAY_AGG(e.client_ts ORDER BY e.client_ts) FILTER(WHERE event_name IN('chip_analysis_viewed','chip_analysis_drilldown')) AS chip_times,
      COUNT(DISTINCT properties->>'strategy_type') FILTER(WHERE event_name='strategy_started') AS ai_strategies_all,
      COUNT(DISTINCT properties->>'strategy_type') FILTER(WHERE event_name='strategy_started' AND e.client_ts >= $2-2419200000) AS ai_strategies_28,
      BOOL_OR(event_name='strategy_started') AS used_strategy,
      MAX(e.client_ts) FILTER(WHERE event_name='strategy_started') AS last_strategy_at,
      COUNT(DISTINCT FLOOR((e.client_ts+25200000)/86400000.0)) FILTER(WHERE event_name IN('chip_analysis_viewed','chip_analysis_drilldown') AND e.client_ts >= $5 AND e.client_ts < $6) AS analysis_days_period,
      BOOL_OR(e.client_ts >= $5 AND e.client_ts < $6 AND NULLIF(BTRIM(e.user_id),'') IS NOT NULL) AS login_period,
      BOOL_OR(e.client_ts >= $5 AND e.client_ts < $6 AND event_name='strategy_started') AS strategy_period
    FROM e WHERE user_key LIKE 'user:%' AND e.client_ts <= $2
    AND ($4::text[] IS NULL OR e.user_key=ANY($4)) GROUP BY e.user_key)
    SELECT p.*,g.first_observed_at,g.last_observed_at,g.first_chip_at,g.last_chip_at,g.chip_days_28,g.chip_times,
      g.ai_strategies_all,g.ai_strategies_28,g.used_strategy,g.last_strategy_at,g.analysis_days_period,g.login_period,g.strategy_period
    FROM product_users p LEFT JOIN grouped g ON p.user_key=g.user_key
    WHERE ($3::text='all' OR p.source=$3) AND ($4::text[] IS NULL OR p.user_key=ANY($4)) LIMIT 80001`,
    [s.snapshot_cutoff,Date.parse(s.as_of),source,audience,start,end])
  if(rows.length>80000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)throw Object.assign(new Error('用户特征超过预算，请缩小人群'),{status:422})
  return rows.map(({chip_times,...r})=>{
    const times=(chip_times||[]).map(Number),recent=Date.parse(s.as_of)-2419200000
    const returned_28=times.some((t,i)=>i>0&&t>=recent&&t-times[i-1]>=2419200000)
    return {...r,first_observed_at:r.first_observed_at==null?null:Number(r.first_observed_at),last_observed_at:r.last_observed_at==null?null:Number(r.last_observed_at),analysis_returned_d1:times.length>0&&times.some(t=>Math.floor((t+25200000)/86400000)===Math.floor((times[0]+25200000)/86400000)+1),returned_28,referred_analysis_period:r.invitation_at!=null&&times.some(t=>t>=Math.max(start,Date.parse(r.invitation_at))&&t<end),created_at:r.created_at==null?null:Date.parse(r.created_at),
      last_login_at:r.last_login_at==null?null:Date.parse(r.last_login_at),invitation_at:r.invitation_at==null?null:Date.parse(r.invitation_at),
      balance_updated_at:r.balance_updated_at==null?null:Date.parse(r.balance_updated_at),
      nft_count:r.nft_count==null?null:Number(r.nft_count),available_points:r.available_points==null?null:Number(r.available_points),
      last_strategy_at:r.last_strategy_at==null?null:Number(r.last_strategy_at),identity_count:Number(r.identity_count),trade_count:Number(r.trade_count),trade_count_period:Number(r.trade_count_period),analysis_days_period:Number(r.analysis_days_period),telegram_bound:r.telegram_bound==null?null:Number(r.telegram_bound),email_bound:r.email_bound==null?null:Number(r.email_bound),preferred_language:null,
      first_chip_at:r.first_chip_at==null?null:Number(r.first_chip_at),last_chip_at:r.last_chip_at==null?null:Number(r.last_chip_at),
      chip_days_28:Number(r.chip_days_28),ai_strategies_all:Number(r.ai_strategies_all),ai_strategies_28:Number(r.ai_strategies_28)}
  })
}
module.exports={loadUsers,features}

function eventCondition(type, namesParam) {
  if(type==='daily_visit')return "e.user_key IS NOT NULL"
  if(type==='daily_visit')return "e.user_key IS NOT NULL";if(type==='logged_in_visit')return "NULLIF(BTRIM(e.user_id),'') IS NOT NULL"
  if(type==='login_verified')return `e.event_name=ANY($${namesParam}::text[]) AND NULLIF(BTRIM(e.user_id),'') IS NOT NULL`
  const moduleTypes=['callouts','signals','popular','fomo']
  if(moduleTypes.includes(type))return `e.event_name=ANY($${namesParam}::text[]) AND e.properties->>'module'='${type}'`
  return `e.event_name=ANY($${namesParam}::text[])`
}
async function retentionUsers(s,{initial='chip',returning='chip',start,end,source='all',audience=null}){
  const rows=await remote.query(`${remote.eventsCte()}, grouped AS(
    SELECT e.user_key,
      (ARRAY_AGG(e.first_entry_source ORDER BY e.client_ts,e.event_id) FILTER(WHERE e.first_entry_source IS NOT NULL))[1] AS source,
      MIN(e.client_ts) FILTER(WHERE ${eventCondition(initial,7)}) AS first_t,
      ARRAY_AGG(DISTINCT FLOOR((e.client_ts+25200000)/86400000.0)::bigint)
        FILTER(WHERE e.client_ts >= $2 AND (${eventCondition(returning,8)})) AS days
    FROM e WHERE e.client_ts <= $4 AND $7::text[] IS NOT NULL AND $8::text[] IS NOT NULL
      AND ($6::text[] IS NULL OR e.user_key=ANY($6)) GROUP BY e.user_key)
    SELECT * FROM grouped WHERE first_t >= $2 AND first_t < $3 AND ($5::text='all' OR source=$5) LIMIT 80001`,
    [s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience,rawNamesForTypes([initial]),rawNamesForTypes([returning])])
  if(rows.length>80000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)throw Object.assign(new Error('留存数据超过预算，请缩小范围'),{status:422})
  return rows.map(r=>({id:r.user_key,source:r.source||'未知',first_analysis_at:initial==='chip'?Number(r.first_t):null,
    events:[{type:initial,t:Number(r.first_t),entry_source:r.source},...(r.days||[]).map(d=>({type:returning,t:Number(d)*86400000-25200000}))]}))
}
module.exports.retentionUsers=retentionUsers

async function orderedFunnelUsers(s,body,audience=null){
  const steps=body.steps,asOf=Date.parse(s.as_of),window=(Number(body.hours)||24)*3600000
  const params=[s.snapshot_cutoff,body.start,body.end,asOf,body.source||'all',audience,window,body.strategy||'all']
  function condition(type){if(type==='daily_visit')return "e.user_key IS NOT NULL";if(type==='logged_in_visit')return "NULLIF(BTRIM(e.user_id),'') IS NOT NULL";params.push(rawNamesForTypes([type]));
    return '('+eventCondition(type,params.length)+')'+(type==='ai'?" AND ($8::text='all' OR e.properties->>'strategy_type'=$8)":'')}
  const columns=steps.map((type,i)=>`ARRAY_AGG(e.client_ts ORDER BY e.client_ts) FILTER(WHERE e.client_ts >= $2
    AND e.client_ts < $3::bigint+$7::bigint AND e.client_ts <= $4 AND ${condition(type)}) AS step${i}`)
  const rows=await remote.query(`${remote.eventsCte()}, grouped AS(
    SELECT e.user_key,
      (ARRAY_AGG(e.first_entry_source ORDER BY e.client_ts,e.event_id) FILTER(WHERE e.first_entry_source IS NOT NULL))[1] AS source,
      ${columns.join(',')} FROM e WHERE $8::text IS NOT NULL AND e.client_ts <= $4
      AND ($6::text[] IS NULL OR e.user_key=ANY($6)) GROUP BY e.user_key)
    SELECT * FROM grouped WHERE step0 IS NOT NULL AND step0[1] < $3::bigint AND ($5::text='all' OR source=$5) LIMIT 80001`,params)
  if(rows.length>80000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)
    throw Object.assign(new Error('漏斗数据超出预算，请缩小范围'),{status:422})
  const users=[]
  for(const r of rows){
    const first=(r.step0||[]).map(Number).find(t=>t>=body.start&&t<body.end)
    if(first==null)continue
    const times=[first]
    for(let i=1;i<steps.length;i++){
      const next=(r['step'+i]||[]).map(Number).find(t=>(['daily_visit','logged_in_visit','login_verified'].includes(steps[i-1])?t>=times.at(-1):t>times.at(-1))&&t<=first+window)
      if(next==null)break;times.push(next)
    }
    users.push({id:r.user_key,source:r.source||'未知',events:times.map((t,i)=>({type:steps[i],t,
      strategy:body.strategy==='all'?null:body.strategy,entry_source:r.source||'未知'}))})
  }
  return users
}
module.exports.orderedFunnelUsers=orderedFunnelUsers
