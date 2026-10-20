import {listCohorts} from '../analytics/cohortClient.js'
import {resolveSavedCohort} from '../analytics/savedCohort.js'
import {listKols} from '../api/crm.js'
import {importKolRoster,validateActivityIds,resolveActivityAddresses} from '../api/activities.js'
export function rosterImportHTML(esc,ids=''){return `<div data-roster-import><div class="crm-form-grid"><label>名单来源<select data-roster-source><option value="manual">粘贴 ID / 邮箱 / 地址 / CSV / TXT</option><option value="address">登录地址 / 平台地址</option><option value="cohort">保存人群</option><option value="kol">KOL相关用户</option></select></label><label>导入方式<select data-roster-mode><option value="append">追加（保留原名单并去重）</option><option value="replace">替换当前名单</option></select></label><div data-roster-source-options></div></div><div class="activity-field-head"><label>用户 ID / 邮箱 / 地址名单<textarea name="ids" required rows="7" placeholder="可直接粘贴用户 ID、邮箱、登录地址或平台地址，每行一个；支持逗号或空格">${esc(ids)}</textarea></label><label class="activity-upload">导入 CSV / TXT<input type="file" accept=".csv,.txt" data-roster-file></label></div><small>最多5000人；来源载入后固定为当前名单，可继续编辑。文件限1MB。</small><label>追加名单<textarea data-roster-additions rows="3" placeholder="粘贴要追加的 ID、邮箱或地址，支持批量"></textarea></label><button class="a-button" type="button" data-roster-append>追加到名单</button><p class="a-muted" data-roster-origin></p><button class="a-button" type="button" data-roster-validate>校验名单</button><div data-roster-validation aria-live="polite"></div><p data-roster-error class="si-error" role="status"></p></div>`}
export function importReportHTML({esc,fmt},v){return `<div class="activity-import"><strong>本次可纳入 ${fmt(v.matched)} 人</strong><span>待首次分析 ${fmt(v.eligible)} 人</span><span>已分析 ${fmt(v.prior)} 人</span><span>重复 ${fmt(v.duplicates)} 条</span><span>活动已有 ${fmt(v.skipped_existing||0)} 人</span><span>脏 ID ${fmt(v.dirty.length)} 条</span><span>格式无效 ${fmt(v.invalid.length)} 条</span><span>未匹配 ${fmt(v.unmatched.length)} 人</span></div>${v.unmatched.length||v.dirty.length||v.invalid.length?`<details><summary>查看未纳入的 ID</summary><p>未匹配：${esc(v.unmatched.join('、')||'无')}</p><p>脏 ID：${esc(v.dirty.join('、')||'无')}</p><p>格式无效：${esc(v.invalid.join('、')||'无')}</p></details>`:''}`}
export function mountRosterImport(host,ctx,{onChange=()=>{},onValidated=()=>{},validate=validateActivityIds}={}){
 if(!host)return {dispose(){}}
 const {esc}=ctx,textarea=host.querySelector('[name=ids]'),options=host.querySelector('[data-roster-source-options]'),error=host.querySelector('[data-roster-error]'),report=host.querySelector('[data-roster-validation]');let epoch=0,kind='manual',page=0,search='',addressPreview=null
 const valid=t=>t===epoch&&host.isConnected,changed=()=>{epoch++;addressPreview=null;report.innerHTML='';onChange(textarea.value);onValidated(null)}
 textarea.oninput=()=>{changed();host.querySelector('[data-roster-origin]').textContent='已手动编辑名单；重新校验后保存'}
 const appendMode=()=>host.querySelector('[data-roster-mode]').value!=='replace'
 const mergeInput=text=>mergeRosterInput(appendMode()?textarea.value:'',text)
 host.querySelector('[data-roster-mode]').onchange=()=>{epoch++}
 host.querySelector('[data-roster-append]').onclick=()=>{try{const additions=host.querySelector('[data-roster-additions]');textarea.value=mergeRosterInput(textarea.value,additions.value);additions.value='';changed();error.textContent='';host.querySelector('[data-roster-origin]').textContent='已追加并去重，请校验名单'}catch(e){error.textContent=e.message}}
 const setIds=(ids,title)=>{if(ids.length>5000)throw Error('来源超过5000人，请先缩小人群');textarea.value=mergeInput(ids.join('\n'));changed();host.querySelector('[data-roster-origin]').textContent=title+' · 名单载入后固定，仍需校验'}
 host.querySelector('[data-roster-file]').onchange=async e=>{const file=e.target.files[0],token=epoch;if(!file)return;try{if(file.size>1024*1024)throw Error('文件不能超过1MB');const text=await file.text();if(!valid(token))return;textarea.value=mergeInput(text);changed();host.querySelector('[data-roster-origin]').textContent='来源文件：'+file.name}catch(e){if(host.isConnected)error.textContent=e.message}}
 async function sources(){const token=++epoch;options.innerHTML='正在读取来源…';error.textContent='';try{
  if(kind==='manual'){options.innerHTML='';return}
  if(kind==='address'){
   options.innerHTML='<label>邮箱 / 地址名单<textarea data-source-addresses rows="5" placeholder="每行一个邮箱、登录钱包或平台钱包地址，支持 EVM / Solana"></textarea></label><label class="activity-upload">导入地址 CSV / TXT<input type="file" accept=".csv,.txt" data-address-file></label><button type="button" class="a-button" data-resolve-addresses>识别地址并载入用户 ID</button><small>仅纳入唯一匹配的账号。识别后请校验名单；识别本身不会修改标签。</small><div data-address-results aria-live="polite"></div>'
   const addresses=options.querySelector('[data-source-addresses]'),results=options.querySelector('[data-address-results]')
   addresses.oninput=()=>{if(!appendMode())textarea.value='';changed();results.innerHTML='';error.textContent='';host.querySelector('[data-roster-origin]').textContent='地址已修改，请重新识别并校验名单'}
   options.querySelector('[data-address-file]').onchange=async e=>{const file=e.target.files[0],t=epoch;if(!file)return;try{if(file.size>1024*1024)throw Error('文件不能超过1MB');const text=await file.text();if(!valid(t))return;addresses.value=text;addresses.oninput()}catch(e){if(valid(t))error.textContent=e.message}}
   options.querySelector('[data-resolve-addresses]').onclick=async e=>{const t=epoch,input=addresses.value;e.target.disabled=true;error.textContent='';try{const r=await resolveActivityAddresses(input);if(!valid(t)||addresses.value!==input)return;setIds(r.user_ids,'邮箱 / 地址识别：'+r.matched+' 个地址 → '+r.users+' 个用户');results.innerHTML=addressReportHTML(ctx,r)}catch(e){if(valid(t))error.textContent=e.message}finally{e.target.disabled=false}}
   return
  }
  if(kind==='cohort'){const r=await listCohorts();if(!valid(token))return;options.innerHTML=`<label>选择保存人群<select data-source-cohort><option value="">选择人群</option>${r.cohorts.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.kind==='dynamic'?' · 动态条件':''}</option>`).join('')}</select></label><button type="button" class="a-button" data-load-source>载入名单</button>`}
  else{const r=await listKols({q:search,offset:page*50,limit:50});if(!valid(token))return;options.innerHTML=`<label>搜索KOL<input data-source-search value="${esc(search)}"></label><button type="button" class="a-button" data-source-search-button>搜索</button><label>选择KOL<select data-source-kol><option value="">选择KOL</option>${r.kols.map(k=>`<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</select></label><div class="activity-actions"><button type="button" class="a-button" data-source-prev ${page?'':'disabled'}>上一页</button><span>第 ${page+1} 页 / 共 ${r.total} 个</span><button type="button" class="a-button" data-source-next ${(page+1)*50<r.total?'':'disabled'}>下一页</button></div><label>名单范围<select data-source-scope><option value="tagged">KOL标签名单（含本人）</option><option value="own">本人</option><option value="invited">有效直接邀请</option></select></label><button type="button" class="a-button" data-load-source>载入名单</button><small>邀请名单在载入时固定，后续新增邀请不会自动加入。</small>`
   options.querySelector('[data-source-search-button]').onclick=()=>{search=options.querySelector('[data-source-search]').value.trim();page=0;sources()};options.querySelector('[data-source-prev]').onclick=()=>{page--;sources()};options.querySelector('[data-source-next]').onclick=()=>{page++;sources()}
  }
  options.querySelector('[data-load-source]').onclick=async e=>{const sourceToken=epoch;e.target.disabled=true;error.textContent='';try{
   if(kind==='cohort'){const id=options.querySelector('[data-source-cohort]').value;if(!id)throw Error('请选择人群');const a=await resolveSavedCohort(id,{});if(!valid(sourceToken))return;const ids=a.ids.filter(id=>id.startsWith('user:')).map(id=>id.slice(5));setIds(ids,a.title+' · 排除匿名身份 '+(a.ids.length-ids.length)+' 人')}
   else{const id=options.querySelector('[data-source-kol]').value;if(!id)throw Error('请选择KOL');const a=await importKolRoster(id,options.querySelector('[data-source-scope]').value);if(valid(sourceToken))setIds(a.user_ids,a.title)}
  }catch(e){if(valid(sourceToken))error.textContent=e.message}finally{e.target.disabled=false}}
 }catch(e){if(valid(token)){options.innerHTML='';error.textContent=e.message}}}
 host.querySelector('[data-roster-source]').onchange=e=>{kind=e.target.value;page=0;search='';sources()}
 host.querySelector('[data-roster-validate]').onclick=async e=>{
  const token=epoch,input=textarea.value;e.target.disabled=true;error.textContent=''
  try{
   const parsed=splitRosterInput(input);let resolution=null,ids=input
   if(parsed.addresses.length){
    resolution=await resolveActivityAddresses(parsed.addresses.join('\n'))
    if(!valid(token)||input!==textarea.value)return
    ids=mergeRosterInput('',[...parsed.ids,...resolution.user_ids].join('\n'))
    if(!ids.trim()){addressPreview=resolution;report.innerHTML=addressReportHTML(ctx,resolution);onValidated(null);host.querySelector('[data-roster-origin]').textContent='邮箱 / 地址未唯一匹配账号，已保留原输入；请核对后重试';return}
   }
   const v=await validate(ids);if(!valid(token)||input!==textarea.value)return
   if(resolution){textarea.value=ids;changed();addressPreview=resolution;host.querySelector('[data-roster-origin]').textContent='已自动将邮箱 / 地址转换为用户 ID；未匹配或冲突地址未纳入，详见下方结果'}
   report.innerHTML=(addressPreview?addressReportHTML(ctx,addressPreview):'')+importReportHTML(ctx,v);onValidated(v)
  }catch(e){if(valid(token))error.textContent=e.message}finally{e.target.disabled=false}
 }
 return {dispose(){epoch++}}
}

