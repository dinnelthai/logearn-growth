// Same observed token visit, same user/token/chain, strictly ordered evidence.
const {deviceInfo}=require('./deviceInfo')
const {normalizeAddress}=require('../data/productChainTrades')
const WINDOW=86400000,labels=['Token详情','主动发起分析','分析成功','提交交易','数据库确认至少一笔交易']
const properties=e=>e.properties||{},type=e=>e.raw_name||e.type
const visitKey=(p,e={})=>{const visit=String(p.token_visit_id||e.token_visit_id||''),token=p.token_address||e.token_address,chain=String(p.chain??e.chain??'');return visit&&token&&chain?JSON.stringify([visit,token,chain]):null}
function productChain(users,{start,end,asOf},analysisRows,tradeFacts={trades:[],known:null,error:'交易事实未加载，结果未知'}){
 const visits=[],lists={};let details=0,versionedDetails=0,missingVisit=0,missingSession=0,requests=0,missingRequestVisit=0,tradeEvents=0,missingTradeVisit=0
 const tradesByUser=new Map()
 for(const trade of tradeFacts.trades||[]){if(!tradesByUser.has(trade.user_id))tradesByUser.set(trade.user_id,[]);tradesByUser.get(trade.user_id).push(trade)}
 const byUser=new Map()
 for(const r of analysisRows){if(!byUser.has(r.user_id))byUser.set(r.user_id,[]);byUser.get(r.user_id).push(r);if(r.started_at>=start&&r.started_at<end&&r.trigger==='user_action'){requests++;if(!r.token_visit_id)missingRequestVisit++}}
 for(const u of users){
  const events=u.events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).slice().sort((a,b)=>a.t-b.t),seen=new Set(),rs=byUser.get(u.id)||[]
  const buckets=new Map(),requestBuckets=new Map()
  for(const e of events){const key=visitKey(properties(e),e);if(key){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(e)}}
  for(const r of rs){const key=visitKey(r);if(key){if(!requestBuckets.has(key))requestBuckets.set(key,[]);requestBuckets.get(key).push(r)}}
  for(const e of events){if(e.t<start||e.t>=end)continue;const p=properties(e);if(['trade_submitted','trade_succeeded','trade_failed'].includes(type(e))){tradeEvents++;if(!p.token_visit_id)missingTradeVisit++}}
  for(const e of events){if(e.type!=='token'||e.t<start||e.t>=end)continue;details++;const p=properties(e);if(p.diagnostics_version==='web-core-chain-v1')versionedDetails++;const visit=String(p.token_visit_id||e.token_visit_id||''),token=p.token_address||e.token_address,chain=String(p.chain??e.chain??'');if(!e.session_id)missingSession++
   if(!visit||!token||!chain){missingVisit++;continue}
   const key=JSON.stringify([visit,token,chain]);if(seen.has(key))continue;seen.add(key)
   const deadline=e.t+WINDOW,related=buckets.get(key)||[]
   const attempts=(requestBuckets.get(key)||[]).filter(r=>r.trigger==='user_action'&&r.started_at>=e.t&&r.started_at<deadline)
   // Equal millisecond timestamps can be paired only by explicit request identity;
   // all distinct business stages otherwise require a later timestamp.
   const successes=attempts.filter(r=>r.state==='success'&&r.finished_at!=null&&r.finished_at>=r.started_at&&r.finished_at<deadline).sort((a,b)=>a.finished_at-b.finished_at)
   const completed=successes[0],submitted=completed?related.filter(t=>type(t)==='trade_submitted'&&t.t>completed.finished_at&&t.t<deadline):[]
   const candidates=(tradesByUser.get(u.id)||[]).filter(t=>completed&&Number.isFinite(t.t)&&t.t>completed.finished_at&&t.t<deadline&&t.t<=asOf&&String(t.chain)===chain)
   const confirmed=tradeFacts.known?.has(u.id)===true&&!tradeFacts.error&&candidates.some(t=>t.valid!==false&&t.transaction_hash&&t.token_address&&normalizeAddress(t.token_address)===normalizeAddress(token))
   const tradeUnknown=!confirmed // Partial business/index coverage cannot prove absence, even for a known account.
   visits.push({user_id:u.id,source:u.source||'未知',device:deviceInfo(e).device,user_stage:u.first_seen_at==null?'未知':u.first_seen_at>=start?'本期首次观测':'此前已观测',trade_unknown:tradeUnknown,entry_module:p.entry_module||'unknown',stage:confirmed?4:submitted.length?3:completed?2:attempts.length?1:0,mature:asOf>=deadline})
  }
 }
 function summary(rows,key){const stages=labels.map((label,i)=>{const selected=rows.filter(r=>r.stage>=i),list_key=key+':stage:'+i;lists[list_key]=[...new Set(selected.map(r=>r.user_id))];return {label,visits:selected.length,users:lists[list_key].length,list_key}}),drops=labels.slice(0,-1).map((label,i)=>{const eligible=rows.filter(r=>r.mature&&r.stage>=i&&!(i>=2&&r.stage===i&&r.trade_unknown)),selected=eligible.filter(r=>r.stage===i),unknownRows=rows.filter(r=>r.mature&&r.stage===i&&i>=2&&r.trade_unknown),unknown_list_key=key+':unknown:'+i,list_key=key+':drop:'+i;lists[unknown_list_key]=[...new Set(unknownRows.map(r=>r.user_id))];lists[list_key]=[...new Set(selected.map(r=>r.user_id))];return {from:label,to:labels[i+1],unknown:unknownRows.length,unknown_users:lists[unknown_list_key].length,unknown_list_key,eligible:eligible.length,visits:selected.length,users:lists[list_key].length,rate:eligible.length?selected.length/eligible.length:null,list_key}});return {visits:rows.length,users:new Set(rows.map(r=>r.user_id)).size,pending:rows.filter(r=>!r.mature).length,stages,drops}}
 const overall=summary(visits,'chain'),dimensions=Object.fromEntries(['source','device','user_stage','entry_module'].map(dim=>{const groups=new Map();for(const row of visits){if(!groups.has(row[dim]))groups.set(row[dim],[]);groups.get(row[dim]).push(row)}return [dim,[...groups].map(([value,rows],i)=>({value,...summary(rows,'chain:'+dim+':'+i)})).sort((a,b)=>b.visits-a.visits)]}))
 return {lists,payload:{...overall,dimensions,quality:{detail_events:details,versioned_detail_events:versionedDetails,missing_visit_context:missingVisit,missing_session:missingSession,manual_requests:requests,requests_missing_visit:missingRequestVisit,trade_source:'trading_transaction',trade_token_source:'ledger_v2 + amm_transaction_data_rt_v1_<chain>',trade_records_missing_token:(tradeFacts.trades||[]).filter(t=>!t.token_address).length,trade_query_error:tradeFacts.error||null,trade_unknown_visits:visits.filter(r=>r.stage>=2&&r.trade_unknown).length,trade_records:(tradeFacts.trades||[]).length,trade_events:tradeEvents,trades_missing_visit:missingTradeVisit},window_ms:WINDOW,coverage:'partial',definition:'按Token详情访问入组，主动分析按同用户、token_visit_id、Token和链关联。交易结果读取trading_transaction，以唯一已验证钱包映射账号，按已确认账号账本或链上索引的链和哈希关联无歧义Token，成交时间须晚于分析成功且在详情访问24小时内。数据库成交可独立证明提交，不依赖前端成功事件；无法证明同一访问直接导致成交，多次访问窗口可能重叠。身份未匹配、查询失败、Token关联缺失或歧义及覆盖未确认且未匹配到成交的访问单列未知，不计交易断点。人数每步去重；未成熟访问不列为断点。业务与索引覆盖仍为partial，未观测不代表没有交易。'}}
}
module.exports={productChain}
