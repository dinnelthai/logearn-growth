const test=require('node:test'),assert=require('node:assert/strict')
const remote=require('../src/data/hologres')
const {productChainTrades,productChainTradeSql,buildTradeWindows,MAX_TRADE_ROWS,HASH_BATCH_SIZE}=require('../src/data/productChainTrades')
const snapshot={snapshot_cutoff:'2026-10-26T00:00:00Z',as_of:'2026-10-25T23:00:00Z'},start=Date.parse('2026-10-25T00:00:00Z'),end=start+86400000
const analyses=[{user_id:'user:7',state:'success',trigger:'user_action',
 started_at:start+10,finished_at:start+20,token_visit_id:'visit-1',
 token_address:'Token',chain:'3'}]

test('trade windows use only successful same-token analysis and merge overlapping intervals',()=>{
 const rows=[
  ...analyses,
  {...analyses[0],finished_at:start+30,token_visit_id:'visit-2'},
  {...analyses[0],state:'failed',finished_at:start+40},
  {...analyses[0],trigger:'cache',finished_at:start+50},
  {...analyses[0],user_id:'anon:7',finished_at:start+60},
  {...analyses[0],chain:'unknown',finished_at:start+70}
 ];
 const result=buildTradeWindows(rows,{start,end},snapshot);
 assert.equal(result.truncated,false);
 assert.equal(result.windows.length,1);
 assert.deepEqual(result.windows[0],{
  accountId:'7',chain:'3',start:start+20,end:Math.min(start+20+86400000,end+86400000,Date.parse(snapshot.as_of)+1)
 });
});

test('loads only trades inside validated analysis windows and enriches unique tokens by exact chain/hash',async()=>{
 const original=remote.query,calls=[]
 remote.query=async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes('trade_groups AS'))return [
   {id:'1',account_id:'7',chain:'3',transaction_hash:'unique',t:String(start+21)},
   {id:'2',account_id:'7',chain:'3',transaction_hash:'multi',t:String(start+22)},
   {id:'3',account_id:'7',chain:'3',transaction_hash:'missing',t:String(start+23)},
   {id:'4',account_id:'7',chain:'999',transaction_hash:'unsupported',t:String(start+24)}
  ];
  if(sql.includes('FROM public.account_v2'))return [{account_id:'7'}];
  if(sql.includes('FROM public.ledger_v2'))return params[1]==='3'?
   [{account_id:'7',tx_hash:'unique',token_address:'Token'},
    {account_id:'7',tx_hash:'missing',token_address:'LedgerOnly'},
    {account_id:'8',tx_hash:'multi',token_address:'WrongAccount'}]:
   [{account_id:'7',tx_hash:'unsupported',token_address:'OtherChainToken'}];
  return [{tx_hash:'unique',token_address:'Token'},{tx_hash:'multi',token_address:'A'},{tx_hash:'multi',token_address:'B'}];
 };
 try{
  const result=await productChainTrades(snapshot,[{id:'user:7'},{id:'anon:a'}],{start,end},analyses);
  assert.deepEqual(result.trades.map(t=>t.token_address),['Token',null,'LedgerOnly','OtherChainToken']);
  assert(result.known.has('user:7'));
  assert.equal(result.trades[0].user_id,'user:7');
  assert.equal(result.trades[0].t,start+21);
  assert.equal(calls[0].params[2],Date.parse(snapshot.as_of)+1);
  assert.deepEqual(calls[0].params[3],['7']);
  assert.deepEqual(calls[0].params[4],['7']);
  assert.deepEqual(calls[0].params[5],['3']);
  assert.deepEqual(calls[0].params[6],[start+20]);
  assert.deepEqual(calls[0].params[7],[Math.min(start+20+86400000,end+86400000,Date.parse(snapshot.as_of)+1)]);
  assert.match(calls[0].sql,/JOIN UNNEST\(\$5::text\[\]/);
  assert.match(calls[0].sql,/transaction_time>TO_TIMESTAMP\(win\.window_start/);
  assert.match(calls[0].sql,/LEFT JOIN wallet_map/);
  const swapCall=calls.find(c=>c.sql.includes('FROM public.amm_transaction_data'));
  assert.deepEqual(swapCall.params[2],['unique','multi','missing']);
  assert.match(swapCall.sql,/chain_id=\$2::integer/);
  assert.match(swapCall.sql,/created_at<=\$1/);
  const ledgerCall=calls.find(c=>c.sql.includes('FROM public.ledger_v2'));
  assert.match(ledgerCall.sql,/status='confirmed'/);
  assert.match(ledgerCall.sql,/confirmed_at<=\$1/);
  assert.deepEqual(ledgerCall.params[3],['7']);
  assert.match(productChainTradeSql(),/COUNT\(DISTINCT t\.user_id\)=1/);
  assert.match(productChainTradeSql(),/COUNT\(DISTINCT t\.transaction_time\)=1/);
  assert.match(productChainTradeSql(),/LIMIT 20001/);
  assert.equal(MAX_TRADE_ROWS,20000);
  assert.equal(HASH_BATCH_SIZE,2000);
  assert(!productChainTradeSql().includes('currency_type AS token_address'));
 }finally{remote.query=original}
});

test('no valid analysis window means no expensive transaction or token query',async()=>{
 const original=remote.query;
 try{
  remote.query=async()=>{throw new Error('must not query')};
  const result=await productChainTrades(snapshot,[{id:'user:7'}],{start,end},[]);
  assert.deepEqual(result.trades,[]);
  assert.equal(result.known.size,0);
  assert.equal(result.error,null);
 }finally{remote.query=original}
});

test('query, account and token enrichment failures remain unknown; anonymous users never guess numeric identities',async()=>{
 const original=remote.query;
 try{
  for(const failure of ['trade','account','token']){
   remote.query=async(sql)=>{
    const kind=sql.includes('trade_groups AS')?'trade':sql.includes('FROM public.account_v2')?'account':'token';
    if(kind===failure)throw new Error('unavailable');
    if(kind==='trade')return [{account_id:'7',chain:'3',transaction_hash:'h',t:start+21}];
    if(kind==='account')return [{account_id:'7'}];
    return [{tx_hash:'h',token_address:'Token'}];
   };
   const result=await productChainTrades(snapshot,[{id:'user:7'}],{start,end},analyses);
   assert.equal(result.known,null);assert.match(result.error,/未知/);assert.deepEqual(result.trades,[]);
  }
  remote.query=async()=>{throw new Error('must not query')};
  assert.equal((await productChainTrades(snapshot,[{id:'anon:7'}],{start,end},[])).known.size,0);
 }finally{remote.query=original}
});
