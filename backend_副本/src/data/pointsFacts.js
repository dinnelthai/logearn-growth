const remote=require('./hologres')
// Legacy business user IDs are resolved by unique verified wallet identity.
// Never fall back to an equal numeric ID when a legacy account exists.
function pointsIdentityCte(businessIds="SELECT user_id FROM public.points_transaction WHERE created_time<=$1::timestamptz UNION SELECT user_id FROM public.user_check_in WHERE created_time<=$1::timestamptz AND check_in_date<=$1::timestamptz"){return `WITH wallet_candidates AS (
 SELECT account_id,CASE WHEN subject ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(subject) ELSE subject END AS address
 FROM public.account_identity_v2 WHERE verified AND provider IN('metamask','phantom') AND created_at<=$1::timestamptz
), wallet_map AS (
 SELECT address,MIN(account_id) AS account_id FROM wallet_candidates WHERE NULLIF(address,'') IS NOT NULL
 GROUP BY address HAVING COUNT(DISTINCT account_id)=1
), business_ids AS (
 ${businessIds}
), identity_map AS (
 SELECT b.user_id,CASE WHEN u.id IS NOT NULL THEN w.account_id ELSE a.account_id END AS account_id
 FROM business_ids b LEFT JOIN public.user_account u ON u.id=b.user_id AND u.created_time<=$1::timestamptz
 LEFT JOIN wallet_map w ON w.address=CASE WHEN u.login_address ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(u.login_address) ELSE u.login_address END
 LEFT JOIN public.account_v2 a ON a.account_id=b.user_id AND a.created_at<=$1::timestamptz
), valid_map AS (
 SELECT i.* FROM identity_map i JOIN public.account_v2 a ON a.account_id=i.account_id AND a.created_at<=$1::timestamptz
)`}
async function pointsFacts(s,{start,end}){
 const cte=pointsIdentityCte(),params=[s.snapshot_cutoff,start,end]
 const queries=[
  `${cte} SELECT v.account_id,COUNT(*) AS records,MAX(p.created_time) AS last_points_at FROM public.points_transaction p JOIN valid_map v ON v.user_id=p.user_id WHERE p.created_time<=$1::timestamptz GROUP BY v.account_id`,
  `${cte} SELECT v.account_id,TO_CHAR(p.created_time AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS date,p.action_type,COUNT(*) AS records,SUM(GREATEST(p.points_change,0)) AS earned,SUM(LEAST(p.points_change,0)) AS negative,COUNT(*) FILTER(WHERE p.points_change>0) AS earned_records,MAX(p.created_time) AS last_points_at FROM public.points_transaction p JOIN valid_map v ON v.user_id=p.user_id WHERE p.created_time<=$1::timestamptz AND p.created_time>=TO_TIMESTAMP($2::double precision/1000) AND p.created_time<TO_TIMESTAMP($3::double precision/1000) GROUP BY v.account_id,date,p.action_type`,
  `${cte} SELECT v.account_id,TO_CHAR(c.check_in_date AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS date,MAX(c.check_in_date) AS last_checkin_at FROM public.user_check_in c JOIN valid_map v ON v.user_id=c.user_id WHERE c.created_time<=$1::timestamptz AND c.check_in_date<=$1::timestamptz GROUP BY v.account_id,date`,
  `${cte} SELECT COUNT(*) AS source_users,COUNT(*) FILTER(WHERE v.account_id IS NULL) AS unmapped_users,COUNT(*) FILTER(WHERE v.account_id<>i.user_id) AS remapped_users FROM identity_map i LEFT JOIN valid_map v ON v.user_id=i.user_id`
 ]
 const result=await Promise.all(queries.map((q,i)=>remote.query(q,i===1?params:[params[0]])))
 if(result.reduce((n,r)=>n+r.length,0)>150000||Buffer.byteLength(JSON.stringify(result))>32*1024*1024)throw Object.assign(new Error('积分与签到事实超过预算'),{status:422})
 return {totals:result[0],period:result[1],checkins:result[2],quality:result[3][0]}
}
module.exports={pointsFacts,pointsIdentityCte}
