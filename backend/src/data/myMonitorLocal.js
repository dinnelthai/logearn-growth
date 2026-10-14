const {computeMyMonitor}=require('../analytics/myMonitor')
const {TYPE_TO_RAWS}=require('../analytics/eventMap')
function myMonitorLocal(db,{start,end,asOf,historyComplete=false}) {
 const raws=TYPE_TO_RAWS.chip.map(n=>`'${n}'`).join(',')
 const sql=`WITH identities AS (
 SELECT anonymous_id,MIN(user_id) AS linked_user FROM events
 WHERE client_ts<=? AND NULLIF(TRIM(user_id),'') IS NOT NULL AND NULLIF(TRIM(anonymous_id),'') IS NOT NULL
 GROUP BY anonymous_id HAVING COUNT(DISTINCT user_id)=1
 ), ranked AS (
 SELECT e.*,ROW_NUMBER() OVER(PARTITION BY event_id ORDER BY server_ts) AS rn FROM events e WHERE client_ts>0 AND client_ts<=?
 ), clean AS (
 SELECT r.*,CASE WHEN NULLIF(TRIM(r.user_id),'') IS NOT NULL THEN 'user:'||r.user_id WHEN i.linked_user IS NOT NULL THEN 'user:'||i.linked_user ELSE 'anonymous:'||r.anonymous_id END AS user_key
 FROM ranked r LEFT JOIN identities i ON i.anonymous_id=r.anonymous_id
 WHERE rn=1 AND NULLIF(TRIM(event_id),'') IS NOT NULL AND (NULLIF(TRIM(r.user_id),'') IS NOT NULL OR NULLIF(TRIM(r.anonymous_id),'') IS NOT NULL)
 AND SUBSTR(TRIM(COALESCE(NULLIF(TRIM(r.user_id),''),i.linked_user,'')),1,4)<>'acc_'
 AND NOT(NULLIF(TRIM(r.user_id),'') IS NULL AND EXISTS(SELECT 1 FROM ranked dirty WHERE dirty.anonymous_id=r.anonymous_id AND SUBSTR(TRIM(dirty.user_id),1,4)='acc_'))
 ) SELECT user_key AS id,MIN(client_ts) AS first_seen,
 MIN(client_ts) FILTER(WHERE event_name='page_viewed') AS first_page,
 MIN(client_ts) FILTER(WHERE event_name IN (${raws})) AS first_chip,
 MIN(client_ts) FILTER(WHERE event_name='login_succeeded' AND NULLIF(TRIM(user_id),'') IS NOT NULL) AS first_login,
 MAX(event_name='login_button_clicked') AS has_start,
 MAX(event_name='free_trial_started' AND NULLIF(TRIM(user_id),'') IS NOT NULL) AS has_trial,
 json_group_array(client_ts) FILTER(WHERE event_name='page_viewed' AND client_ts>=?) AS pages,
 json_group_array(client_ts) FILTER(WHERE event_name='login_succeeded' AND NULLIF(TRIM(user_id),'') IS NOT NULL AND client_ts>=?) AS logins,
 json_group_array(client_ts) FILTER(WHERE event_name='login_button_clicked' AND client_ts>=?) AS starts,
 json_group_array(client_ts) FILTER(WHERE event_name='free_trial_started' AND NULLIF(TRIM(user_id),'') IS NOT NULL AND client_ts>=?) AS trials,
 json_group_array(client_ts) FILTER(WHERE event_name IN (${raws}) AND client_ts>=?) AS analyses
 FROM clean GROUP BY user_key LIMIT 80001`
 const rows=db.prepare(sql).all(asOf,asOf,start,start,start,start,start)
 if(rows.length>80000)throw Object.assign(new Error('监控用户超过分析上限'),{status:422})
 const records=rows.map(r=>({...r,...Object.fromEntries(['pages','logins','starts','trials','analyses'].map(k=>[k,JSON.parse(r[k])]))}))
 const availability={pages:records.some(r=>r.first_page!=null),login:records.some(r=>r.first_login!=null),starts:records.some(r=>r.has_start),trial:records.some(r=>r.has_trial),analysis:records.some(r=>r.first_chip!=null)}
 return computeMyMonitor(records,{start,end,asOf,historyComplete,availability})
}
module.exports={myMonitorLocal}
