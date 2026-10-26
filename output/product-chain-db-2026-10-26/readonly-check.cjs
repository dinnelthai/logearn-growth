const path=require('node:path'),root=path.resolve(__dirname,'../..')
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true})
process.env.PG_CONNECT_TIMEOUT_MS='10000'
const remote=require(path.join(root,'backend/src/data/hologres'))
const {tradeIdentityCte}=require(path.join(root,'backend/src/data/tradeIdentity'))
const {productChainTrades}=require(path.join(root,'backend/src/data/productChainTrades'))
;(async()=>{const cutoff=new Date().toISOString();try{
 const rows=await remote.query(`${tradeIdentityCte()} SELECT v.account_id::text,MAX(t.transaction_time) AS last_at FROM public.trading_transaction t JOIN valid_map v ON v.user_id=t.user_id WHERE t.created_time<=$1::timestamptz AND t.transaction_time<=$1::timestamptz GROUP BY v.account_id ORDER BY last_at DESC LIMIT 3`,[cutoff])
 const start=Math.min(...rows.map(r=>Date.parse(r.last_at)))-86400000,facts=await productChainTrades({snapshot_cutoff:cutoff,as_of:cutoff},rows.map(r=>({id:'user:'+r.account_id})),{start,end:Date.parse(cutoff)})
 const report={checked_at:cutoff,source:'trading_transaction + ledger_v2 + amm_transaction_data_rt_v1_<chain>',sample_accounts:rows.length,known_accounts:facts.known?.size??null,records:facts.trades.length,token_resolved:facts.trades.filter(t=>t.token_address).length,token_unknown:facts.trades.filter(t=>!t.token_address).length,chains:[...new Set(facts.trades.map(t=>t.chain))],error:facts.error,coverage:facts.coverage}
 require('node:fs').writeFileSync(path.join(__dirname,'readonly-check.json'),JSON.stringify(report,null,2)+'\n');console.log(report)
 }catch(e){console.error(e.message);process.exitCode=1}finally{await remote.close()}})()
