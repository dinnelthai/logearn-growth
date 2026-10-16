const remote=require('./hologres'),{pointsIdentityCte}=require('./pointsFacts')
function tokenUsage(rows){let tokens=0,covered=0;for(const r of rows){let d;try{d=typeof r.detail==='string'?JSON.parse(r.detail):r.detail}catch{continue}const u=d?.usage??d;const total=u?.total_tokens??(Number.isSafeInteger(u?.prompt_tokens)&&Number.isSafeInteger(u?.completion_tokens)?u.prompt_tokens+u.completion_tokens:null);if(Number.isSafeInteger(total)&&total>=0){tokens+=total;covered++}}return {tokens:covered?tokens:null,covered,records:rows.length}}
async function activityAi(s,ids,period){
 const end=Math.min(period.end,Date.parse(s.as_of)),params=[s.snapshot_cutoff,period.start,end,ids]
 const results=await Promise.allSettled([
 remote.query(`${remote.eventsCte()} SELECT COUNT(DISTINCT user_key) AS users,COUNT(*) AS starts,MAX(client_ts) AS last_started_at,COUNT(DISTINCT properties->>'strategy_type') AS strategy_types FROM e WHERE user_key=ANY($4::text[]) AND event_name='strategy_started' AND client_ts>=$2 AND client_ts<$3`,[...params.slice(0,3),ids.map(id=>'user:'+id)]),
 remote.query(`${pointsIdentityCte('SELECT DISTINCT user_id FROM public.agent_credit_ledger WHERE created_at<=$1::timestamptz')} SELECT l.id,l.credit_cost,l.detail FROM public.agent_credit_ledger l JOIN valid_map v ON v.user_id=l.user_id WHERE v.account_id::text=ANY($4::text[]) AND l.created_at<=$1::timestamptz AND l.created_at>=TO_TIMESTAMP($2::double precision/1000) AND l.created_at<TO_TIMESTAMP($3::double precision/1000) LIMIT 150001`,params)
 ])
 const ledger=results[1].status==='fulfilled'&&results[1].value.length<=150000?results[1].value:null
 const costs=ledger?.map(r=>r.credit_cost==null?null:Number(r.credit_cost))
 const credits=costs?.length&&costs.every(n=>Number.isFinite(n))?costs.reduce((n,c)=>n+Math.max(0,c),0):null
 const first=results[0].status==='fulfilled'?results[0].value[0]:null
 return {users:first?Number(first.users??0):null,starts:first?Number(first.starts??0):null,strategy_types:first?Number(first.strategy_types??0):null,last_started_at:first?.last_started_at==null?null:Number(first.last_started_at),credits,credit_records:ledger?.length??null,note:'策略使用按所选用户和统计期内 strategy_started 事件统计；期间 Credits 消耗汇总账本正向 credit_cost，空账本不视为零。累计消耗和当前余额来自额度账户，不代表期间消耗，也不证明全部用于 AI 策略。',error:results[0].status==='rejected'?'策略数据暂不可用':null}

}
module.exports={activityAi,tokenUsage}
