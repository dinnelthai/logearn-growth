const remote = require('./hologres')
const {ANALYSIS_SQL} = require('./analysisUsers')
const DAY = 86400000

// Compact user facts only. Raw payloads and credentials never enter the job result.
async function growthFacts(s, {start, end, source = 'all'}, audience) {
  const asOf = Date.parse(s.as_of), effectiveEnd = Math.min(end, asOf + 1)
  const previousStart = start - (effectiveEnd - start)
  const params = [s.snapshot_cutoff, start, effectiveEnd, asOf, source, audience, previousStart]
  const rows = await remote.query(`${remote.eventsCte()}, baseline AS (
    SELECT e.user_key, MIN(e.client_ts) AS first_seen_at,
      MIN(e.client_ts) FILTER(WHERE e.event_name='page_viewed') AS first_page_at,
      MIN(e.client_ts) FILTER(WHERE e.event_name IN(${ANALYSIS_SQL})) AS first_chip_at,
      COALESCE(NULLIF(BTRIM(f.source),''),'未知') AS source,
      (ARRAY_AGG(NULLIF(BTRIM(e.device),'') ORDER BY e.client_ts,e.event_id)
        FILTER(WHERE e.event_name IN(${ANALYSIS_SQL}) AND NULLIF(BTRIM(e.device),'') IS NOT NULL))[1] AS device,
      (ARRAY_AGG(NULLIF(BTRIM(e.app_version),'') ORDER BY e.client_ts,e.event_id)
        FILTER(WHERE e.event_name IN(${ANALYSIS_SQL}) AND NULLIF(BTRIM(e.app_version),'') IS NOT NULL))[1] AS app_version
    FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts<=$4
      AND ($5::text='all' OR COALESCE(NULLIF(BTRIM(f.source),''),'未知')=$5)
      AND ($6::text[] IS NULL OR e.user_key=ANY($6))
    GROUP BY e.user_key,f.source
  ) SELECT b.*,
    BOOL_OR(e.event_name IN(${ANALYSIS_SQL}) AND e.client_ts>=$2 AND e.client_ts<$3) AS current_active,
    BOOL_OR(e.event_name IN(${ANALYSIS_SQL}) AND e.client_ts>=$7 AND e.client_ts<$2) AS previous_active,
    ARRAY_AGG(DISTINCT FLOOR((e.client_ts+25200000)/86400000)::integer)
      FILTER(WHERE e.event_name IN(${ANALYSIS_SQL})) AS chip_days,
    COUNT(DISTINCT FLOOR(e.client_ts/3600000)) FILTER(WHERE e.event_name IN(${ANALYSIS_SQL})
      AND e.client_ts>=b.first_chip_at AND e.client_ts<b.first_chip_at+86400000) AS first_day_hours,
    BOOL_OR(e.event_name='strategy_started' AND e.client_ts>=b.first_chip_at
      AND e.client_ts<b.first_chip_at+86400000) AS first_day_strategy,
    MIN(e.client_ts) FILTER(WHERE e.event_name IN(${ANALYSIS_SQL})
      AND FLOOR((e.client_ts+25200000)/86400000)>FLOOR((b.first_chip_at+25200000)/86400000)) AS first_later_day_at,
    MIN(e.client_ts) FILTER(WHERE e.event_name IN(${ANALYSIS_SQL})
      AND e.client_ts>=b.first_chip_at+86400000) AS first_after_24h_at
    FROM e JOIN baseline b ON b.user_key=e.user_key WHERE e.client_ts<=$4
    GROUP BY b.user_key,b.first_seen_at,b.first_page_at,b.first_chip_at,b.source,b.device,b.app_version
    HAVING BOOL_OR(e.event_name IN(${ANALYSIS_SQL}) AND e.client_ts>=$7 AND e.client_ts<$3)
      OR (b.first_seen_at>=$2 AND b.first_seen_at<$3) OR (b.first_chip_at>=$2 AND b.first_chip_at<$3)
    ORDER BY b.user_key LIMIT 50001`, params)
  if (rows.length > 50000 || Buffer.byteLength(JSON.stringify(rows)) > 32 * 1024 * 1024)
    throw Object.assign(new Error('增长诊断事实超过预算，请缩小统计期或人群'), {status: 422})
  return rows.map(r => ({...r, first_seen_at:Number(r.first_seen_at),
    first_page_at:r.first_page_at == null ? null : Number(r.first_page_at),
    first_chip_at:r.first_chip_at == null ? null : Number(r.first_chip_at),
    first_later_day_at:r.first_later_day_at==null?null:Number(r.first_later_day_at),
    first_after_24h_at:r.first_after_24h_at==null?null:Number(r.first_after_24h_at),
    chip_days:(r.chip_days || []).map(Number), first_day_hours:Number(r.first_day_hours)}))
}

