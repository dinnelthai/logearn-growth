const remote=require('./hologres')
const {pointsIdentityCte}=require('./pointsFacts')
async function creditsFacts(s){
 const cte=pointsIdentityCte('SELECT DISTINCT user_id FROM public.api_quota WHERE created_at<=$1::timestamptz AND updated_at<=$1::timestamptz')
 const rows=await remote.query(`${cte}, quotas AS (
 SELECT q.*,v.account_id,ROW_NUMBER() OVER(PARTITION BY q.user_id ORDER BY q.updated_at DESC,q.id DESC) AS rn
 FROM public.api_quota q LEFT JOIN valid_map v ON v.user_id=q.user_id
 WHERE q.created_at<=$1::timestamptz AND q.updated_at<=$1::timestamptz
 ) SELECT user_id,account_id,total_quota,available_quota,used_quota,cumulative_quota,updated_at FROM quotas WHERE rn=1`,[s.snapshot_cutoff])
 if(rows.length>150000)throw Object.assign(new Error('Credits额度事实超过预算'),{status:422})
 const counts=new Map();for(const r of rows)if(r.account_id!=null)counts.set(String(r.account_id),(counts.get(String(r.account_id))||0)+1)
 const map=new Map(),quality={source_users:rows.length,unmapped_users:0,ambiguous_users:0,remapped_users:0}
 for(const r of rows){if(r.account_id==null){quality.unmapped_users++;continue}if(counts.get(String(r.account_id))!==1){quality.ambiguous_users++;continue}
  if(String(r.account_id)!==String(r.user_id))quality.remapped_users++
  const n=v=>v==null?null:Number(v)
  map.set(String(r.account_id),{credits_available:n(r.available_quota),credits_total:n(r.total_quota),credits_used:n(r.used_quota),credits_cumulative:n(r.cumulative_quota),credits_updated_at:Date.parse(r.updated_at)})
 }
 return {map,quality}
}
module.exports={creditsFacts}
