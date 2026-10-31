const remote=require('./hologres'),{ANALYSIS_SQL}=require('./analysisUsers')
function budget(rows,max,message){if(rows.length>max||Buffer.byteLength(JSON.stringify(rows))>8*1024*1024)throw Object.assign(Error(message),{status:422});return rows}
async function registrationFacts(s,{start,end,source='all'},audience){
 try{
  const rows=budget(await remote.query(`${remote.eventsCte()}, registrations AS (
   SELECT 'user:'||a.account_id::text AS user_key,EXTRACT(EPOCH FROM a.created_at)*1000 AS registered_at,
    COALESCE(NULLIF(BTRIM(f.source),''),'未知') AS source
   FROM public.account_v2 a LEFT JOIN facts f ON f.user_key='user:'||a.account_id::text
   WHERE a.created_at>=TO_TIMESTAMP($2::double precision/1000.0) AND a.created_at<TO_TIMESTAMP($3::double precision/1000.0)
    AND a.created_at<=$1::timestamptz AND ($5::text='all' OR COALESCE(NULLIF(BTRIM(f.source),''),'未知')=$5)
    AND ($6::text[] IS NULL OR 'user:'||a.account_id::text=ANY($6))
  ) SELECT r.user_key,r.registered_at,r.source,MIN(e.client_ts) AS first_chip_at
   FROM registrations r LEFT JOIN e ON e.user_key=r.user_key
    AND e.client_ts>=r.registered_at AND e.client_ts<=$4
    AND e.event_name IN(${ANALYSIS_SQL})
   GROUP BY r.user_key,r.registered_at,r.source ORDER BY r.user_key LIMIT 50001`,
   [s.snapshot_cutoff,start,Math.min(end,Date.parse(s.as_of)+1),Date.parse(s.as_of),source,audience]),50000,'注册批次超过预算，请缩小范围')
  return {available:true,rows:rows.map(r=>({...r,registered_at:Number(r.registered_at),first_chip_at:r.first_chip_at==null?null:Number(r.first_chip_at)})),scope:source==='all'?'all':'observed_source',error:null}
 }catch(e){if(e.status===422)throw e;return {available:false,rows:[],scope:source==='all'?'all':'observed_source',error:'注册事实暂不可用，未将缺失解释为零'}}
}
async function diagnosticCoverage(s,{start,end,source='all'},audience){
 const rows=budget(await remote.query(`${remote.eventsCte()}, scoped_diagnostics AS (
  SELECT e.user_key,e.event_name,
   CASE WHEN e.event_name IN('analysis_requested','analysis_request_finished') THEN 'analysis'
    WHEN e.event_name IN('login_attempt_started','login_attempt_finished') THEN 'login' ELSE 'page_load' END AS family,
   COALESCE(NULLIF(BTRIM(e.device),''),'未知') AS device,COALESCE(NULLIF(BTRIM(e.app_version),''),'未知') AS app_version,
   COALESCE(NULLIF(BTRIM(e.properties->>'diagnostics_version'),''),'未知') AS diagnostics_version
  FROM e JOIN facts f ON f.user_key=e.user_key WHERE e.client_ts>=$2 AND e.client_ts<$3 AND e.client_ts<=$4
   AND e.event_name IN('analysis_requested','analysis_request_finished','login_attempt_started','login_attempt_finished','page_content_load_started','page_content_load_finished')
   AND ($5::text='all' OR COALESCE(NULLIF(BTRIM(f.source),''),'未知')=$5) AND ($6::text[] IS NULL OR e.user_key=ANY($6))
 ) SELECT 'family' AS scope,family,'' AS device,'' AS app_version,'' AS diagnostics_version,COUNT(*) AS events,COUNT(DISTINCT user_key) AS users
  FROM scoped_diagnostics GROUP BY family
 UNION ALL SELECT 'device_version' AS scope,family,device,app_version,diagnostics_version,COUNT(*) AS events,COUNT(DISTINCT user_key) AS users
  FROM scoped_diagnostics GROUP BY family,device,app_version,diagnostics_version LIMIT 2001`,
  [s.snapshot_cutoff,start,end,Date.parse(s.as_of),source,audience]),2000,'诊断覆盖分组超过预算，请缩小范围')
 return {available:true,rows:rows.map(r=>({...r,events:Number(r.events),users:Number(r.users)}))}
}
module.exports={registrationFacts,diagnosticCoverage}
