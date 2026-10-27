const db=require('../db/connection'),assets=require('./platformAssets'),{cachedPrices}=require('./assetValuation'),remote=require('../data/hologres')
async function list({chain='all',search='',page=1}={}){
 assets.report(1)
 const prices=new Map(cachedPrices().filter(q=>Date.now()-q.quoted_at<=3600000).map(q=>[q.symbol,q.usd])),rows=[]
 for(const c of assets.CHAINS.filter(c=>chain==='all'||c.id===chain)){
  const run=db.prepare("SELECT hour,finished_at FROM platform_asset_runs WHERE chain=? AND state='complete' ORDER BY hour DESC LIMIT 1").get(c.id)
  if(!run)continue
  const wallets=new Map()
  for(const b of db.prepare('SELECT * FROM platform_asset_balances WHERE chain=? AND hour=?').all(c.id,run.hour)){
   if(!wallets.has(b.address))wallets.set(b.address,{chain:c.id,chain_name:c.name,family:c.family,address:b.address,finished_at:run.finished_at,balances:[],total_usd:0,owners:[]})
   const row=wallets.get(b.address),amount=assets.decimal(b.raw_amount,b.decimals),value=prices.has(b.symbol)?Number(amount)*prices.get(b.symbol):null
   row.balances.push({symbol:b.symbol,amount,value_usd:value});row.total_usd=row.total_usd===null||value===null?null:row.total_usd+value
  }
  rows.push(...wallets.values())
 }
 if(rows.length&&process.env.ANALYTICS_STORAGE==='hologres'){
  const owners=await remote.query(`SELECT DISTINCT w.chain_family,w.address,a.account_id::text AS user_id,i.provider,i.subject FROM public.wallet_v2 w JOIN public.account_v2 a ON a.account_id=w.account_id LEFT JOIN public.account_identity_v2 i ON i.account_id=a.account_id AND i.verified=true WHERE w.status IN ('active','archived') AND (CASE WHEN w.chain_family='evm' THEN LOWER(w.address) ELSE w.address END)=ANY($1::text[])`,[[...new Set(rows.map(r=>r.address))]])
  const index=new Map()
  for(const o of owners){const key=o.chain_family+':'+(o.chain_family==='evm'?o.address.toLowerCase():o.address);if(!index.has(key))index.set(key,new Map());const users=index.get(key);if(!users.has(o.user_id))users.set(o.user_id,{user_id:o.user_id,logins:[]});if(o.provider&&o.subject)users.get(o.user_id).logins.push({provider:o.provider,account:o.subject})}
  for(const r of rows)r.owners=[...(index.get(r.family+':'+r.address)?.values()||[])]
 }
 const query=search.trim().toLowerCase(),filtered=rows.filter(r=>!query||[r.address,...r.owners.flatMap(o=>[o.user_id,...o.logins.map(l=>l.account)])].some(s=>s.toLowerCase().includes(query)))
 filtered.sort((a,b)=>(b.total_usd??-1)-(a.total_usd??-1)||a.address.localeCompare(b.address))
 const total=filtered.length,pages=Math.max(1,Math.ceil(total/25));page=Math.min(page,pages)
 return {rows:filtered.slice((page-1)*25,page*25),total,page,pages,page_size:25}
}
module.exports={list}
