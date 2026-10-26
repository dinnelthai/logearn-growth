import {xRequest} from '../api/xAcquisition.js'
import {loadingState} from './loadingState.js'
import './xAcquisition.css'

export const STAGE_LABELS={new:'待判断',qualified:'值得接触',contacted:'已接触',replied:'有回应',trial:'已体验 · 人工确认',closed:'已结束',dismissed:'不匹配'}
const RUN_LABELS={complete:'已完成',partial:'部分完成 / 待续采',failed:'失败',running:'采集中',interrupted:'已中断'}
const CATEGORY={need:'需求提问',research:'研究讨论',noise:'疑似推广',other:'待核实'}
const localTime=t=>t?new Date(t+25200000).toISOString().slice(0,16):''
const parseTime=t=>t?Date.parse(t+':00+07:00'):null
export function csvCell(value){return '"'+String(value??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')+'"'}
export function createXAcquisition(ctx){
  const {esc,fmt}=ctx,host=()=>ctx.$('#as-output')
  let generation=0,data=null,selected=null,detail=null,tab='leads',busy=false,pending=false,timer=null,message='',failure=false
  let filters={q:'',stage:'',rule_id:'',high:'',due:'',offset:0}
  const time=t=>t?localTime(t).replace('T',' '):'—'
  const money=n=>'$'+Number(n||0).toFixed(4)
  const option=(value,label,current)=>`<option value="${esc(value)}" ${String(value)===String(current)?'selected':''}>${esc(label)}</option>`
  function notice(text,isError=false){message=text;failure=isError;const node=host().querySelector('[data-x-message]');if(node){node.textContent=text;node.className=isError?'si-error':'a-muted'}}
  function clear(){clearTimeout(timer);timer=null}
  async function draw(){
    clear();ctx.clear();const stamp=++generation
    host().innerHTML=loadingState('正在加载 X 获客线索…')
    try{
      const result=await xRequest('?'+new URLSearchParams(filters))
      if(stamp!==generation)return
      data=result
      const nextDetail=selected?await xRequest('/leads/'+encodeURIComponent(selected)):null
      if(stamp!==generation)return
      detail=nextDetail
      render()
      if(data.running)timer=setTimeout(()=>{if(!pending&&!busy)draw()},4000)
    }catch(error){if(stamp!==generation)return;host().innerHTML=`<section class="a-card si-panel x-acq"><h2>X 关键词获客暂不可用</h2><p class="si-error">${esc(error.message)}</p><button class="a-button" data-x-retry>重试</button></section>`;host().querySelector('[data-x-retry]').onclick=draw}
  }
  async function action(fn){
    if(busy)return
    busy=true;clear();const stamp=generation
    const controls=[...host().querySelectorAll('button,input,textarea,select')].map(node=>[node,node.disabled])
    controls.forEach(([node])=>node.disabled=true)
    try{await fn();if(stamp!==generation)return;pending=false;busy=false;await draw()}
    catch(error){if(stamp===generation)notice(error.message,true)}
    finally{busy=false;if(stamp===generation)controls.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled})}
  }
  const queryState=r=>r.last_error?'采集异常':r.cursor?'待续采':r.complete_until?'已同步':'尚未采集'
  function summary(){
    const counts=data.counts,total=Object.values(counts).reduce((a,b)=>a+b,0)
    return `<div class="x-stats">${[['已发现用户',total,'按 X 作者去重'],['优先处理',data.high_intent,'规则评分 ≥ 60 · 未结束'],['有回应',counts.replied,'人工跟进状态'],['已体验',counts.trial,'人工确认，非行为转化'],['到期跟进',data.due,'按 UTC+7 提醒']].map(([label,value,note],i)=>`<button class="x-stat" data-x-stat="${i}"><span>${label}</span><strong>${fmt(value)}</strong><small>${note}</small></button>`).join('')}</div>`
  }
  function render(){
    if(!data)return
    host().innerHTML=`<div class="si-page x-acq"><header class="x-hero"><div><div class="x-eyebrow">SOCIAL LISTENING / X</div><h2>找到正在寻找答案的人</h2><p>从关键词发现需求，把值得参与的讨论变成可跟进的线索。</p><div class="x-connection"><span class="x-dot ${data.configured?'is-ready':''}"></span>${data.configured?'数据源已配置':'等待后端配置数据源'}<span>·</span>${data.settings.enabled?'每'+data.settings.interval_minutes+'分钟自动监听':'自动监听已暂停'}</div></div><div class="x-hero-actions"><button class="a-button" data-x-refresh>刷新列表</button><button class="a-button a-primary" data-x-collect ${!data.configured||data.running||!data.rules.some(r=>r.enabled)?'disabled':''}>${data.running?'正在采集…':'采集新线索'}</button><small>每组最多3页，未完成窗口下次继续</small></div></header>
      <p data-x-message role="status" class="${failure?'si-error':'a-muted'}">${esc(message)}</p>
      ${!data.configured?'<section class="a-card si-panel"><strong>尚未配置数据源密钥</strong><p>请由管理员在后端环境变量中设置 TWITTERAPI_IO_API_KEY，然后重启后端。</p></section>':''}
      ${summary()}
      <div class="x-tabs" role="tablist" aria-label="X获客视图">${[['leads','线索池'],['rules','关键词与监听'],['runs','采集记录']].map(([key,label])=>`<button role="tab" aria-selected="${tab===key}" class="a-button" data-x-tab="${key}">${label}</button>`).join('')}<span>今日估算 ${money(data.budget.estimated_usd)} / $${data.budget.limit_usd.toFixed(2)} · 全后台共享预算</span></div>
      ${selected&&detail?detailMarkup():tab==='rules'?rulesMarkup():tab==='runs'?runsMarkup():leadsMarkup()}
      <p class="a-muted x-footnote">${esc(data.note)} 数据源：TwitterAPI.io · 规则辅助筛选 · 时间 UTC+7</p></div>`
    bind()
  }
  function leadsMarkup(){
    return `<section class="a-card si-panel"><form class="x-filters" data-x-filters><label class="x-search">搜索用户或推文<input name="q" maxlength="120" placeholder="用户名、问题、跟进备注…" value="${esc(filters.q)}"></label><label>跟进状态<select name="stage">${option('','全部状态',filters.stage)}${Object.entries(STAGE_LABELS).map(([key,label])=>option(key,label,filters.stage)).join('')}</select></label><label>关键词组<select name="rule_id">${option('','全部关键词',filters.rule_id)}${data.rules.map(r=>option(r.id,r.name,filters.rule_id)).join('')}</select></label><button class="a-button" type="submit">筛选</button><button class="a-button" type="button" data-x-reset>重置</button></form><div class="x-listbar"><div><button class="a-button" data-x-high aria-pressed="${filters.high==='1'}">优先处理</button> <button class="a-button" data-x-due aria-pressed="${filters.due==='1'}">到期跟进</button> <span class="a-muted">${fmt(data.total)} 位匹配用户 · ${fmt(data.total_posts)} 条已采集推文</span></div><button class="a-button" data-x-export ${!data.leads.length?'disabled':''}>导出当前页</button></div>
    ${data.leads.length?`<div class="x-lead-list">${data.leads.map(leadCard).join('')}</div>`:`<div class="x-empty"><span class="x-empty-mark">⌕</span><h3>${data.rules.length?'还没有匹配的线索':'先设置要监听的需求'}</h3><p>${data.rules.length?'采集新线索，或调整关键词与筛选条件。':'已准备4组中英文筹码与钱包研究关键词，可编辑后开始采集。'}</p><button class="a-button a-primary" data-x-empty-rules>${data.rules.length?'管理关键词':'使用推荐关键词'}</button></div>`}
    <div class="x-pagination"><button class="a-button" data-x-prev ${!data.offset?'disabled':''}>上一页</button><span>${data.total?data.offset+1:0}–${Math.min(data.offset+data.leads.length,data.total)} / ${data.total}</span><button class="a-button" data-x-next ${data.offset+data.limit>=data.total?'disabled':''}>下一页</button></div></section>`
  }
  function leadCard(l){
    return `<article class="x-lead"><div class="x-lead-score ${l.score>=60?'is-high':''}"><strong>${l.score}</strong><span>规则分</span></div><div class="x-lead-body"><div class="x-lead-head"><a href="${esc(l.profile_url)}" target="_blank" rel="noopener noreferrer">${esc(l.name||l.username||l.author_id)}</a><span class="a-muted">@${esc(l.username||'未知')} · ${fmt(l.followers)} 关注者</span><span class="x-tag">${esc(CATEGORY[l.category]||'待核实')}</span><span class="x-tag">${esc(STAGE_LABELS[l.stage])}</span></div><p class="x-post">${esc(l.post_text)}</p><div class="x-evidence">${l.reasons.filter(r=>r.kind!=='fresh').map(r=>`<span>${esc(r.label)}${r.evidence?'：「'+esc(r.evidence)+'」':''}</span>`).join('')}</div><div class="x-lead-meta"><span>${time(l.posted_at)} · ${l.post_count}条相关推文</span><span>${esc(l.assignee||'未分配')}${l.next_followup_at?' · 跟进 '+time(l.next_followup_at):''}</span></div></div><div class="x-lead-actions"><button class="a-button a-primary" data-x-open="${esc(l.id)}">查看与跟进</button><a class="a-button" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div></article>`
  }
  function detailMarkup(){
    const l=detail.lead
    return `<section class="a-card si-panel"><div class="x-listbar"><div><h2>${esc(l.name||l.username)} <small class="a-muted">@${esc(l.username)}</small></h2><p>${esc(l.bio||'暂无作者简介')}</p></div><button class="a-button" data-x-back>返回线索池</button></div><div class="x-detail-grid"><div><h3>需求证据 · 最近50条</h3>${detail.posts.map(p=>`<article class="x-proof"><div class="x-listbar"><span class="x-tag">${esc(CATEGORY[p.category])} · ${p.score}分</span><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div><p class="x-post">${esc(p.text)}</p><p class="a-muted">${time(p.created_at)} · ${esc(p.rules.join(' / '))}</p></article>`).join('')}<h3>回复参考</h3><p class="a-muted">通用研究方法草稿；请结合原帖修改后，在 X 人工发送。</p><textarea rows="5" data-x-draft aria-label="回复参考">${esc(l.draft||'当前内容缺少明确需求，建议先核实上下文。')}</textarea><button class="a-button" data-x-copy-draft>复制草稿</button><h3>来源链接</h3><input readonly aria-label="线索来源链接" value="${esc(l.tracking_url)}"><button class="a-button" data-x-copy-link>复制链接</button><p class="a-muted">带有线索编号的 UTM 链接；尚未接通逐线索点击、注册及分析事件。</p></div><div><h3>跟进档案</h3><form data-x-lead><label>状态<select name="stage">${Object.entries(STAGE_LABELS).map(([key,label])=>option(key,label,l.stage)).join('')}</select></label><label>负责人<input name="assignee" maxlength="80" value="${esc(l.assignee)}"></label><label>下次跟进 · UTC+7<input name="next" type="datetime-local" value="${localTime(l.next_followup_at)}"></label><label>档案备注<textarea name="notes" maxlength="4000" rows="3">${esc(l.notes)}</textarea></label><label>本次跟进 / 确认依据<textarea name="content" maxlength="2000" rows="3" placeholder="记录实际沟通、对方回应或体验依据"></textarea></label><button class="a-button a-primary" type="submit">保存跟进</button></form><h3>跟进记录</h3>${detail.followups.length?detail.followups.map(f=>`<article class="x-proof"><span class="x-tag">${esc(STAGE_LABELS[f.stage])}</span><p class="x-post">${esc(f.content)}</p><small class="a-muted">${time(f.created_at)}</small></article>`).join(''):'<p class="a-muted">尚未记录跟进。</p>'}</div></div></section>`
  }
  function ruleForm(r){
    return `<form class="x-rule" data-x-rule="${esc(r?.id||'new')}"><div class="x-rule-top"><label>关键词组名称<input name="name" maxlength="80" required value="${esc(r?.name||'')}"></label><label>状态<select name="enabled">${option('1','启用',r?.enabled??1)}${option('0','停用',r?.enabled??1)}</select></label></div><label>搜索表达式<textarea name="query" maxlength="500" rows="3" required placeholder='("token holders" OR "holder distribution") (tool OR how) -filter:retweets'>${esc(r?.query||'')}</textarea></label><div class="x-listbar"><span class="a-muted">${r?`${queryState(r)} · 同步截至 ${time(r.complete_until)}`:'首次采集最近24小时；之后增量采集，自动处理时间窗口。'}</span><div>${r?`<button class="a-button" type="button" data-x-collect-rule="${esc(r.id)}" ${!data.configured||data.running?'disabled':''}>采集此组</button> `:''}<button class="a-button" type="submit" ${data.running?'disabled':''}>${r?'保存关键词':'添加关键词'}</button></div></div>${r?.last_error?`<p class="si-error">${esc(r.last_error)}</p>`:''}</form>`
  }
  function rulesMarkup(){
    const s=data.settings
    return `<section class="a-card si-panel"><div class="x-listbar"><div><h2>关键词与监听</h2><p class="a-muted">先选具体需求表达，再逐步扩大。每位运营最多10组关键词。</p></div>${!data.rules.length?'<button class="a-button" data-x-setup>使用推荐关键词</button>':''}</div><form class="x-filters" data-x-settings><label>自动监听<select name="enabled">${option('0','暂停',s.enabled)}${option('1','开启',s.enabled)}</select></label><label>采集间隔<select name="interval_minutes">${[15,30,60,120].map(n=>option(n,n+'分钟',s.interval_minutes)).join('')}</select></label><button type="submit" class="a-button">保存监听设置</button></form><p class="a-muted">自动监听需要后端服务保持运行。每日共享预算 $${data.budget.limit_usd.toFixed(2)}，达到上限暂停；金额为按文档单价估算，以供应商账单为准。</p></section><div class="x-rules">${data.rules.map(ruleForm).join('')}</div>${data.rules.length<10?`<section class="a-card si-panel"><h3>新增关键词组</h3>${ruleForm(null)}</section>`:''}`
  }
  function runsMarkup(){
    return `<section class="a-card si-panel"><h2>采集记录</h2><p class="a-muted">返回推文数包含重复读取，新用户数按作者去重。部分完成的关键词将从保留的游标续采。</p><div class="x-budget"><strong>今日估算 ${money(data.budget.estimated_usd)}</strong><span>每日上限 $${data.budget.limit_usd.toFixed(2)} · UTC+7 · 全后台共享</span>${data.budget.uncertain_usd?`<span>其中 ${money(data.budget.uncertain_usd)} 为失败请求保守预留，实际扣费待核对。</span>`:''}</div>${data.runs.length?ctx.table(['开始 · UTC+7','状态','已处理关键词','读取推文','新增用户','页数','说明'],data.runs.map(r=>[time(r.started_at),esc(RUN_LABELS[r.state]||r.state),fmt(r.rules),fmt(r.posts),fmt(r.new_leads),fmt(r.pages),esc(r.error||(r.state==='partial'?'单轮页数上限，下一轮继续':r.state==='running'?'正在处理':'—'))])):'<div class="x-empty"><h3>尚未运行采集</h3><p>配置关键词后，点击“采集新线索”开始。</p></div>'}</section>`
  }
  function bind(){
    const node=host()
    node.querySelector('[data-x-refresh]').onclick=()=>{if(!pending)draw()}
    node.querySelector('[data-x-collect]').onclick=()=>collect()
    node.querySelectorAll('[data-x-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.xTab;selected=null;detail=null;pending=false;render()})
    node.querySelectorAll('[data-x-stat]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.xStat);tab='leads';selected=null;filters={q:'',stage:n===2?'replied':n===3?'trial':'',rule_id:'',high:n===1?'1':'',due:n===4?'1':'',offset:0};draw()})
    node.querySelector('[data-x-empty-rules]')?.addEventListener('click',()=>data.rules.length?(tab='rules',render()):setup())
    node.querySelector('[data-x-setup]')?.addEventListener('click',setup)
    node.querySelector('[data-x-filters]')?.addEventListener('submit',e=>{e.preventDefault();filters={...filters,...Object.fromEntries(new FormData(e.target)),offset:0};draw()})
    node.querySelector('[data-x-reset]')?.addEventListener('click',()=>{filters={q:'',stage:'',rule_id:'',high:'',due:'',offset:0};draw()})
    for(const key of ['high','due'])node.querySelector('[data-x-'+key+']')?.addEventListener('click',()=>{filters[key]=filters[key]?'':'1';filters.offset=0;draw()})
    node.querySelector('[data-x-prev]')?.addEventListener('click',()=>{filters.offset=Math.max(0,data.offset-data.limit);draw()})
    node.querySelector('[data-x-next]')?.addEventListener('click',()=>{filters.offset=data.offset+data.limit;draw()})
    node.querySelectorAll('[data-x-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.xOpen;draw()})
    node.querySelector('[data-x-back]')?.addEventListener('click',()=>{selected=null;detail=null;pending=false;render()})
    node.querySelectorAll('[data-x-rule]').forEach(form=>{
      form.oninput=()=>{pending=true}
      form.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form)),id=form.dataset.xRule,r=data.rules.find(r=>r.id===id);action(async()=>{await xRequest('/rules'+(r?'/'+encodeURIComponent(id):''),r?'PATCH':'POST',{...v,enabled:v.enabled==='1',...(r?{expected_updated_at:r.updated_at}:{})});notice('关键词已保存')})}
    })
    node.querySelectorAll('[data-x-collect-rule]').forEach(b=>b.onclick=()=>collect(b.dataset.xCollectRule))
    const settings=node.querySelector('[data-x-settings]')
    if(settings){settings.oninput=()=>{pending=true};settings.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(settings));action(async()=>{await xRequest('/settings','PUT',{enabled:v.enabled==='1',interval_minutes:Number(v.interval_minutes),expected_updated_at:data.settings.updated_at});notice(v.enabled==='1'?'自动监听已开启':'自动监听已暂停')})}}
    const form=node.querySelector('[data-x-lead]')
    if(form){form.oninput=()=>{pending=true};form.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form)),id=detail.lead.id;action(async()=>{await xRequest('/leads/'+encodeURIComponent(id),'PATCH',{stage:v.stage,assignee:v.assignee,notes:v.notes,content:v.content,next_followup_at:parseTime(v.next),expected_updated_at:detail.lead.updated_at});notice('跟进已保存')})}}
    node.querySelector('[data-x-copy-draft]')?.addEventListener('click',()=>copy(node.querySelector('[data-x-draft]').value))
    node.querySelector('[data-x-copy-link]')?.addEventListener('click',()=>copy(detail.lead.tracking_url))
    node.querySelector('[data-x-export]')?.addEventListener('click',()=>{
      const rows=[['用户','用户名','规则评分','状态','负责人','推文','原帖','跟进时间 UTC+7','备注'],...data.leads.map(l=>[l.name,l.username,l.score,STAGE_LABELS[l.stage],l.assignee,l.post_text,l.url,time(l.next_followup_at),l.notes])]
      const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='x-acquisition-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    })
    if(busy)node.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=true)
  }
  async function copy(value){try{await navigator.clipboard.writeText(value);notice('已复制')}catch{notice('无法访问剪贴板，请手动选择复制',true)}}
  function setup(){return action(async()=>{await xRequest('/setup','POST',{});tab='rules';notice('已添加推荐关键词，可编辑后采集')})}
  function collect(rule_id){return action(async()=>{await xRequest('/collect','POST',rule_id?{rule_id}:{});notice('采集任务已启动，列表会自动刷新；可在采集记录查看结果。')})}
  return {draw,dispose(){generation++;clear();pending=false},hasPendingChanges:()=>pending||busy}
}
