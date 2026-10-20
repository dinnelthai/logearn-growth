process.env.DB_PATH=':memory:'
const {test}=require('node:test'),assert=require('node:assert/strict'),{decimal,walletBalances,CHAINS,report}=require('../src/services/platformAssets')
test('integer balances retain exact token decimals without float summation',()=>{assert.equal(decimal('1000000000000000001',18),'1.000000000000000001');assert.equal(decimal('1',6),'0.000001');assert.throws(()=>decimal('-1',6))})
test('BSC balance calls use fixed block, correct decimals and owner ABI',async()=>{const calls=[],address='0x'+'a'.repeat(40),r=await walletBalances(CHAINS[0],'rpc',address,'0x123',async(_u,m,p)=>{calls.push([m,p]);return '0x1'});assert.equal(r.length,3);assert(r.every(b=>b.raw_amount==='1'&&b.decimals===18));assert(calls.every(([,p])=>p.at(-1)==='0x123'));assert(calls[1][1][0].data.endsWith(address.slice(2)))})
test('Solana sums all token accounts per mint, preserves address case and requires decimals',async()=>{const c=CHAINS[1],address='CaseSensitiveOwner';const r=await walletBalances(c,'rpc',address,'100',async(_u,m,p)=>m==='getBalance'?{value:1000000001}:{value:[1,2].map(n=>({account:{data:{parsed:{info:{mint:p[1].mint,owner:address,tokenAmount:{amount:String(n),decimals:6}}}}}}))});assert.equal(r[0].raw_amount,'1000000001');assert.equal(r[1].raw_amount,'3');assert.equal(r[2].raw_amount,'3')})
test('missing networks remain unconfigured with no fabricated zero snapshots',()=>{const data=report();assert.equal(data.chains.length,4);assert(data.chains.every(c=>c.snapshots.length===0));assert(data.chains.filter(c=>['5042','4663'].includes(c.id)).every(c=>!c.configured))})
test('Arc native USDC counts once with 18 decimals; Robinhood separates ETH and USDG',async()=>{
 const address='0x'+'a'.repeat(40),arc=CHAINS.find(c=>c.id==='5042'),rh=CHAINS.find(c=>c.id==='4663')
 const a=await walletBalances(arc,'rpc',address,'0x1',async(_u,m)=>{assert.equal(m,'eth_getBalance');return '0xde0b6b3a7640000'});assert.equal(a.length,1);assert.equal(decimal(a[0].raw_amount,a[0].decimals),'1.000000000000000000')
 const r=await walletBalances(rh,'rpc',address,'0x1',async(_u,m)=>m==='eth_getBalance'?'0x0':'0xf4240');assert.deepEqual(r.map(x=>[x.symbol,decimal(x.raw_amount,x.decimals)]),[['ETH','0.000000000000000000'],['USDG','1.000000']])
})
test('restart recovers interrupted runs while preserving completed snapshots',()=>{
 const db=require('../src/db/connection'),assets=require('../src/services/platformAssets'),hour=Math.floor(Date.now()/3600000)*3600000
 db.prepare("INSERT INTO platform_asset_runs(chain,hour,state,started_at) VALUES(?,?,'running',?)").run('56',hour,Date.now())
 db.prepare("INSERT INTO platform_asset_runs(chain,hour,state,started_at) VALUES(?,?,'complete',?)").run('3',hour,Date.now())
 assets.recoverInterruptedRuns()
 const interrupted=db.prepare('SELECT * FROM platform_asset_runs WHERE chain=? AND hour=?').get('56',hour)
 assert.equal(interrupted.state,'failed');assert.equal(interrupted.started_at,0)
 assert.equal(db.prepare('SELECT state FROM platform_asset_runs WHERE chain=? AND hour=?').get('3',hour).state,'complete')
})