export function addressReportHTML({esc,fmt},r){return `<p>唯一匹配 ${fmt(r.matched)} 个邮箱 / 地址 / ${fmt(r.users)} 位用户 · 未匹配 ${fmt(r.unmatched)} · 多账号冲突 ${fmt(r.ambiguous)} · 重复 ${fmt(r.duplicates)} · 格式无效 ${fmt(r.invalid.length)}</p><div class="a-scroll"><table><thead><tr><th>邮箱 / 地址</th><th>用户 ID</th><th>识别结果</th></tr></thead><tbody>${r.records.slice(0,100).map(row=>`<tr><td>${esc(row.address)}</td><td>${esc(row.user_id||'—')}</td><td>${esc(row.state==='matched'?row.sources.map(s=>s==='email'?'邮箱':s==='login'?'登录地址':'平台地址').join(' / '):row.state==='ambiguous'?'对应多个账号，不纳入':'未找到账号')}</td></tr>`).join('')}</tbody></table></div>${r.records.length>100?'<p>仅预览前100个邮箱 / 地址；所有唯一匹配用户均已载入上方名单。</p>':''}${r.invalid.length?`<p>格式无效：${esc(r.invalid.slice(0,100).join('、'))}</p>`:''}`}

export function splitRosterInput(input){
 if(new TextEncoder().encode(input).length>1024*1024)throw Error('名单不能超过1MB')
 const tokens=input.replace(/^\uFEFF/,'').split(/[\s,;，；]+/).map(x=>x.replace(/^"|"$/g,'')).filter(Boolean)
 if(tokens.length>10000)throw Error('一次最多输入10000条记录，请分批导入')
 const addresses=[],ids=[]
 for(const token of tokens){
  if(/^(user_?id|address|wallet_address|login_address|用户ID|地址|登录地址|登陆地址|平台地址|钱包地址|email|邮箱)$/i.test(token))continue
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)||/^0x[0-9a-fA-F]{40}$/.test(token)||/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token))addresses.push(token)
  else ids.push(token)
 }
 return {addresses,ids}
}

export function mergeRosterInput(current,incoming){
 const a=splitRosterInput(current),b=splitRosterInput(incoming),seen=new Set(),tokens=[]
 for(const token of [...a.ids,...a.addresses,...b.ids,...b.addresses]){
  const key=token.includes('@')||/^0x[0-9a-fA-F]{40}$/.test(token)?token.toLowerCase():token
  if(!seen.has(key)){seen.add(key);tokens.push(token)}
 }
 if(tokens.length>5000)throw Error('合并后名单超过5000条，请分批导入')
 return tokens.join('\n')
}
