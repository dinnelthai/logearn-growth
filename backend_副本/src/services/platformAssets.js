const db=require('../db/connection'),remote=require('../data/hologres')
const HOUR=3600000
const CHAINS=[{id:'56',name:'BSC',family:'evm',env:'ASSET_RPC_BSC',native:'BNB',tokens:[['BNB',18,null],['USDT',18,'0x55d398326f99059ff775485246999027b3197955'],['USDC',18,'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d']]},{id:'3',name:'Solana',family:'solana',env:'ASSET_RPC_SOLANA',native:'SOL',tokens:[['SOL',9,null],['USDT',6,'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'],['USDC',6,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']]},{id:'5042',name:'Arc',family:'evm',env:'ASSET_RPC_ARC',tokens:[['USDC',18,null]]},{id:'4663',name:'Robinhood',family:'evm',env:'ASSET_RPC_ROBINHOOD',tokens:[['ETH',18,null],['USDG',6,'0x5fc5360d0400a0fd4f2af552add042d716f1d168']]}]
function init(){db.exec(`CREATE TABLE IF NOT EXISTS platform_asset_runs(chain TEXT NOT NULL,hour INTEGER NOT NULL,state TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,wallets INTEGER NOT NULL DEFAULT 0,scanned INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,block_ref TEXT,error TEXT,PRIMARY KEY(chain,hour));CREATE TABLE IF NOT EXISTS platform_asset_balances(chain TEXT NOT NULL,hour INTEGER NOT NULL,address TEXT NOT NULL,symbol TEXT NOT NULL,raw_amount TEXT NOT NULL,decimals INTEGER NOT NULL,PRIMARY KEY(chain,hour,address,symbol));`)}
function decimal(raw,decimals){const n=BigInt(raw);if(n<0n)throw Error('Invalid balance');const digits=n.toString().padStart(decimals+1,'0');return decimals?digits.slice(0,-decimals)+'.'+digits.slice(-decimals):digits}
let requestId=0,nextRequest=0
async function rpc(url,method,params){
 for(let attempt=0;attempt<3;attempt++){
  const wait=Math.max(0,nextRequest-Date.now());nextRequest=Math.max(nextRequest,Date.now())+150
  if(wait)await new Promise(r=>setTimeout(r,wait))
  try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('HTTP '+response.status);const body=await response.json();if(body.error||body.result===undefined)throw Error('RPC error');return body.result}catch{if(attempt===2)throw Error(method+' 请求失败（超时、限流或节点异常）');await new Promise(r=>setTimeout(r,500*(attempt+1)))}
 }
}
async function walletBalances(chain,url,address,block,call=rpc){
 const out=[]
 for(const [symbol,decimals,contract]of chain.tokens){
  let amount
  if(chain.family==='evm'){
   const value=contract?await call(url,'eth_call',[{to:contract,data:'0x70a08231'+address.slice(2).padStart(64,'0')},block]):await call(url,'eth_getBalance',[address,block])
   if(typeof value!=='string'||!/^0x[0-9a-f]+$/i.test(value))throw Error('余额响应格式无效')
   amount=BigInt(value)
  }else if(!contract){const value=await call(url,'getBalance',[address,{commitment:'finalized',minContextSlot:Number(block)}]);if(!Number.isSafeInteger(value.value)||value.value<0)throw Error('SOL余额精度超限');amount=BigInt(value.value)}
  else{const value=await call(url,'getTokenAccountsByOwner',[address,{mint:contract},{encoding:'jsonParsed',commitment:'finalized',minContextSlot:Number(block)}]);if(!Array.isArray(value.value))throw Error('代币响应无效');amount=0n;for(const account of value.value){const info=account.account?.data?.parsed?.info;if(info?.mint!==contract||info?.owner!==address||info.tokenAmount?.decimals!==decimals||!/^\d+$/.test(info.tokenAmount?.amount))throw Error('代币精度或账户响应无效');amount+=BigInt(info.tokenAmount.amount)}}
  if(amount<0n)throw Error('余额无效');out.push({symbol,decimals,raw_amount:amount.toString()})
 }
 return out
}
async function collectChain(chain,hour){
 const url=process.env[chain.env];if(!url)return
 const previous=db.prepare('SELECT * FROM platform_asset_runs WHERE chain=? AND hour=?').get(chain.id,hour)
 if(previous&&(previous.state==='complete'||previous.state==='running'&&previous.started_at>Date.now()-2*HOUR||previous.state==='failed'&&previous.started_at>Date.now()-10*60000))return
 db.prepare("INSERT INTO platform_asset_runs(chain,hour,state,started_at) VALUES(?,?,'running',?) ON CONFLICT(chain,hour) DO UPDATE SET state='running',started_at=excluded.started_at,finished_at=NULL,scanned=0,failed=0,error=NULL").run(chain.id,hour,Date.now())
 try{
  if(chain.family==='evm'){const id=await rpc(url,'eth_chainId',[]);if(BigInt(id)!==BigInt(chain.id))throw Error('RPC链ID不匹配，停止采集')}
  else{const genesis=await rpc(url,'getGenesisHash',[]);if(genesis!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Solana RPC非主网，停止采集')}
  const block=chain.family==='evm'?await rpc(url,'eth_blockNumber',[]):String(await rpc(url,'getSlot',[{commitment:'finalized'}]))
  const rows=await remote.query(`SELECT DISTINCT w.address FROM public.wallet_v2 w JOIN public.account_v2 a ON a.account_id=w.account_id WHERE w.chain_family=$1 AND w.status IN ('active','archived') AND NULLIF(BTRIM(w.address),'') IS NOT NULL`,[chain.family])
  const valid=chain.family==='evm'?/^0x[0-9a-fA-F]{40}$/:/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  if(rows.some(r=>!valid.test(r.address)))throw Error('钱包目录含无效地址，需先修复以保证全量统计')
  const addresses=[...new Set(rows.map(r=>chain.family==='evm'?r.address.toLowerCase():r.address))]
  db.prepare('DELETE FROM platform_asset_balances WHERE chain=? AND hour=?').run(chain.id,hour)
  db.prepare('UPDATE platform_asset_runs SET wallets=?,block_ref=? WHERE chain=? AND hour=?').run(addresses.length,block,chain.id,hour)
  let cursor=0,failed=0,scanned=0
  async function worker(){while(cursor<addresses.length){const address=addresses[cursor++];try{const balances=await walletBalances(chain,url,address,block);db.exec('BEGIN');try{for(const b of balances)db.prepare('INSERT INTO platform_asset_balances VALUES(?,?,?,?,?,?)').run(chain.id,hour,address,b.symbol,b.raw_amount,b.decimals);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}catch{failed++}scanned++;db.prepare('UPDATE platform_asset_runs SET scanned=?,failed=? WHERE chain=? AND hour=?').run(scanned,failed,chain.id,hour)}}
  await Promise.all([worker(),worker(),worker()])
  db.prepare('UPDATE platform_asset_runs SET state=?,finished_at=?,error=? WHERE chain=? AND hour=?').run(failed?'failed':'complete',Date.now(),failed?'部分钱包采集失败，未将此批次计入完整走势':null,chain.id,hour)
 }catch(e){db.prepare("UPDATE platform_asset_runs SET state='failed',finished_at=?,error=? WHERE chain=? AND hour=?").run(Date.now(),e.message.includes('RPC链')||e.message.includes('主网')||e.message.includes('目录')?e.message:'余额采集失败，等待自动重试',chain.id,hour)}
}
let running=false,stopScheduler=null
function recoverInterruptedRuns(){init();db.prepare("UPDATE platform_asset_runs SET state='failed',started_at=0,finished_at=?,error='服务重启中断采集，等待自动重试' WHERE state='running'").run(Date.now())}
async function tick(){if(running||process.env.ANALYTICS_STORAGE!=='hologres')return;running=true;try{init();const hour=Math.floor(Date.now()/HOUR)*HOUR;await Promise.all([require('./assetValuation').prices(),...CHAINS.map(c=>collectChain(c,hour))])}finally{running=false}}
function start(){
 init();if(process.env.ANALYTICS_STORAGE!=='hologres')return()=>{}
 if(stopScheduler)return stopScheduler
 recoverInterruptedRuns()
 const run=()=>tick().catch(e=>console.error('Platform assets:',e.message))
 const timer=setInterval(run,60000);timer.unref()
 stopScheduler=()=>{clearInterval(timer);stopScheduler=null}
 run();return stopScheduler
}
function report(days=7){init();const since=Date.now()-days*24*HOUR;return {interval_hours:1,scope:'注册用户关联的活跃及归档钱包，按链和地址去重；EVM地址在各支持链查询',chains:CHAINS.map(c=>{
 const latest=db.prepare('SELECT * FROM platform_asset_runs WHERE chain=? ORDER BY hour DESC LIMIT 1').get(c.id)||null
 const runs=db.prepare("SELECT * FROM platform_asset_runs WHERE chain=? AND hour>=? ORDER BY hour").all(c.id,since)
 const snapshots=runs.map(run=>{const totals=new Map();if(run.state==='complete')for(const b of db.prepare('SELECT symbol,raw_amount,decimals FROM platform_asset_balances WHERE chain=? AND hour=?').all(c.id,run.hour)){const old=totals.get(b.symbol)||{raw:0n,decimals:b.decimals};old.raw+=BigInt(b.raw_amount);totals.set(b.symbol,old)}return {...run,balances:c.tokens.map(([symbol,decimals])=>({symbol,amount:run.state==='complete'?decimal(totals.get(symbol)?.raw||0n,decimals):null}))}})
 return {id:c.id,name:c.name,configured:!!process.env[c.env],latest,snapshots}
 }),note:'按币种展示链上余额，不含其他代币、DeFi仓位及价格估值；RPC无法区分平台锁定额。Solana为finalized读取，整批存在采集时间差；BSC固定区块读取。失败批次不显示为零。'}}
module.exports={start,tick,report,decimal,walletBalances,CHAINS,recoverInterruptedRuns}
