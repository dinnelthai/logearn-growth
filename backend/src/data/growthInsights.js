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
function cohortTradeSql(){
 const scope=[
  'SELECT DISTINCT t.user_id',
  'FROM public.trading_transaction t',
  'LEFT JOIN public.user_account ua ON ua.id=t.user_id AND ua.created_time<=$1::timestamptz',
  "LEFT JOIN wallet_map wm ON wm.address=CASE WHEN ua.login_address ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(ua.login_address) ELSE ua.login_address END",
  'LEFT JOIN public.account_v2 av ON av.account_id=t.user_id AND av.created_at<=$1::timestamptz',
  'JOIN UNNEST($5::text[],$6::double precision[],$7::double precision[]) AS win(account_id,window_start,window_end)',
  ' ON win.account_id=(CASE WHEN ua.id IS NOT NULL THEN wm.account_id ELSE av.account_id END)::text',
  ' AND t.transaction_time>=TO_TIMESTAMP(win.window_start/1000.0)',
  ' AND t.transaction_time<TO_TIMESTAMP(win.window_end/1000.0)',
  'WHERE t.created_time<=$1::timestamptz AND t.transaction_time<=$1::timestamptz',
  ' AND t.transaction_time>=TO_TIMESTAMP($2::double precision/1000)',
  ' AND t.transaction_time<TO_TIMESTAMP($3::double precision/1000)',
  ' AND (CASE WHEN ua.id IS NOT NULL THEN wm.account_id ELSE av.account_id END)::text=ANY($4::text[])'
 ].join('\n');
 const {tradeIdentityCte}=require('./tradeIdentity');
 const groups=[
  'trade_groups AS (',
  ' SELECT t.chain,t.transaction_hash,MIN(t.user_id) AS user_id,',
  '  MIN(t.transaction_time) AS transaction_time,MIN(t.trade_value) AS trade_value,',
  '  COUNT(DISTINCT t.user_id)=1 AND COUNT(DISTINCT t.transaction_time)=1',
  '   AND COUNT(DISTINCT t.trade_value)<=1',
  '   AND (COUNT(t.trade_value)=0 OR COUNT(t.trade_value)=COUNT(*)) AS valid',
  ' FROM public.trading_transaction t JOIN valid_map v ON v.user_id=t.user_id',
  ' JOIN UNNEST($5::text[],$6::double precision[],$7::double precision[])',
  '  AS win(account_id,window_start,window_end)',
  '  ON win.account_id=v.account_id::text',
  '  AND t.transaction_time>=TO_TIMESTAMP(win.window_start/1000.0)',
  '  AND t.transaction_time<TO_TIMESTAMP(win.window_end/1000.0)',
  ' WHERE t.created_time<=$1::timestamptz AND t.transaction_time<=$1::timestamptz',
  '  AND t.transaction_time>=TO_TIMESTAMP($2::double precision/1000)',
  '  AND t.transaction_time<TO_TIMESTAMP($3::double precision/1000)',
  '  AND v.account_id::text=ANY($4::text[])',
  "  AND NULLIF(BTRIM(t.transaction_hash),'') IS NOT NULL",
  ' GROUP BY t.chain,t.transaction_hash',
  ') SELECT t.*,v.account_id::text AS account_id',
  ' FROM trade_groups t JOIN valid_map v ON v.user_id=t.user_id',
  ' ORDER BY t.transaction_time DESC,t.transaction_hash LIMIT 20001'
 ].join('\n');
 return tradeIdentityCte(scope)+', '+groups;
}
async function cohortTrades(s,rows,{start,end}){
 const asOf=Date.parse(s.as_of),effectiveEnd=Math.min(end,asOf+1);
 const entrants=rows.filter(r=>r.first_seen_at>=start&&r.first_seen_at<effectiveEnd);
 const activated=entrants.filter(r=>Number.isFinite(Number(r.first_chip_at))&&Number(r.first_chip_at)>=Number(r.first_seen_at)&&Number(r.first_chip_at)<=asOf);
 const mature=activated.filter(r=>Number(r.first_chip_at)+7*DAY<=asOf+1);
 const windows=mature.filter(r=>/^user:[1-9]\d{0,19}$/.test(r.user_key)).map(r=>({accountId:r.user_key.slice(5),start:Number(r.first_chip_at),end:Number(r.first_chip_at)+7*DAY}));
 const targets=[...new Set(windows.map(w=>w.accountId))];
 if(!targets.length)return {trades:[],known:new Set(),error:null,windows:0,association:'user-level-after-first-analysis'};
 if(windows.length>5000)return {trades:[],known:null,error:'成熟首次分析用户超过5000人预算，结果未知',windows:windows.length};
 try{
  const {budget}=require('./memberMetrics');
  const minStart=Math.min(...windows.map(w=>w.start)),maxEnd=Math.min(Math.max(...windows.map(w=>w.end)),asOf+1);
  const params=[s.snapshot_cutoff,minStart,maxEnd,targets,windows.map(w=>w.accountId),windows.map(w=>w.start),windows.map(w=>w.end)];
  const [trades,known]=await Promise.all([
   remote.query(cohortTradeSql(),params).then(r=>budget(r,20000,'首次分析后交易记录')),
   remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($2::text[]) AND created_at<=$1::timestamptz',[s.snapshot_cutoff,targets])
  ]);
  return {trades,known:new Set(known.map(r=>'user:'+r.account_id)),error:null,windows:windows.length,association:'user-level-after-first-analysis'};
 }catch(e){
  return {trades:[],known:null,error:e.status===422?e.message:'首次分析后交易事实暂不可用，未将缺失解释为零',windows:windows.length,association:'user-level-after-first-analysis'};
 }
}
module.exports = {growthFacts, growthQuality, cohortTrades, cohortTradeSql, DAY}
