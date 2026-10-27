process.env.DB_PATH=':memory:'
const {test}=require('node:test'),assert=require('node:assert/strict'),{valueReport}=require('../src/services/assetValuation')
const now=10000000,base=()=>({note:'',chains:['BNB','SOL','USDC','ETH'].map(symbol=>({snapshots:[{hour:1,state:'complete',balances:[{symbol,amount:'2'}]}]}))}),quotes=[['BNB',700],['SOL',100],['USDC',.999],['ETH',2000]].map(([symbol,usd])=>({symbol,usd,quoted_at:now}))
test('USD report sums each asset with its market quote including stablecoin deviation',()=>{const r=valueReport(base(),quotes,now);assert.equal(r.total_usd,5601.998);assert.equal(r.chains[2].snapshots[0].total_usd,1.998)})
test('missing price, stale price or incomplete chain never produces a partial grand total',()=>{assert.equal(valueReport(base(),quotes.slice(1),now).total_usd,null);assert.equal(valueReport(base(),quotes,now+3600001).total_usd,null);const data=base();data.chains[0].snapshots[0].state='failed';assert.equal(valueReport(data,quotes,now).total_usd,null)})
test('reading reports never fetches prices; background refresh persists quotes without a page request',async()=>{
 const service=require('../src/services/assetValuation'),original=global.fetch;let calls=0
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>Object.fromEntries(['solana','binancecoin','ethereum','tether','usd-coin','global-dollar'].map(id=>[id,{usd:1,last_updated_at:Math.floor(Date.now()/1000)}]))}}
 try{
  assert.equal(service.valuate(base()).total_usd,null);assert.equal(calls,0)
  await service.prices();assert.equal(calls,1)
  assert.equal(service.valuate(base()).total_usd,8);assert.equal(calls,1)
  await service.prices();assert.equal(calls,1)
 }finally{global.fetch=original}
})
