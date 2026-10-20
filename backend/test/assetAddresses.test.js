process.env.DB_PATH=':memory:'
const {test}=require('node:test'),assert=require('node:assert/strict'),db=require('../src/db/connection'),assets=require('../src/services/platformAssets'),remote=require('../src/data/hologres'),service=require('../src/services/assetAddresses')
test('address ranking uses completed snapshots, maps owners and searches login identities',async()=>{
 assets.report();require('../src/services/assetValuation').cachedPrices()
 const hour=Date.now(),a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40)
 db.prepare("INSERT INTO platform_asset_runs(chain,hour,state,started_at,finished_at) VALUES('56',?,'complete',?,?)").run(hour,hour,hour)
 for(const [address,raw]of [[a,'1000000000000000000'],[b,'3000000000000000000']])db.prepare("INSERT INTO platform_asset_balances VALUES('56',?,?,'BNB',?,18)").run(hour,address,raw)
 db.prepare("INSERT INTO platform_asset_prices VALUES('BNB',10,?,?)").run(hour,hour)
 const original=remote.query,storage=process.env.ANALYTICS_STORAGE;process.env.ANALYTICS_STORAGE='hologres'
 remote.query=async()=>[{chain_family:'evm',address:b.toUpperCase(),user_id:'42',provider:'email',subject:'owner@example.com'},{chain_family:'evm',address:b,user_id:'43',provider:null,subject:null}]
 try{
  const data=await service.list();assert.equal(data.rows[0].address,b);assert.equal(data.rows[0].total_usd,30);assert.equal(data.rows[0].owners.length,2)
  const found=await service.list({search:'owner@example.com'});assert.equal(found.total,1);assert.equal(found.rows[0].owners[0].user_id,'42')
  assert.equal((await service.list({chain:'3'})).total,0)
  db.prepare('DELETE FROM platform_asset_prices').run();assert.equal((await service.list()).rows[0].total_usd,null)
 }finally{remote.query=original;if(storage===undefined)delete process.env.ANALYTICS_STORAGE;else process.env.ANALYTICS_STORAGE=storage}
})
