'use strict';
const pool=require('../../db/aiPool');
const DAY=86400000;
const num=x=>Number(x||0);
async function getCostBreakdown({ownerId,days=7,now=Date.now(),limit=20,db=pool}={}){
 if(typeof ownerId!=='string'||!ownerId||ownerId.length>256||
   !Number.isSafeInteger(days)||days<1||days>30||
   !Number.isSafeInteger(now)||now<DAY||
   !Number.isSafeInteger(limit)||limit<1||limit>50)
  throw Object.assign(Error('AI 费用审计参数无效'),{status:400});
 const since=now-days*DAY,until=now,scope=[ownerId,since,until];
 const [a,b]=await Promise.all([
  db.query(`SELECT COUNT(*)::int AS calls,
   COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
   COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
   COALESCE(SUM(total_tokens),0)::bigint AS total_tokens,
   COALESCE(SUM(cost_usd),0)::numeric AS known_cost,
   COUNT(*) FILTER(WHERE cost_known=false)::int AS unknown_cost_calls
   FROM ai_usage_logs WHERE owner_id=$1 AND created_at >=$2 AND created_at<$3`,scope),
  db.query(`SELECT operation_type,operation_id,COUNT(*)::int AS calls,
   COALESCE(SUM(total_tokens),0)::bigint AS total_tokens,
   COUNT(*) FILTER(WHERE cost_known=false)::int AS unknown_cost_calls
   FROM ai_usage_logs WHERE owner_id=$1 AND created_at >=$2 AND created_at<$3
   GROUP BY operation_type,operation_id
   ORDER BY SUM(total_tokens) DESC,operation_type,operation_id LIMIT $4`,[...scope,limit])
 ]);
 const x=a.rows[0]||{};
 return {days,since,until,source:'ai_usage_logs',readOnly:true,
  total:{calls:num(x.calls),inputTokens:num(x.input_tokens),
   outputTokens:num(x.output_tokens),totalTokens:num(x.total_tokens),
   knownCostUsd:num(x.known_cost),unknownCostCalls:num(x.unknown_cost_calls)},
  topOperations:b.rows.map(row=>({operationType:row.operation_type,
   operationId:row.operation_id,calls:num(row.calls),totalTokens:num(row.total_tokens),
   unknownCostCalls:num(row.unknown_cost_calls)})),
  note:'金额基于已登记中转单价；Token或价格未知时不能视为零成本'};
}
module.exports={getCostBreakdown};