async function growthQuality(s, {start, end, source = 'all'}, audience) {
  const rows = await remote.query(`${remote.eventsCte()}
    SELECT e.event_name, COALESCE(NULLIF(e.properties->>'diagnostics_version',''),'未知') AS version,
      COUNT(*) AS events,
      COUNT(*) FILTER(WHERE e.user_key LIKE 'user:%') AS linked_events,
      COUNT(*) FILTER(WHERE NULLIF(BTRIM(f.source),'') IS NULL) AS missing_source_events,
      COUNT(*) FILTER(WHERE NULLIF(BTRIM(CASE
        WHEN e.event_name IN('analysis_requested','analysis_request_finished') THEN e.properties->>'analysis_request_id'
        WHEN e.event_name IN('login_attempt_started','login_attempt_finished') THEN e.properties->>'login_attempt_id'
        WHEN e.event_name IN('page_content_load_started','page_content_load_finished') THEN e.properties->>'page_load_id'
        ELSE 'not-required' END),'') IS NULL) AS missing_id_events,
      MIN(e.client_ts) AS first_at, MAX(e.client_ts) AS latest_at, MAX(e.server_ts) AS source_seen_at
    FROM e JOIN facts f ON f.user_key=e.user_key
    WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4
      AND ($5::text='all' OR COALESCE(NULLIF(BTRIM(f.source),''),'未知')=$5)
      AND ($6::text[] IS NULL OR e.user_key=ANY($6))
    GROUP BY e.event_name,COALESCE(NULLIF(e.properties->>'diagnostics_version',''),'未知')
    ORDER BY e.event_name,version LIMIT 2001`,
    [s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience])
  if(rows.length > 2000)throw Object.assign(new Error('采集版本分组超过预算，请缩小范围'),{status:422})
  return rows
}
async function cohortTrades(s,rows,{start,end}){
 const entrants=rows.filter(r=>r.first_seen_at>=start&&r.first_seen_at<Math.min(end,Date.parse(s.as_of)+1))
 const targets=entrants.filter(r=>/^user:[1-9]\d{0,19}$/.test(r.user_key)).map(r=>r.user_key.slice(5))
 if(!targets.length)return {trades:[],known:new Set(),error:null}
 if(targets.length>5000)return {trades:[],known:null,error:'渠道交易账号超过5000人预算，请缩小统计期'}
 try{
  const {tradeSql,budget}=require('./memberMetrics')
  const trades=budget(await remote.query(tradeSql(),[s.snapshot_cutoff,start,Date.parse(s.as_of)+1,targets]),150000,'渠道交易')
  const known=await remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($2::text[]) AND created_at<=$1::timestamptz',[s.snapshot_cutoff,targets])
  return {trades,known:new Set(known.map(r=>'user:'+r.account_id)),error:null}
 }catch(e){return {trades:[],known:null,error:e.status===422?e.message:'渠道交易事实暂不可用，未将缺失解释为零'}}
}
module.exports = {growthFacts, growthQuality, cohortTrades, DAY}
