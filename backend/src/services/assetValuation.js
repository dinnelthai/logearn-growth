const db=require('../db/connection')
const IDS={SOL:'solana',BNB:'binancecoin',ETH:'ethereum',USDT:'tether',USDC:'usd-coin',USDG:'global-dollar'}
let pending=null
function init(){db.exec('CREATE TABLE IF NOT EXISTS platform_asset_prices(symbol TEXT PRIMARY KEY,usd REAL NOT NULL,quoted_at INTEGER NOT NULL,fetched_at INTEGER NOT NULL)')}
async function prices(){init();const read=()=>db.prepare('SELECT * FROM platform_asset_prices').all();let rows=read();if(rows.length===6&&rows.every(r=>Date.now()-r.fetched_at<300000))return rows
 if(!pending)pending=(async()=>{try{const response=await fetch('https://api.coingecko.com/api/v3/simple/price?'+new URLSearchParams({ids:Object.values(IDS).join(','),vs_currencies:'usd',include_last_updated_at:'true'}),{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json(),now=Date.now(),quotes=Object.entries(IDS).map(([symbol,id])=>({symbol,usd:data[id]?.usd,quoted_at:Number(data[id]?.last_updated_at)*1000}));if(quotes.some(q=>!Number.isFinite(q.usd)||q.usd<=0||!Number.isFinite(q.quoted_at)||q.quoted_at>now+60000||now-q.quoted_at>3600000))throw Error();db.exec('BEGIN');try{const put=db.prepare('INSERT OR REPLACE INTO platform_asset_prices VALUES(?,?,?,?)');for(const q of quotes)put.run(q.symbol,q.usd,q.quoted_at,now);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}catch{}return read()})().finally(()=>pending=null)
 return pending
}
function valueReport(report,quotes,now=Date.now()){
 const lookup=new Map(quotes.filter(q=>now-q.quoted_at<=3600000).map(q=>[q.symbol,q]));
 for(const c of report.chains)for(const s of c.snapshots){s.balances=s.balances.map(b=>({...b,price_usd:lookup.get(b.symbol)?.usd??null,value_usd:b.amount==null||!lookup.has(b.symbol)?null:Number(b.amount)*lookup.get(b.symbol).usd}));s.total_usd=s.state==='complete'&&s.balances.every(b=>b.value_usd!=null)?s.balances.reduce((n,b)=>n+b.value_usd,0):null}
 const hours=[...new Set(report.chains.flatMap(c=>c.snapshots.map(s=>s.hour)))].sort((a,b)=>a-b)
 report.usd_history=hours.map(hour=>{const runs=report.chains.map(c=>c.snapshots.find(s=>s.hour===hour));return {hour,total_usd:runs.length===4&&runs.every(s=>s?.total_usd!=null)?runs.reduce((n,s)=>n+s.total_usd,0):null}})
 report.total_usd=report.usd_history.filter(p=>p.total_usd!=null).at(-1)?.total_usd??null
 report.valuation={source:'CoinGecko',quoted_at:quotes.length?Math.min(...quotes.map(q=>q.quoted_at)):null,available:lookup.size===6,stale:quotes.some(q=>now-q.quoted_at>300000),basis:'所有快照按当前市场价格统一重估，并非当时历史市值；稳定币同样采用市场报价。缺少报价或任一链完整快照时，总额显示未知。'}
 report.note=report.note.replace('及价格估值','').replace('不含其他代币、DeFi仓位','仅覆盖已配置币种，不含其他代币、DeFi仓位')
 return report
}
async function valuate(report){return valueReport(report,await prices())}
module.exports={valuate,valueReport}
