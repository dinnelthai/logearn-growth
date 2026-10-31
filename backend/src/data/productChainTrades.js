const remote=require('./hologres')
const {tradeIdentityCte}=require('./tradeIdentity')
const {budget}=require('./memberMetrics')
const TOKEN_CHAINS=new Set(['1','3','56','8453','4663','5042'])
const DAY=86400000,MAX_TRADE_ROWS=20000,MAX_WINDOWS=5000,HASH_BATCH_SIZE=2000
const normalizeAddress=value=>{const s=String(value??'').trim();return /^0x[0-9a-fA-F]{40}$/.test(s)?s.toLowerCase():s}

// Only query business trades that could follow a successful, same-token analysis.
function buildTradeWindows(analysisRows,{start,end},snapshot){
 const cutoff=Math.min(Date.parse(snapshot.as_of),Date.parse(snapshot.snapshot_cutoff))
 const maxEnd=Math.min(end+DAY,cutoff+1),raw=[]
 for(const row of Array.isArray(analysisRows)?analysisRows:[]){
  const match=String(row.user_id||'').match(/^user:([1-9]\d{0,19})$/)
  if(!match||row.state!=='success'||row.trigger!=='user_action'||
   !Number.isFinite(Number(row.started_at))||Number(row.started_at)<start||
   Number(row.started_at)>=end+DAY||!Number.isFinite(Number(row.finished_at))||
   !row.token_visit_id||!row.token_address||
   typeof row.chain!=='string'||!row.chain||row.chain==='unknown')continue
  const windowStart=Number(row.finished_at),windowEnd=Math.min(windowStart+DAY,maxEnd)
  if(windowEnd<=windowStart)continue
  raw.push({accountId:match[1],chain:row.chain,start:windowStart,end:windowEnd})
 }
 raw.sort((a,b)=>a.accountId.localeCompare(b.accountId)||a.chain.localeCompare(b.chain)||a.start-b.start)
 const merged=[]
 for(const row of raw){
  const previous=merged[merged.length-1]
  if(previous&&previous.accountId===row.accountId&&previous.chain===row.chain&&row.start<=previous.end)
   previous.end=Math.max(previous.end,row.end)
  else merged.push({...row})
 }
 const truncated=merged.length>MAX_WINDOWS
 return {windows:truncated?merged.slice(-MAX_WINDOWS):merged,truncated}
}
function productChainTradeSql(){
 const scope=[
  'SELECT DISTINCT t.user_id',
  'FROM public.trading_transaction t',
  'LEFT JOIN public.user_account ua ON ua.id=t.user_id AND ua.created_time<=$1::timestamptz',
  "LEFT JOIN wallet_map wm ON wm.address=CASE WHEN ua.login_address ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(ua.login_address) ELSE ua.login_address END",
  'LEFT JOIN public.account_v2 av ON av.account_id=t.user_id AND av.created_at<=$1::timestamptz',
  'JOIN UNNEST($5::text[],$6::text[],$7::double precision[],$8::double precision[]) AS win(account_id,chain,window_start,window_end)',
  ' ON win.account_id=(CASE WHEN ua.id IS NOT NULL THEN wm.account_id ELSE av.account_id END)::text',
  ' AND win.chain=t.chain::text',
  ' AND t.transaction_time>TO_TIMESTAMP(win.window_start/1000.0)',
  ' AND t.transaction_time<TO_TIMESTAMP(win.window_end/1000.0)',
  'WHERE t.created_time<=$1::timestamptz AND t.transaction_time<=$1::timestamptz',
  ' AND t.transaction_time>=TO_TIMESTAMP($2::double precision/1000)',
  ' AND t.transaction_time<TO_TIMESTAMP($3::double precision/1000)',
  ' AND (CASE WHEN ua.id IS NOT NULL THEN wm.account_id ELSE av.account_id END)::text=ANY($4::text[])'
 ].join('\n')
 const groups=[
  'trade_groups AS (',
  ' SELECT t.chain,t.transaction_hash,MIN(t.id)::text AS id,MIN(t.user_id) AS user_id,',
  '  MIN(t.transaction_time) AS transaction_time,',
  '  COUNT(DISTINCT t.user_id)=1 AND COUNT(DISTINCT t.transaction_time)=1 AS valid,',
  '  MIN(v.account_id)::text AS account_id',
  ' FROM public.trading_transaction t JOIN valid_map v ON v.user_id=t.user_id',
  ' JOIN UNNEST($5::text[],$6::text[],$7::double precision[],$8::double precision[]) AS win(account_id,chain,window_start,window_end)',
  '  ON win.account_id=v.account_id::text AND win.chain=t.chain::text',
  '  AND t.transaction_time>TO_TIMESTAMP(win.window_start/1000.0)',
  '  AND t.transaction_time<TO_TIMESTAMP(win.window_end/1000.0)',
  ' WHERE t.created_time<=$1::timestamptz AND t.transaction_time<=$1::timestamptz',
  '  AND t.transaction_time>=TO_TIMESTAMP($2::double precision/1000)',
  '  AND t.transaction_time<TO_TIMESTAMP($3::double precision/1000)',
  '  AND v.account_id::text=ANY($4::text[])',
  ' GROUP BY t.chain,t.transaction_hash',
  ') SELECT t.id,t.chain::text,t.transaction_hash,t.valid,',
  ' (EXTRACT(EPOCH FROM t.transaction_time)*1000)::double precision AS t,t.account_id',
  ' FROM trade_groups t ORDER BY t.transaction_time DESC,t.id LIMIT '+String(MAX_TRADE_ROWS+1)
 ].join('\n')
 return tradeIdentityCte(scope)+', '+groups
}
// currency_type is a settlement currency, never a token address.
async function productChainTrades(s,users,{start,end},analysisRows=[]){
 const windowResult=buildTradeWindows(analysisRows,{start,end},s),windows=windowResult.windows
 if(!windows.length)return {trades:[],known:new Set(),error:null,coverage:'partial',
  truncated:windowResult.truncated,windows:0,windowsTruncated:windowResult.truncated}
 const targets=[...new Set(windows.map(w=>w.accountId))]
 if(targets.length>5000)return {trades:[],known:null,error:'交易关联账号超过5000人预算，结果未知',
  coverage:'partial',truncated:true,windows:windows.length,windowsTruncated:windowResult.truncated}
 try{
  const until=Math.min(end+DAY,Date.parse(s.as_of)+1,Date.parse(s.snapshot_cutoff)+1)
  const params=[s.snapshot_cutoff,start,until,targets,
   windows.map(w=>w.accountId),windows.map(w=>w.chain),
   windows.map(w=>w.start),windows.map(w=>w.end)]
  const [rawTrades,accountRows]=await Promise.all([
   remote.query(productChainTradeSql(),params),
   remote.query('SELECT account_id::text AS account_id FROM public.account_v2 WHERE account_id::text=ANY($2::text[]) AND created_at<=$1::timestamptz',[s.snapshot_cutoff,targets])
  ])
  const tradeTruncated=rawTrades.length>MAX_TRADE_ROWS
  const trades=budget(rawTrades.slice(0,MAX_TRADE_ROWS),MAX_TRADE_ROWS,'链路交易')
  let tokenRows=0,tokenBytes=0
  const tokens=new Map(),ledgerTokens=new Map(),chains=[...new Set(trades.map(t=>String(t.chain)))]
  for(const chain of chains){
   const hashes=[...new Set(trades.filter(t=>String(t.chain)===chain).map(t=>t.transaction_hash).filter(Boolean))]
   for(let offset=0;offset<hashes.length;offset+=HASH_BATCH_SIZE){
    const batch=hashes.slice(offset,offset+HASH_BATCH_SIZE)
    const [ledger,rows]=await Promise.all([
     remote.query("SELECT account_id::text,tx_hash,token AS token_address FROM public.ledger_v2 WHERE chain_id=$2::text AND tx_hash=ANY($3::text[]) AND account_id::text=ANY($4::text[]) AND status='confirmed' AND created_at<=$1::timestamptz AND confirmed_at<=$1::timestamptz GROUP BY account_id,tx_hash,token LIMIT 150001",
      [s.snapshot_cutoff,chain,batch,targets]).then(r=>budget(r,150000,'账本Token关联')),
     TOKEN_CHAINS.has(chain)?
      remote.query('SELECT tx_hash,token_address FROM public.amm_transaction_data_rt_v1_'+chain+' WHERE chain_id=$2::integer AND tx_hash=ANY($3::text[]) AND created_at<=$1::timestamptz GROUP BY tx_hash,token_address LIMIT 150001',
       [s.snapshot_cutoff,chain,batch]).then(r=>budget(r,150000,'交易Token关联')):
      Promise.resolve([])
    ])
    for(const row of ledger){
     const key=JSON.stringify([String(row.account_id),chain,row.tx_hash])
     if(!ledgerTokens.has(key))ledgerTokens.set(key,new Set())
     ledgerTokens.get(key).add(normalizeAddress(row.token_address))
    }
    tokenRows+=rows.length+ledger.length;tokenBytes+=Buffer.byteLength(JSON.stringify([rows,ledger]))
    if(tokenRows>150000||tokenBytes>32*1024*1024)throw new Error('交易Token关联累计超过预算')
    for(const row of rows){
     const key=JSON.stringify([chain,row.tx_hash])
     if(!tokens.has(key))tokens.set(key,new Set())
     tokens.get(key).add(normalizeAddress(row.token_address))
    }
   }
  }
  return {trades:trades.map(t=>{
   const values=new Set([
    ...(ledgerTokens.get(JSON.stringify([String(t.account_id),String(t.chain),t.transaction_hash]))||[]),
    ...(tokens.get(JSON.stringify([String(t.chain),t.transaction_hash]))||[])
   ])
   return {...t,user_id:'user:'+t.account_id,t:Number(t.t),token_address:values.size===1?[...values][0]:null}
  }),known:new Set(accountRows.map(r=>'user:'+r.account_id)),error:null,coverage:'partial',
   truncated:windowResult.truncated||tradeTruncated,windows:windows.length,
   windowsTruncated:windowResult.truncated,tradeRowsTruncated:tradeTruncated}
 }catch(error){
  return {trades:[],known:null,error:'交易事实查询或Token关联失败，结果未知',coverage:'partial',
   truncated:true,windows:windows.length,windowsTruncated:windowResult.truncated}
 }
}
module.exports={productChainTrades,productChainTradeSql,normalizeAddress,buildTradeWindows,
 MAX_TRADE_ROWS,MAX_WINDOWS,HASH_BATCH_SIZE}
