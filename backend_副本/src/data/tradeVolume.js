const remote=require('./hologres')
// Business-confirmed: trading_transaction.trade_value is USD, not token base units.
function tradeVolumeCte(){return `WITH ranked_trades AS (
 SELECT *,ROW_NUMBER() OVER(PARTITION BY chain,transaction_hash ORDER BY created_time,id) AS rn
 FROM public.trading_transaction WHERE created_time <= $1::timestamptz AND transaction_time <= $1::timestamptz
 AND transaction_time >= TO_TIMESTAMP($2::double precision/1000) AND transaction_time < TO_TIMESTAMP($3::double precision/1000)
 AND LEFT(BTRIM(user_id::text),4)<>'acc_' AND NULLIF(BTRIM(transaction_hash),'') IS NOT NULL
 ), trades AS (SELECT * FROM ranked_trades WHERE rn=1)`}
async function tradeVolume(s,{start,end}){
 const cte=tradeVolumeCte(),params=[s.snapshot_cutoff,start,end]
 const [daily,totals]=await Promise.all([
 remote.query(`${cte} SELECT TO_CHAR(transaction_time AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS date,
 COUNT(*) AS transactions,COUNT(DISTINCT user_id) AS users,SUM(ABS(trade_value)) AS volume_usd,
 COUNT(*) FILTER(WHERE trade_value IS NULL) AS missing_values,COUNT(*) FILTER(WHERE trade_value<0) AS negative_values FROM trades GROUP BY 1 ORDER BY 1`,params),
 remote.query(`${cte} SELECT COUNT(*) AS transactions,COUNT(DISTINCT user_id) AS users,SUM(ABS(trade_value)) AS volume_usd,
 COUNT(*) FILTER(WHERE trade_value IS NULL) AS missing_values,COUNT(*) FILTER(WHERE trade_value<0) AS negative_values FROM trades`,params)])
 const normalize=r=>({...r,transactions:Number(r.transactions),users:Number(r.users),volume_usd:r.volume_usd==null?null:Number(r.volume_usd),missing_values:Number(r.missing_values),negative_values:Number(r.negative_values)})
 const map=new Map(daily.map(r=>[r.date,normalize(r)])),days=[]
 for(let t=start;t<end;t+=86400000){const date=new Date(t+25200000).toISOString().slice(0,10);days.push(map.get(date)||{date,transactions:0,users:0,volume_usd:0,missing_values:0,negative_values:0})}
 return {days,total:normalize(totals[0]),currency:'USD',source:'trading_transaction',coverage:'partial',snapshot_id:s.snapshot_id,as_of:s.snapshot_cutoff}
}
module.exports={tradeVolume,tradeVolumeCte}
