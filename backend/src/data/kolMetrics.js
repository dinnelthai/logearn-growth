const remote=require('./hologres')
const {ANALYSIS_SQL}=require('./analysisUsers')
const {tradeIdentityCte}=require('./tradeIdentity')
const {computeReferralInsights}=require('../analytics/referralInsights')
const {validatePeriod,aggregateMembers}=require('../analytics/kolMetrics')
function budget(rows,max,label) {
  if(rows.length>max||Buffer.byteLength(JSON.stringify(rows))>32*1024*1024)throw Object.assign(new Error(label+'超过查询预算，请缩小统计期或 KOL 范围'),{status:422})
  return rows
}
async function relationships(s) {
  return remote.cached('crm:relationships:'+s.snapshot_id,async()=>{
    const [accounts,relations]=await Promise.all([
      remote.query('SELECT account_id::text AS account_id,created_at FROM public.account_v2 WHERE created_at<=$1::timestamptz LIMIT 80001',[s.snapshot_cutoff]),
      remote.query(`SELECT id::text,user_id::text,level1_user_id::text,is_valid,invitation_time,
        (EXTRACT(EPOCH FROM invitation_time)*1000000)::bigint::text AS invitation_order
        FROM public.user_invitation_relation WHERE created_time<=$1::timestamptz AND (invitation_time<=$1::timestamptz OR invitation_time IS NULL) LIMIT 80001`,[s.snapshot_cutoff])
    ])
    budget(accounts,80000,'账号');budget(relations,80000,'推荐关系')
    // Reuse recommendation's earliest binding, conflicting inviter and cycle rules.
    const result=computeReferralInsights(accounts.map(r=>({...r,created_at:Date.parse(r.created_at),trade_count:0})),relations.map(r=>({...r,invitation_at:r.invitation_time==null?null:Date.parse(r.invitation_time),invitation_order:r.invitation_order==null?null:Number(r.invitation_order),after_trade_count:0})),{start:0,end:Date.parse(s.snapshot_cutoff)+1,asOf:Date.parse(s.as_of),factsAsOf:Date.parse(s.snapshot_cutoff)})
    const children={}
    for(const [key,ids] of Object.entries(result.lists))if(key.startsWith('children:'))children[key.slice(9)]=ids.map(id=>({id:id.slice(5),bound_at:result.members[id].bound_at,bound_order:result.members[id].bound_order}))
    return {accounts:accounts.map(r=>r.account_id),children,quality:result.payload.quality}
  },30000)
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
async function kolMetrics(profiles,period) {
  const linked=profiles.filter(p=>p.account_id)
  if(!linked.length)return {metrics:profiles.map(p=>({id:p.id,available:false,reason:'尚未关联 LogEarn 账号'}))}
  const s=await remote.status(),asOf=Date.parse(s.snapshot_cutoff)
  const relationResult=await Promise.allSettled([relationships(s)])
  const relation=relationResult[0].status==='fulfilled'?relationResult[0].value:null
  const targets=[...new Set(linked.flatMap(p=>[p.account_id,...(relation?.children[p.account_id]||[]).filter(m=>m.bound_at<period.end).map(m=>m.id)]))]
  if(targets.length>5000)throw Object.assign(new Error('KOL 及直接邀请用户超过5000人，请缩小范围'),{status:422})
  const params=[s.snapshot_cutoff,period.start,period.end,targets]
  const results=await Promise.allSettled([
    remote.query(`${remote.eventsCte()} SELECT event_id,SUBSTRING(user_key FROM 6) AS user_id,client_ts AS t FROM e WHERE user_key=ANY($4::text[]) AND event_name IN(${ANALYSIS_SQL}) AND client_ts>=$2 AND client_ts<$3 AND client_ts<=EXTRACT(EPOCH FROM $1::timestamptz)*1000 LIMIT 150001`,[...params.slice(0,3),targets.map(id=>'user:'+id)]).then(rows=>budget(rows,150000,'分析事件')),
    remote.query(tradeSql(),params).then(rows=>budget(rows,150000,'交易记录')),
    remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($2::text[]) AND created_at<=$1::timestamptz',[s.snapshot_cutoff,linked.map(p=>p.account_id)])
  ])
  const events=results[0].status==='fulfilled'?results[0].value:[],trades=results[1].status==='fulfilled'?results[1].value:[]
  const known=results[2].status==='fulfilled'?new Set(results[2].value.map(r=>r.account_id)):null
  const errors={analysis:results[0].status==='rejected'?results[0].reason.message:null,trade:results[1].status==='rejected'?results[1].reason.message:null,referral:relationResult[0].status==='rejected'?relationResult[0].reason.message:null}
  function aggregate(members) {
    const result=aggregateMembers(members,events,trades,{...period,asOf})
    for(const row of [result.total,...result.rows,...result.daily]) {
      if(errors.analysis)for(const key of ['analysis_users','analysis_events','analysis_days','last_analysis_at'])if(key in row)row[key]=null
      if(errors.trade)for(const key of ['trade_users','transactions','volume_usd','missing_values','excluded_trades'])if(key in row)row[key]=null
    }
    return result
  }
  return {start:period.start,end:period.end,as_of:s.snapshot_cutoff,snapshot_id:s.snapshot_id,coverage:'partial',analysis_definition:'observed_events',errors,metrics:profiles.map(p=>{
    if(!p.account_id)return {id:p.id,available:false,reason:'尚未关联 LogEarn 账号'}
    if(!known?.has(p.account_id))return {id:p.id,available:false,reason:known?'关联账号不在当前快照中':'账号校验暂不可用'}
    const members=(relation?.children[p.account_id]||[]).filter(m=>m.bound_at<period.end)
    return {id:p.id,available:true,own:aggregate([{id:p.account_id}]),invited:relation?{...aggregate(members),new_bindings:members.filter(m=>m.bound_at>=period.start).length}:null}
  })}
}
module.exports={kolMetrics,validatePeriod,tradeSql}
