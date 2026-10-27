const remote=require('./hologres')
async function referralFacts(s){
 const rows=await remote.query(`WITH relations AS (
  SELECT id,user_id,level1_user_id,inviter_referral_code,invitation_time,is_valid,
   ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY invitation_time,id) AS rn
  FROM public.user_invitation_relation WHERE created_time<=$1::timestamptz AND (invitation_time<=$1::timestamptz OR invitation_time IS NULL)
 )${require('./tradeIdentity').tradeIdentityFragment()}, trades AS (
  SELECT r.id,COUNT(t.id) AS after_trade_count FROM relations r JOIN valid_map v ON v.account_id=r.user_id JOIN public.trading_transaction t ON t.user_id=v.user_id
   AND t.transaction_time>=r.invitation_time AND t.transaction_time<=$1::timestamptz AND t.created_time<=$1::timestamptz
  GROUP BY r.id
 ) SELECT r.*,(EXTRACT(EPOCH FROM r.invitation_time)*1000000)::bigint::text AS invitation_order,COALESCE(t.after_trade_count,0) AS after_trade_count FROM relations r LEFT JOIN trades t ON t.id=r.id LIMIT 80001`,[s.snapshot_cutoff])
 if(rows.length>80000||Buffer.byteLength(JSON.stringify(rows))>16*1024*1024)throw Object.assign(new Error('推荐关系超过预算，请缩小数据范围'),{status:422})
 return rows.map(r=>({...r,id:String(r.id),user_id:String(r.user_id),level1_user_id:r.level1_user_id==null?null:String(r.level1_user_id),invitation_at:r.invitation_time==null?null:Date.parse(r.invitation_time),invitation_order:r.invitation_order==null?null:Number(r.invitation_order),after_trade_count:Number(r.after_trade_count)}))
}
module.exports={referralFacts}
