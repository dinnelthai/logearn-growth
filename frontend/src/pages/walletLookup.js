import {getToken,notifyExpiredSession} from '../auth/authClient.js'
import './walletLookup.css'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/wallet-lookup'
const outflowBase=base+'/outflows'
const outflowChains=[['solana','Solana'],['bsc','BSC'],['robinhood','Robinhood'],['arc','Arc']]
export function normalizeWalletAddress(value){return /^0x[0-9a-f]{40}$/i.test(value)?value.toLowerCase():value}
export function parseWalletInputs(text){return text.split(/[\n,，;；]+/).map(s=>normalizeWalletAddress(s.trim())).filter(Boolean)}
export function walletResultStatus(record){return record.error?'error':record.accounts?.length?'matched':'unmatched'}
export function walletResultsCsv(records){
 const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'}
 const identities=items=>items.map(i=>`${i.provider} (${i.verified?'已验证':'未验证'}): ${normalizeWalletAddress(i.subject)}`).join('\n')
 const wallets=items=>items.map(w=>`${w.chain_family}${w.chain_id?' / '+w.chain_id:''}: ${normalizeWalletAddress(w.address)} (${w.status||'未知'})`).join('\n')
 const rows=[['查询内容','状态','用户 ID','登录身份','旧平台地址','新平台地址','错误信息']]
 for(const r of records){if(r.error)rows.push([r.value,'查询失败','','','','',r.error]);else if(!r.accounts.length)rows.push([r.value,'未匹配','','','','','']);else for(const a of r.accounts)rows.push([r.value,'已匹配',a.account_id,identities(a.identities),wallets(a.old_wallets),wallets(a.wallets),''])}
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
export function collectOldWalletSources(records){
 const sources=new Map()
 for(const record of records||[]){
  if(record.error||!Array.isArray(record.accounts))continue
  for(const account of record.accounts){
   for(const wallet of account.old_wallets||[]){
    const address=normalizeWalletAddress(String(wallet.address||'').trim())
    if(!address)continue
    const family=String(wallet.chain_family||'').toLowerCase()
    const key=`${family}:${address}`
    const current=sources.get(key)||{address,chain_family:family,chain_id:wallet.chain_id||null,account_ids:[]}
    const accountId=String(account.account_id)
    if(!current.account_ids.includes(accountId))current.account_ids.push(accountId)
    sources.set(key,current)
   }
  }
 }
 return [...sources.values()].map(({account_ids,...wallet})=>({...wallet,account_id:account_ids[0],account_ids}))
}
export function outflowResultsCsv(data){
 const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'}
 const rows=[['链','用户 ID','来源旧钱包','目标地址','Token','累计转出','当前余额','转出笔数','交易时间','TxHash']]
 for(const chain of data?.chains||[]){
  for(const source of chain.sources||[]){
   const totals=new Map((source.totals||[]).map(item=>[item.contract_address||`native:${item.symbol}`,item]))
   const balances=new Map((source.balances||[]).map(item=>[item.contract_address||`native:${item.symbol}`,item]))
   const keys=new Set([...totals.keys(),...balances.keys()])
   if(!keys.size)rows.push([chain.chain?.name,(source.account_ids||[]).join(';'),source.source_address,chain.target_address,'—','0','—',source.transfer_count||0,'',''])
   for(const key of keys){const total=totals.get(key),balance=balances.get(key);rows.push([chain.chain?.name,(source.account_ids||[]).join(';'),source.source_address,chain.target_address,total?.symbol||balance?.symbol,total?.amount??'0',balance?.amount??'—',source.transfer_count||0,'',''])}
   for(const transfer of source.transfers||[])rows.push([chain.chain?.name,(source.account_ids||[]).join(';'),source.source_address,chain.target_address,transfer.symbol,transfer.amount,'',1,transfer.timestamp,transfer.tx_hash])
  }
 }
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
function localDate(offsetDays=0){const date=new Date(Date.now()+7*3600000+offsetDays*86400000);return date.toISOString().slice(0,10)}
function tokenKey(item){return item.contract_address||`native:${item.symbol}`}

export function createWalletLookup(ctx){
 const host=()=>ctx.$('#as-output'),esc=ctx.esc
 let generation=0,records=[],busy=false,filter='all',outflowData=null,outflowBusy=false
 const entries=(items,formatter)=>items.length?items.map(formatter).join(''):'<span class="wl-empty">暂无</span>'
 const addresses=items=>entries(items,w=>`<div class="wl-address"><span class="wl-chain">${esc(w.chain_family)}${w.chain_id?' · '+esc(w.chain_id):''}</span><code>${esc(normalizeWalletAddress(w.address))}</code><small>${esc(w.status||'')}</small></div>`)
 const identities=items=>entries(items,i=>`<div class="wl-address"><span class="wl-chain">${esc(i.provider)} · ${i.verified?'已验证':'未验证'}</span><code>${esc(normalizeWalletAddress(i.subject))}</code></div>`)
 function renderResults(){
  const el=host().querySelector('[data-wallet-results]');if(!el)return
  const count=records.filter(r=>walletResultStatus(r)==='matched').length,failed=records.filter(r=>walletResultStatus(r)==='error').length,unmatched=records.length-count-failed,visible=records.filter(r=>filter==='all'||walletResultStatus(r)===filter)
  el.innerHTML=`<section class="a-card si-panel wl-results"><div class="wl-results-head"><div><h2>第一步 · 旧钱包查询结果</h2><p>${records.length?`共 ${records.length} 条输入 · ${count} 条已匹配 · ${records.length-count-failed} 条未找到${failed?' · '+failed+' 条失败':''}`:'显示本次查询结果'}</p></div><div class="wl-result-actions"><button type="button" class="a-button" data-wallet-download ${!visible.length||busy?'disabled':''}>下载当前筛选 CSV</button><button type="button" class="a-button" data-wallet-clear ${!records.length||busy?'disabled':''}>清空结果</button></div></div><div class="wl-filters" role="group" aria-label="筛选查询结果">${[['all','全部',records.length],['matched','已匹配',count],['unmatched','未匹配',unmatched],['error','查询失败',failed]].map(([key,label,n])=>`<button type="button" data-wallet-filter="${key}" aria-pressed="${filter===key}">${label} <span>${n}</span></button>`).join('')}</div>${visible.length?`<div class="wl-scroll"><table class="wl-table"><thead><tr><th>查询内容</th><th>状态 / 用户 ID</th><th>登录身份</th><th>旧平台地址</th><th>新平台地址</th></tr></thead><tbody>${visible.map(r=>r.error?`<tr><td><code>${esc(r.value)}</code></td><td><span class="wl-badge wl-error">查询失败</span><p>${esc(r.error)}</p></td><td colspan="3">—</td></tr>`:!r.accounts.length?`<tr><td><code>${esc(r.value)}</code></td><td><span class="wl-badge">未找到</span></td><td colspan="3">没有匹配的账号</td></tr>`:r.accounts.map((a,i)=>`<tr><td><code>${esc(r.value)}</code>${r.accounts.length>1?`<small>匹配 ${i+1} / ${r.accounts.length}</small>`:''}</td><td><span class="wl-badge wl-success">已匹配</span><strong class="wl-id">${esc(a.account_id)}</strong></td><td>${identities(a.identities||[])}</td><td>${addresses(a.old_wallets||[])}</td><td>${addresses(a.wallets||[])}</td></tr>`).join('')).join('')}</tbody></table></div>`:`<div class="wl-placeholder">${records.length?'当前筛选下暂无结果':'输入用户 ID 或地址后，点击查询'}</div>`}</section>`
  el.querySelector('[data-wallet-download]').onclick=()=>{const blob=new Blob([walletResultsCsv(visible)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='旧钱包查询结果.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  el.querySelector('[data-wallet-clear]').onclick=()=>{records=[];filter='all';outflowData=null;renderResults();renderOutflowResults()}
  el.querySelectorAll('[data-wallet-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.walletFilter;renderResults()})
 }
 function renderOutflowResults(){
  const el=host().querySelector('[data-outflow-results]');if(!el)return
  const sources=collectOldWalletSources(records),solanaCount=sources.filter(item=>item.chain_family==='solana').length,evmCount=sources.filter(item=>item.chain_family==='evm').length
  const downloadButton=host().querySelector('[data-outflow-download]')
  if(downloadButton)downloadButton.disabled=!outflowData||outflowBusy
  const countEl=host().querySelector('[data-outflow-source-count]')
  if(countEl)countEl.textContent=records.length?`已匹配 ${sources.length} 个唯一旧钱包地址 · Solana ${solanaCount} 个 · EVM ${evmCount} 个`:'请先完成第一步旧钱包查询'
  if(!outflowData){el.innerHTML='<div class="wl-placeholder">完成第一步查询后，这里会自动使用匹配到的旧钱包地址。输入各链转出目标地址和时间范围，即可统计历史转出及当前余额。</div>';return}
  const chains=outflowData.chains||[]
  el.innerHTML=chains.map(chain=>{
   const chainName=esc(chain.chain?.name||'未知链')
   if(chain.status!=='ok')return `<section class="wl-chain-result"><div class="wl-chain-result-head"><h3>${chainName}</h3><span class="wl-badge ${chain.status==='skipped'?'':'wl-error'}">${chain.status==='skipped'?'未查询':chain.status==='no_sources'?'无来源钱包':chain.status==='invalid_target'?'目标地址无效':'查询失败'}</span></div><p>${esc(chain.message||'')}</p></section>`
   const transferCount=chain.sources.reduce((sum,source)=>sum+(source.transfer_count||0),0),walletCount=chain.sources.length
   const body=chain.sources.map(source=>{
    const totals=new Map((source.totals||[]).map(item=>[tokenKey(item),item])),balances=new Map((source.balances||[]).map(item=>[tokenKey(item),item])),keys=new Set([...totals.keys(),...balances.keys()])
    const rows=keys.size?[...keys].map(key=>{const total=totals.get(key),balance=balances.get(key);return `<tr><td>${esc(total?.symbol||balance?.symbol||'未知Token')}${(total?.contract_address||balance?.contract_address)?`<small><code>${esc(total?.contract_address||balance?.contract_address)}</code></small>`:''}</td><td class="wl-number">${esc(total?.amount??'0')}</td><td class="wl-number">${esc(balance?.amount??'—')}</td><td>${source.transfer_count||0}</td></tr>`}).join(''):`<tr><td colspan="4" class="wl-empty">该来源钱包在所选时间内没有转出到目标地址的交易；余额未返回Token数据。</td></tr>`
    const detail=source.transfers?.length?`<details class="wl-transfer-details"><summary>查看 ${source.transfers.length} 笔转出交易明细</summary><div class="wl-scroll"><table class="wl-table wl-detail-table"><thead><tr><th>时间（UTC+7）</th><th>Token</th><th>转出金额</th><th>交易哈希</th></tr></thead><tbody>${source.transfers.map(transfer=>`<tr><td>${esc(transfer.timestamp?new Date(transfer.timestamp).toLocaleString('zh-CN',{timeZone:'Asia/Bangkok',hour12:false}):'—')}</td><td>${esc(transfer.symbol)}${transfer.contract_address?`<small><code>${esc(transfer.contract_address)}</code></small>`:''}</td><td class="wl-number">${esc(transfer.amount)}</td><td><code>${esc(transfer.tx_hash||'—')}</code></td></tr>`).join('')}</tbody></table></div></details>`:''
    const warnings=(source.warnings||[]).map(w=>`<p class="wl-warning">${esc(w)}</p>`).join('')
    return `<div class="wl-source-result"><div class="wl-source-head"><div><strong>${esc(source.source_address)}</strong><small>用户 ID：${esc((source.account_ids||[]).join('、')||'—')}</small></div><div class="wl-source-status"><span class="wl-badge ${source.status==='ok'?'wl-success':'wl-error'}">${source.status==='ok'?'已完成':'历史交易查询失败'}</span><small>${source.transaction_count||0} 笔交易 · ${source.transfer_count||0} 条转账</small></div></div>${source.error?`<p class="wl-warning">${esc(source.error)}</p>`:''}<div class="wl-scroll"><table class="wl-table wl-balance-table"><thead><tr><th>Token</th><th>累计转出至目标地址</th><th>当前余额</th><th>转出笔数</th></tr></thead><tbody>${rows}</tbody></table></div>${detail}${warnings}</div>`
   }).join('')
   return `<section class="wl-chain-result"><div class="wl-chain-result-head"><div><h3>${chainName}</h3><p>目标地址：<code>${esc(chain.target_address||'')}</code></p></div><div class="wl-chain-stats"><strong>${walletCount}</strong><small>个来源钱包</small><strong>${transferCount}</strong><small>条转账</small></div></div>${body||'<div class="wl-placeholder">没有可查询的旧钱包地址</div>'}</section>`
  }).join('')
  const button=host().querySelector('[data-outflow-download]')
  if(button){button.disabled=outflowBusy;button.onclick=()=>{const blob=new Blob([outflowResultsCsv(outflowData)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='四链历史转出与余额统计.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
 }
 function draw(){
  ctx.clear();const stamp=++generation
  host().innerHTML=`<div class="si-page wl-page"><section class="a-card si-panel wl-search"><div class="wl-search-head"><div><h2>第一步 · 旧钱包查询</h2><p>通过登录身份、用户 ID 或旧平台地址定位账号，获取关联的旧钱包地址。</p></div><span class="wl-label">支持批量查询</span></div><form data-wallet-form><label for="wl-input">用户 ID / 登录身份 / 新旧平台地址</label><textarea id="wl-input" name="value" rows="4" required placeholder="每行输入一条，也可用逗号分隔\n支持混合输入用户 ID 和地址"></textarea><div class="wl-actions"><span>每次最多 50 条 · 第二步只使用匹配结果中的旧钱包地址</span><button class="a-button a-primary" type="submit">查询钱包</button></div></form><p role="status" aria-live="polite" data-wallet-status></p></section><div data-wallet-results></div><section class="a-card si-panel wl-search wl-outflow"><div class="wl-search-head"><div><h2>第二步 · 四链转出金额与余额统计</h2><p>自动使用第一步查到的旧钱包作为来源，统计指定时间内转到目标地址的资金，并查询来源钱包当前余额。</p></div><span class="wl-label">四链独立核算</span></div><div class="wl-outflow-source" data-outflow-source-count>请先完成第一步旧钱包查询</div><form data-outflow-form><div class="wl-outflow-dates"><label>开始日期<input type="date" name="start_date" value="${localDate(-7)}" required></label><label>结束日期<input type="date" name="end_date" value="${localDate()}" required></label></div><div class="wl-target-grid">${outflowChains.map(([key,name])=>`<label>${name} · 转出目标地址<input type="text" name="target_${key}" autocomplete="off" placeholder="输入${name}目标钱包地址"></label>`).join('')}</div><div class="wl-actions"><span>仅使用旧钱包地址 · 按时间和目标地址筛选 · 不做金额阈值过滤</span><button class="a-button a-primary" type="submit">统计转出金额与当前余额</button></div></form><p role="status" aria-live="polite" data-outflow-status></p><div class="wl-result-actions wl-outflow-actions"><button type="button" class="a-button" data-outflow-download ${!outflowData||outflowBusy?'disabled':''}>下载统计 CSV</button></div><div data-outflow-results></div></section></div>`
  renderResults();renderOutflowResults()
  const form=host().querySelector('[data-wallet-form]'),status=host().querySelector('[data-wallet-status]')
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;const values=parseWalletInputs(form.elements.value.value);if(!values.length||values.length>50||values.some(v=>v.length>256)){status.textContent='请输入 1–50 条查询内容，每条最多 256 个字符。';return}busy=true;records=[];filter='all';outflowData=null;form.querySelector('button').disabled=true;renderResults();renderOutflowResults();status.textContent=`正在查询 0 / ${values.length}…`;let done=0,index=0;const batch=new Array(values.length)
   async function worker(){while(index<values.length){const i=index++,value=values[i];try{const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({value})});const data=await response.json();if(!response.ok){notifyExpiredSession(response);throw Error(data.error||'查询失败')}batch[i]={value,accounts:data.accounts||[]}}catch(error){batch[i]={value,error:error.message||'查询失败'}}done++;if(stamp===generation)status.textContent=`正在查询 ${done} / ${values.length}…`}}
   await Promise.all(Array.from({length:Math.min(3,values.length)},worker));if(stamp!==generation)return;records=batch;busy=false;form.querySelector('button').disabled=false;status.textContent=`本次查询完成：${values.length} 条`;renderResults();renderOutflowResults()
  }
  const outflowForm=host().querySelector('[data-outflow-form]'),outflowStatus=host().querySelector('[data-outflow-status]')
  outflowForm.onsubmit=async e=>{e.preventDefault();if(outflowBusy)return;const sources=collectOldWalletSources(records);if(!sources.length){outflowStatus.textContent='请先完成第一步旧钱包查询，并确保查询结果包含旧钱包地址。';return}const targets=Object.fromEntries(outflowChains.map(([key])=>[key,outflowForm.elements[`target_${key}`].value.trim()]));if(!Object.values(targets).some(Boolean)){outflowStatus.textContent='请至少填写一条链的转出目标地址。';return}if(outflowForm.elements.start_date.value>outflowForm.elements.end_date.value){outflowStatus.textContent='结束日期不能早于开始日期。';return}outflowBusy=true;outflowData=null;const button=outflowForm.querySelector('button');button.disabled=true;const download=host().querySelector('[data-outflow-download]');if(download)download.disabled=true;renderOutflowResults();outflowStatus.textContent=`正在使用 ${sources.length} 个旧钱包地址查询四链转出记录和当前余额…`;try{const response=await fetch(outflowBase,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({source_wallets:sources,targets,start_date:outflowForm.elements.start_date.value,end_date:outflowForm.elements.end_date.value})});const data=await response.json();if(!response.ok){notifyExpiredSession(response);throw Error(data.error||'查询失败')}if(stamp!==generation)return;outflowData=data;const queried=data.chains.filter(chain=>chain.status==='ok').length;outflowStatus.textContent=`统计完成：${queried} 条链已执行；结果按来源钱包、Token 分别核算。`;renderOutflowResults()}catch(error){if(stamp===generation)outflowStatus.textContent=error.message||'查询失败'}finally{outflowBusy=false;button.disabled=false;if(stamp===generation){const dl=host().querySelector('[data-outflow-download]');if(dl)dl.disabled=!outflowData}}}
 }
 return {draw,dispose(){generation++;busy=false;outflowBusy=false}}
}
