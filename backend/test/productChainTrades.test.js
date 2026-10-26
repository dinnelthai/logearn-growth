const test=require('node:test'),assert=require('node:assert/strict')
const remote=require('../src/data/hologres')
const {productChainTrades,productChainTradeSql}=require('../src/data/productChainTrades')
const snapshot={snapshot_cutoff:'2026-10-26T00:00:00Z',as_of:'2026-10-25T23:00:00Z'},start=Date.parse('2026-10-25T00:00:00Z'),end=start+86400000

test('loads bounded business trades, verifies accounts and enriches only unique tokens by exact chain/hash',async()=>{
 const original=remote.query,calls=[]
 remote.query=async(sql,params)=>{calls.push({sql,params});if(sql.includes('trade_groups AS'))return [
  {id:'1',account_id:'7',chain:'3',transaction_hash:'unique',t:String(start+1)},
  {id:'2',account_id:'7',chain:'3',transaction_hash:'multi',t:String(start+2)},
  {id:'3',account_id:'7',chain:'3',transaction_hash:'missing',t:String(start+3)},
  {id:'4',account_id:'7',chain:'999',transaction_hash:'unsupported',t:String(start+4)}
 ];if(sql.includes('FROM public.account_v2'))return [{account_id:'7'}];if(sql.includes('FROM public.ledger_v2'))return params[1]==='3'?[{account_id:'7',tx_hash:'unique',token_address:'Token'},{account_id:'7',tx_hash:'missing',token_address:'LedgerOnly'},{account_id:'8',tx_hash:'multi',token_address:'WrongAccount'}]:[{account_id:'7',tx_hash:'unsupported',token_address:'OtherChainToken'}];return [{tx_hash:'unique',token_address:'Token'},{tx_hash:'multi',token_address:'A'},{tx_hash:'multi',token_address:'B'}]}
 try{
  const result=await productChainTrades(snapshot,[{id:'user:7'},{id:'anon:a'}],{start,end})
  assert.deepEqual(result.trades.map(t=>t.token_address),['Token',null,'LedgerOnly','OtherChainToken']);assert(result.known.has('user:7'))
  assert.equal(result.trades[0].user_id,'user:7');assert.equal(result.trades[0].t,start+1)
  assert.equal(calls[0].params[2],Date.parse(snapshot.as_of)+1)
  assert.deepEqual(calls[0].params[3],['7']);const swapCall=calls.find(c=>c.sql.includes('FROM public.amm_transaction_data'));assert.deepEqual(swapCall.params[2],['unique','multi','missing'])
  assert.match(swapCall.sql,/chain_id=\$2::integer/);assert.match(swapCall.sql,/created_at<=\$1/)
  const ledgerCall=calls.find(c=>c.sql.includes('FROM public.ledger_v2'));assert.match(ledgerCall.sql,/status='confirmed'/);assert.match(ledgerCall.sql,/confirmed_at<=\$1/);assert.deepEqual(ledgerCall.params[3],['7'])
  assert.match(productChainTradeSql(),/COUNT\(DISTINCT user_id\)=1/);assert.match(productChainTradeSql(),/COUNT\(DISTINCT transaction_time\)=1/)
  assert(!productChainTradeSql().includes('currency_type AS token_address'))
 }finally{remote.query=original}
})
test('query, account and token enrichment failures remain unknown; anonymous users never guess numeric identities',async()=>{
 const original=remote.query
 try{
  for(const failure of ['trade','account','token']){
   remote.query=async(sql)=>{
    const kind=sql.includes('trade_groups AS')?'trade':sql.includes('FROM public.account_v2')?'account':'token'
    if(kind===failure)throw new Error('unavailable')
    if(kind==='trade')return [{account_id:'7',chain:'3',transaction_hash:'h',t:start+1}]
    if(kind==='account')return [{account_id:'7'}]
    return [{tx_hash:'h',token_address:'Token'}]
   }
   const result=await productChainTrades(snapshot,[{id:'user:7'}],{start,end});assert.equal(result.known,null);assert.match(result.error,/未知/);assert.deepEqual(result.trades,[])
  }
  remote.query=async()=>{throw new Error('must not query')}
  assert.equal((await productChainTrades(snapshot,[{id:'anon:7'}],{start,end})).known.size,0)
 }finally{remote.query=original}
})
