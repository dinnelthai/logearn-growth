'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const remote=require('../src/data/hologres')
const {cohortTrades,cohortTradeSql,DAY}=require('../src/data/growthInsights')
const start=Date.parse('2026-10-01T00:00:00Z'),end=start+DAY
const asOf=Date.parse('2026-10-30T00:00:00Z')
const snapshot={snapshot_cutoff:new Date(asOf+1000).toISOString(),as_of:new Date(asOf).toISOString()}
const row=(id,firstSeen,firstChip)=>({user_key:id,first_seen_at:firstSeen,first_chip_at:firstChip})

test('trade query is bounded to mature first-analysis windows and verified account identities',async()=>{
 const original=remote.query,calls=[]
 remote.query=async(sql,params)=>{
  calls.push({sql,params})
  if(sql.includes('trade_groups AS'))return [{
   account_id:'1',chain:'3',transaction_hash:'after-chip',
   transaction_time:new Date(start+DAY+1000).toISOString(),trade_value:'12'
  }]
  if(sql.includes('FROM public.account_v2'))return [{account_id:'1'},{account_id:'2'}]
  throw Error('unexpected query')
 }
 try{
  const rows=[
   row('user:1',start+100,start+200),
   row('user:2',start+300,start+400),
   row('user:3',start+500,null),
   row('user:4',start+600,asOf),
   row('anonymous:a',start+700,start+800)
  ]
  const result=await cohortTrades(snapshot,rows,{start,end})
  assert.equal(result.error,null)
  assert.equal(result.windows,2)
  assert.equal(result.association,'user-level-after-first-analysis')
  assert.deepEqual([...result.known],['user:1','user:2'])
  assert.equal(result.trades.length,1)
  assert.equal(calls.length,2)
  const query=calls.find(x=>x.sql.includes('trade_groups AS'))
  assert.deepEqual(query.params[3],['1','2'])
  assert.deepEqual(query.params[4],['1','2'])
  assert.deepEqual(query.params[5],[start+200,start+400])
  assert.deepEqual(query.params[6],[start+200+7*DAY,start+400+7*DAY])
  assert.match(query.sql,/JOIN UNNEST\(\$5::text\[\],\$6::double precision\[\],\$7::double precision\[\]\)/)
  assert.match(query.sql,/t\.transaction_time>=TO_TIMESTAMP\(win\.window_start/)
  assert.match(query.sql,/t\.transaction_time<TO_TIMESTAMP\(win\.window_end/)
  assert.match(query.sql,/JOIN valid_map v ON v\.user_id=t\.user_id/)
  assert.match(query.sql,/LIMIT 20001/)
 }finally{remote.query=original}
})

test('no mature first-analysis cohort skips trade and account queries',async()=>{
 const original=remote.query
 try{
  remote.query=async()=>{throw Error('must not query')}
  const result=await cohortTrades(snapshot,[
   row('user:1',start+100,null),
   row('user:2',start+200,asOf-3*DAY),
   row('user:3',start+400,asOf)
  ],{start,end})
  assert.deepEqual(result.trades,[])
  assert.equal(result.known.size,0)
  assert.equal(result.windows,0)
  assert.equal(result.error,null)
 }finally{remote.query=original}
})

test('trade or account source failures stay unknown rather than zero',async()=>{
 const original=remote.query
 const rows=[row('user:1',start+100,start+200)]
 try{
  for(const failure of ['trade','account']){
   remote.query=async(sql)=>{
    const kind=sql.includes('trade_groups AS')?'trade':'account'
    if(kind===failure)throw Error('offline')
    return kind==='trade'?[]:[{account_id:'1'}]
   }
   const result=await cohortTrades(snapshot,rows,{start,end})
   assert.equal(result.known,null)
   assert.match(result.error,/不可用/)
   assert.deepEqual(result.trades,[])
  }
 }finally{remote.query=original}
})

test('trade SQL reuses verified wallet precedence and exact post-analysis window boundaries',()=>{
 const sql=cohortTradeSql()
 assert.match(sql,/LEFT JOIN public\.user_account/)
 assert.match(sql,/LEFT JOIN wallet_map/)
 assert.match(sql,/LEFT JOIN public\.account_v2/)
 assert.match(sql,/JOIN valid_map v ON v\.user_id=t\.user_id/)
 assert.match(sql,/win\.window_start/)
 assert.match(sql,/win\.window_end/)
 assert.match(sql,/t\.created_time<=\$1/)
 assert.match(sql,/t\.transaction_time<=\$1/)
});

test('trade lookup does not spend query budget on registered first analyses after day seven',async()=>{
 const original=remote.query,calls=[];
 remote.query=async(sql,params)=>{calls.push({sql,params});
  return sql.includes('trade_groups AS')?[]:[{account_id:'1'}]};
 try{
  const registered={available:true,rows:[
   {user_key:'user:1',registered_at:start,first_chip_at:start+7*DAY-1},
   {user_key:'user:2',registered_at:start,first_chip_at:start+7*DAY},
   {user_key:'user:3',registered_at:start,first_chip_at:start+8*DAY}
  ]};
  const out=await cohortTrades(snapshot,[],{start,end},registered);
  assert.equal(out.windows,1);
  assert.equal(calls.length,2);
  const trade=calls.find(c=>c.sql.includes('trade_groups AS'));
  assert.deepEqual(trade.params[3],['1']);
  assert.deepEqual(trade.params[5],[start+7*DAY-1]);
 }finally{remote.query=original}
});
