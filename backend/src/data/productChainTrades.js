const remote=require('./hologres')
const {tradeIdentityCte}=require('./tradeIdentity')
const {budget}=require('./memberMetrics')
const TOKEN_CHAINS=new Set(['1','3','56','8453','4663','5042'])
const normalizeAddress=value=>{const s=String(value??'').trim();return /^0x[0-9a-fA-F]{40}$/.test(s)?s.toLowerCase():s}
function productChainTradeSql(){
 const scope=`SELECT DISTINCT user_id FROM public.trading_transaction WHERE created_time<=$1::timestamptz AND transaction_time<=$1::timestamptz AND transaction_time>=TO_TIMESTAMP($2::double precision/1000) AND transaction_time<TO_TIMESTAMP($3::double precision/1000)`
 return `${tradeIdentityCte(scope)}, trade_groups AS (
 SELECT chain,transaction_hash,MIN(id)::text AS id,MIN(user_id) AS user_id,
 MIN(transaction_time) AS transaction_time,
 COUNT(DISTINCT user_id)=1 AND COUNT(DISTINCT transaction_time)=1 AS valid
 FROM public.trading_transaction WHERE created_time<=$1::timestamptz AND transaction_time<=$1::timestamptz
 AND transaction_time>=TO_TIMESTAMP($2::double precision/1000) AND transaction_time<TO_TIMESTAMP($3::double precision/1000)
 GROUP BY chain,transaction_hash
 ) SELECT t.id,t.chain::text,t.transaction_hash,t.valid,
 (EXTRACT(EPOCH FROM t.transaction_time)*1000)::double precision AS t,v.account_id::text AS account_id
 FROM trade_groups t JOIN valid_map v ON v.user_id=t.user_id
 WHERE v.account_id::text=ANY($4::text[]) ORDER BY t.transaction_time,t.id LIMIT 150001`
}
// currency_type is a settlement currency, never a token address. Enrich from
// confirmed account ledger entries and indexed swaps; ambiguous tokens stay unknown.
async function productChainTrades(s,users,{start,end}){
 const targets=[...new Set(users.map(u=>u.id).filter(id=>/^user:[1-9]\d{0,19}$/.test(id)).map(id=>id.slice(5)))]
 if(!targets.length)return {trades:[],known:new Set(),error:null,coverage:'partial'}
 try{
  if(targets.length>5000)throw new Error('交易关联账号超过5000人预算')
  const until=Math.min(end+86400000,Date.parse(s.as_of)+1,Date.parse(s.snapshot_cutoff)+1)
  const results=await Promise.all([
   remote.query(productChainTradeSql(),[s.snapshot_cutoff,start,until,targets]).then(rows=>budget(rows,150000,'链路交易')),
   remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($2::text[]) AND created_at<=$1::timestamptz',[s.snapshot_cutoff,targets])
  ])
  let tokenRows=0,tokenBytes=0
  const trades=results[0],tokens=new Map(),ledgerTokens=new Map(),chains=[...new Set(trades.map(t=>String(t.chain)))]
  for(const chain of chains){
   const hashes=[...new Set(trades.filter(t=>String(t.chain)===chain).map(t=>t.transaction_hash).filter(Boolean))]
   for(let offset=0;offset<hashes.length;offset+=1000){
    const ledger=budget(await remote.query(`SELECT account_id::text,tx_hash,token AS token_address FROM public.ledger_v2
     WHERE chain_id=$2::text AND tx_hash=ANY($3::text[]) AND account_id::text=ANY($4::text[])
     AND status='confirmed' AND created_at<=$1::timestamptz AND confirmed_at<=$1::timestamptz
     GROUP BY account_id,tx_hash,token LIMIT 150001`,[s.snapshot_cutoff,chain,hashes.slice(offset,offset+1000),targets]),150000,'账本Token关联')
    for(const row of ledger){const key=JSON.stringify([String(row.account_id),chain,row.tx_hash]);if(!ledgerTokens.has(key))ledgerTokens.set(key,new Set());ledgerTokens.get(key).add(normalizeAddress(row.token_address))}
    const rows=TOKEN_CHAINS.has(chain)?budget(await remote.query(`SELECT tx_hash,token_address FROM public.amm_transaction_data_rt_v1_${chain}
     WHERE chain_id=$2::integer AND tx_hash=ANY($3::text[]) AND created_at<=$1::timestamptz
     GROUP BY tx_hash,token_address LIMIT 150001`,[s.snapshot_cutoff,chain,hashes.slice(offset,offset+1000)]),150000,'交易Token关联'):[]
    tokenRows+=rows.length+ledger.length;tokenBytes+=Buffer.byteLength(JSON.stringify([rows,ledger]))
    if(tokenRows>150000||tokenBytes>32*1024*1024)throw new Error('交易Token关联累计超过预算')
    for(const row of rows){const key=JSON.stringify([chain,row.tx_hash]);if(!tokens.has(key))tokens.set(key,new Set());tokens.get(key).add(normalizeAddress(row.token_address))}
   }
  }
  return {trades:trades.map(t=>{const values=new Set([...(ledgerTokens.get(JSON.stringify([String(t.account_id),String(t.chain),t.transaction_hash]))||[]),...(tokens.get(JSON.stringify([String(t.chain),t.transaction_hash]))||[])]);return {...t,user_id:'user:'+t.account_id,t:Number(t.t),token_address:values?.size===1?[...values][0]:null}}),known:new Set(results[1].map(r=>'user:'+r.account_id)),error:null,coverage:'partial'}
 }catch(error){return {trades:[],known:null,error:'交易事实查询或Token关联失败，结果未知',coverage:'partial'}}
}
module.exports={productChainTrades,productChainTradeSql,normalizeAddress}
