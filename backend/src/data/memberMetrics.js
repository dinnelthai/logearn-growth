const remote=require('./hologres')
const {ANALYSIS_SQL}=require('./analysisUsers')
const {tradeIdentityCte}=require('./tradeIdentity')
const {aggregateMembers}=require('../analytics/kolMetrics')
function budget(rows,max,label) {
  if(rows.length>max||Buffer.byteLength(JSON.stringify(rows))>32*1024*1024)throw Object.assign(new Error(label+'超过查询预算，请缩小统计期或 KOL 范围'),{status:422})
  return rows
}
function tradeSql() {
  // Business table IDs use the same verified legacy-wallet mapping as points/credits.
  const identities=tradeIdentityCte(`SELECT DISTINCT user_id FROM public.trading_transaction WHERE created_time<=$1::timestamptz AND transaction_time<=$1::timestamptz AND transaction_time>=TO_TIMESTAMP($2::double precision/1000) AND transaction_time<TO_TIMESTAMP($3::double precision/1000)`)
  return `${identities}, trade_groups AS (
    SELECT chain,transaction_hash,MIN(user_id) AS user_id,MIN(transaction_time) AS transaction_time,
      (EXTRACT(EPOCH FROM MIN(transaction_time))*1000000)::bigint::text AS transaction_order,
      MIN(trade_value) AS trade_value,
      COUNT(DISTINCT user_id)=1 AND COUNT(DISTINCT transaction_time)=1 AND COUNT(DISTINCT trade_value)<=1
        AND (COUNT(trade_value)=0 OR COUNT(trade_value)=COUNT(*)) AS valid
    FROM public.trading_transaction WHERE created_time<=$1::timestamptz AND transaction_time<=$1::timestamptz
      AND transaction_time>=TO_TIMESTAMP($2::double precision/1000) AND transaction_time<TO_TIMESTAMP($3::double precision/1000)
    GROUP BY chain,transaction_hash
  ) SELECT t.*,v.account_id::text AS account_id FROM trade_groups t JOIN valid_map v ON v.user_id=t.user_id
    WHERE v.account_id::text=ANY($4::text[]) LIMIT 150001`
}
async function memberFacts(s,ids,period) {
  const targets=[...new Set(ids.map(String))]
  if(targets.length>5000)throw Object.assign(new Error('相关账号超过5000人，请缩小范围'),{status:422})
  if(!targets.length)return {events:[],trades:[],known:new Set(),errors:{analysis:null,trade:null,account:null}}
  const params=[s.snapshot_cutoff,period.start,period.end,targets]
  const results=await Promise.allSettled([
    remote.query(`${remote.eventsCte()} SELECT event_id,SUBSTRING(user_key FROM 6) AS user_id,client_ts AS t FROM e WHERE user_key=ANY($4::text[]) AND event_name IN(${ANALYSIS_SQL}) AND client_ts>=$2 AND client_ts<$3 LIMIT 150001`,[...params.slice(0,3),targets.map(id=>'user:'+id)]).then(rows=>budget(rows,150000,'分析事件')),
    remote.query(tradeSql(),params).then(rows=>budget(rows,150000,'交易记录')),
    remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($2::text[]) AND created_at<=$1::timestamptz',[s.snapshot_cutoff,targets])
  ])
  return {events:results[0].status==='fulfilled'?results[0].value:[],trades:results[1].status==='fulfilled'?results[1].value:[],known:results[2].status==='fulfilled'?new Set(results[2].value.map(r=>String(r.account_id))):null,
    errors:Object.fromEntries(['analysis','trade','account'].map((key,i)=>[key,results[i].status==='rejected'?results[i].reason.message:null]))}
}
function memberMetrics(facts,members,period,s) {
  if(facts.known===null)return null
  const unique=[...new Map(members.map(m=>[String(m.id),{...m,id:String(m.id)}])).values()]
  const result=aggregateMembers(unique.filter(m=>facts.known.has(m.id)),facts.events,facts.trades,{...period,asOf:Date.parse(s.snapshot_cutoff)})
  result.requested_users=unique.length;result.unmatched_users=unique.length-result.total.users
  for(const row of [result.total,...result.rows,...result.daily]) {
    if(facts.errors.analysis)for(const key of ['analysis_users','analysis_events','analysis_days','last_analysis_at'])if(key in row)row[key]=null
    if(facts.errors.trade)for(const key of ['trade_users','transactions','volume_usd','missing_values','excluded_trades'])if(key in row)row[key]=null
  }
  return result
}
module.exports={memberFacts,memberMetrics,tradeSql,budget}
