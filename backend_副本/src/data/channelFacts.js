const remote=require('./hologres')
async function channelFacts(s,b,audience){
 const rows=await remote.query(`${remote.eventsCte()}, baseline AS (
 SELECT user_key,MIN(client_ts) AS first_seen_at,
 MIN(client_ts) FILTER(WHERE event_name='first_visit_captured') AS first_visit_at,
 (ARRAY_AGG(NULLIF(BTRIM(first_entry_source),'') ORDER BY client_ts,event_id) FILTER(WHERE NULLIF(BTRIM(first_entry_source),'') IS NOT NULL))[1] AS source,
 COUNT(DISTINCT NULLIF(BTRIM(first_entry_source),'')) AS source_versions
 FROM e WHERE client_ts<=$4 GROUP BY user_key
 ) SELECT e.user_key,e.date,b.first_seen_at,b.first_visit_at,COALESCE(b.source,'未知') AS source,b.source_versions,
 MAX(e.client_ts) AS last_seen_at,
 BOOL_OR(NULLIF(BTRIM(e.user_id),'') IS NOT NULL) AS logged,
 BOOL_OR(e.event_name='token_detail_viewed') AS token,
 BOOL_OR(e.event_name IN('chip_analysis_viewed','chip_analysis_drilldown')) AS analysis,
 BOOL_OR(e.event_name='strategy_started') AS strategy,
 BOOL_OR(e.event_name='trade_submitted') AS submitted,
 BOOL_OR(e.event_name='trade_succeeded') AS succeeded
 FROM e JOIN baseline b ON b.user_key=e.user_key WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4
 AND ($5::text='all' OR COALESCE(b.source,'未知')=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 GROUP BY e.user_key,e.date,b.first_seen_at,b.first_visit_at,b.source,b.source_versions
 ORDER BY e.date,e.user_key LIMIT 150001`,[s.snapshot_cutoff,b.start,b.end,Date.parse(s.as_of),b.source||'all',audience])
 if(rows.length>150000||Buffer.byteLength(JSON.stringify(rows))>48*1024*1024)throw Object.assign(new Error('渠道用户日记录超过预算，请缩小日期或来源'),{status:422})
 return rows.map(r=>({...r,first_seen_at:Number(r.first_seen_at),first_visit_at:r.first_visit_at==null?null:Number(r.first_visit_at),last_seen_at:Number(r.last_seen_at),source_versions:Number(r.source_versions)}))
}
module.exports={channelFacts}
