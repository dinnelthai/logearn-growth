const remote=require('./hologres')
const {normalizeAuditInput,contract}=require('../analytics/trackingAudit')
const projection=alias=>`jsonb_strip_nulls(jsonb_build_object(${contract.properties.map(k=>`'${k}',${alias}.properties->'${k}'`).join(',')}))`
async function trackingAuditFacts(s,b){
 const input=normalizeAuditInput(b),table=remote.sourceEventsTable(),cutoff=s.snapshot_cutoff,end=Math.min(b.end,Date.parse(cutoff)+1)
 const [summary]=await remote.query(`SELECT COUNT(*) AS received,
  COUNT(*) FILTER(WHERE event_id IS NULL OR BTRIM(event_id)='') AS missing_event_ids,
  COUNT(*) FILTER(WHERE client_ts IS NULL OR client_ts<0 OR client_ts>EXTRACT(EPOCH FROM $1::timestamptz)*1000) AS invalid_client_times,
  COUNT(*) FILTER(WHERE NULLIF(BTRIM(user_id),'') IS NULL AND NULLIF(BTRIM(anonymous_id),'') IS NULL) AS missing_identities,
  COUNT(*) FILTER(WHERE LEFT(BTRIM(COALESCE(user_id,'')),4)='acc_') AS dirty_user_ids,
  COUNT(*) FILTER(WHERE NULLIF(BTRIM(event_id),'') IS NOT NULL)-COUNT(DISTINCT NULLIF(BTRIM(event_id),'')) AS duplicate_rows
  FROM ${table} WHERE server_ts<=$1::timestamptz AND server_ts>=TO_TIMESTAMP($2::double precision/1000) AND server_ts<TO_TIMESTAMP($3::double precision/1000)`,[cutoff,b.start,end])
 const [included]=await remote.query(`${remote.eventsCte()}, arrivals AS (
  SELECT id,event_id FROM ${table} WHERE server_ts<=$1::timestamptz
    AND server_ts>=TO_TIMESTAMP($2::double precision/1000) AND server_ts<TO_TIMESTAMP($3::double precision/1000)
 ) SELECT COUNT(*) AS window_received,
  COUNT(*) FILTER(WHERE e.event_id IS NOT NULL AND e.id=a.id) AS n,
  COUNT(*) FILTER(WHERE e.event_id IS NOT NULL AND e.id<>a.id) AS same_id_others,
  COUNT(*) FILTER(WHERE e.event_id IS NULL) AS excluded
  FROM arrivals a LEFT JOIN e ON e.event_id=a.event_id`,[cutoff,b.start,end])
 const counts=Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,Number(v)]));counts.included=Number(included.n)
 counts.same_id_others=Number(included.same_id_others||0);counts.excluded=Number(included.excluded||0)
 counts.reconciled=Number(included.window_received)===counts.received&&counts.included+counts.same_id_others+counts.excluded===counts.received
 counts.excluded_reasons=[]
 if(counts.excluded){
  const reasons=await remote.query(`${remote.eventsCte()}, arrivals AS (
   SELECT event_id FROM ${table} WHERE server_ts<=$1::timestamptz AND server_ts>=TO_TIMESTAMP($2::double precision/1000) AND server_ts<TO_TIMESTAMP($3::double precision/1000)
  ) SELECT CASE
    WHEN r.event_id IS NULL THEN 'invalid_base'
    WHEN NULLIF(BTRIM(r.user_id),'') IS NULL AND NULLIF(BTRIM(r.anonymous_id),'') IS NULL THEN 'representative_missing_identity'
    WHEN LEFT(BTRIM(COALESCE(NULLIF(BTRIM(r.user_id),''),i.linked_user,'')),4)='acc_' THEN 'dirty_linked_identity'
    WHEN NULLIF(BTRIM(r.user_id),'') IS NULL AND EXISTS(SELECT 1 FROM ranked d WHERE d.anonymous_id=r.anonymous_id AND LEFT(BTRIM(d.user_id),4)='acc_') THEN 'dirty_anonymous_history'
    ELSE 'other' END AS reason,COUNT(*) AS records
   FROM arrivals a LEFT JOIN e ON e.event_id=a.event_id LEFT JOIN ranked r ON r.event_id=a.event_id AND r.rn=1
   LEFT JOIN identities i ON i.anonymous_id=r.anonymous_id WHERE e.event_id IS NULL GROUP BY 1`,[cutoff,b.start,end])
  counts.excluded_reasons=reasons.map(r=>({reason:r.reason,records:Number(r.records)}))
  counts.reconciled=counts.reconciled&&counts.excluded_reasons.reduce((n,r)=>n+r.records,0)===counts.excluded
 }
 if(!input.event_ids.length)return {raw:[],accepted:[],summary:counts}
 const raw=await remote.query(`SELECT e.event_id,e.event_name,e.client_ts,e.server_ts,
  e.client_ts IS NULL OR e.client_ts<0 OR e.client_ts>EXTRACT(EPOCH FROM $1::timestamptz)*1000 AS invalid_client_time,
  NULLIF(BTRIM(e.user_id),'') IS NULL AND NULLIF(BTRIM(e.anonymous_id),'') IS NULL AS missing_identity,
  LEFT(BTRIM(COALESCE(e.user_id,'')),4)='acc_' AS dirty_user,
  MD5(COALESCE(e.user_id,'')||CHR(31)||COALESCE(e.anonymous_id,'')) AS identity_fingerprint,
  ${projection('e')} AS properties FROM ${table} e WHERE e.server_ts<=$1::timestamptz AND e.event_id=ANY($2::text[])
  ORDER BY e.server_ts,e.id LIMIT 1001`,[cutoff,input.event_ids])
 if(raw.length>1000||Buffer.byteLength(JSON.stringify(raw))>2*1024*1024)throw Object.assign(new Error('验收事件重复记录或字段超过预算，请减少event_id'),{status:422})
 const accepted=await remote.query(`${remote.eventsCte()} SELECT event_id,event_name,client_ts,server_ts,${projection('e')} AS properties
  FROM e WHERE event_id=ANY($2::text[]) LIMIT 101`,[cutoff,input.event_ids])
 return {raw,accepted,summary:counts}
}
module.exports={trackingAuditFacts}
