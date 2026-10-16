const remote = require('./hologres')
const {ANALYSIS_SQL} = require('./analysisUsers')
const {computeMyMonitor} = require('../analytics/myMonitor')
function monitorSql(cte) {
 return `${cte}, monitor_events AS (SELECT * FROM e WHERE client_ts > 0 AND client_ts <= $4), monitor_users AS (
 SELECT user_key AS id, MIN(client_ts) AS first_seen,
 MIN(client_ts) FILTER (WHERE event_name='page_viewed') AS first_page,
 MIN(client_ts) FILTER (WHERE event_name IN (${ANALYSIS_SQL})) AS first_chip,
 MIN(client_ts) FILTER (WHERE event_name='login_succeeded' AND NULLIF(BTRIM(user_id),'') IS NOT NULL) AS first_login,
 MIN(client_ts) FILTER (WHERE event_name='login_succeeded' AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND properties->>'login_type'='manual') AS first_manual_login,
 MAX(CASE WHEN event_name='login_button_clicked' THEN 1 ELSE 0 END) AS has_start,
 MAX(CASE WHEN event_name='free_trial_started' AND NULLIF(BTRIM(user_id),'') IS NOT NULL THEN 1 ELSE 0 END) AS has_trial,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='page_viewed' AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS pages,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='login_succeeded' AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS logins,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='login_succeeded' AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND properties->>'login_type'='manual' AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS manual_logins,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='login_succeeded' AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND properties->>'login_type'='auto_restore' AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS auto_logins,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='login_succeeded' AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND COALESCE(properties->>'login_type','') NOT IN ('manual','auto_restore') AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS unknown_logins,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='login_button_clicked' AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS starts,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name='free_trial_started' AND NULLIF(BTRIM(user_id),'') IS NOT NULL AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS trials,
 ARRAY_AGG(client_ts) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND client_ts >= $2 AND client_ts < $3::bigint+691200000) AS analyses
 FROM monitor_events GROUP BY user_key
 ) SELECT * FROM monitor_users LIMIT 80001`
}
async function myMonitor(s, {start,end}) {
 const asOf = Date.parse(s.as_of)
 const rows = await remote.query(monitorSql(remote.eventsCte()),[s.snapshot_cutoff,start,end,asOf])
 if(rows.length>80000)throw Object.assign(new Error('监控用户超过分析上限'),{status:422})
 const records=rows.map(r=>({...r,...Object.fromEntries(['first_seen','first_page','first_chip','first_login','first_manual_login'].map(k=>[k,r[k]==null?null:Number(r[k])])),...Object.fromEntries(['pages','logins','manual_logins','auto_logins','unknown_logins','starts','trials','analyses'].map(k=>[k,(r[k]||[]).map(Number)]))}))
 const availability={pages:records.some(r=>r.first_page!=null),login:records.some(r=>r.first_login!=null),manual_login:records.some(r=>r.first_manual_login!=null),starts:records.some(r=>Number(r.has_start)>0),trial:records.some(r=>Number(r.has_trial)>0),analysis:records.some(r=>r.first_chip!=null)}
 return computeMyMonitor(records,{start,end,asOf,availability})
}
module.exports={myMonitor,monitorSql}
