import {xRequest} from '../api/xAcquisition.js'
import {loadingState} from './loadingState.js'
import './kolDiscovery.css'

const CONFIDENCE={pending:'待画像',limited:'样本有限',moderate:'中等证据',supported:'证据较充分',needs_review:'画像待复核',stale:'资料待刷新'}
const local=t=>t?new Date(t+25200000).toISOString().slice(0,16):''
const time=t=>local(t).replace('T',' ')||'—'
const parseTime=t=>t?Date.parse(t+':00+07:00'):null
const pretty=n=>n==null?'未知':Number(n).toLocaleString('en-US',{maximumFractionDigits:0})
export function accountCard(a,ctx){
  const {esc}=ctx,r=a.recommendation,m=r.metrics
  return `<article class="kd-account"><div class="kd-rank">${a.rank?String(a.rank).padStart(2,'0'):'—'}<small>${a.rank?'候选排名':'待补充'}</small></div><div class="kd-account-main"><div class="kd-identity"><strong>${esc(a.name)}</strong><a href="${esc(a.profile_url)}" target="_blank" rel="noopener noreferrer">@${esc(a.username)} ↗</a><span class="kd-tag">${esc(CONFIDENCE[r.confidence])}</span><span class="kd-tag">${esc(ctx.stages[a.stage])}</span></div><h3>${esc(a.review?.positioning||'已加入候选池，等待内容画像')}</h3><p class="kd-summary">${esc(a.review?.summary||'先采集主页与历史内容，再根据具体证据补充定位和推荐理由。')}</p><div class="kd-tags">${(a.review?.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="kd-facts"><span>${pretty(a.profile?.followers)} 关注者</span><span>近90天 ${m.original_posts} 条原创样本</span><span>样本曝光中位数 ${pretty(m.median_views)}</span></div>${r.blockers.length?`<p class="kd-caution">${esc(r.blockers.join(' · '))}</p>`:''}</div><div class="kd-recommend"><div class="kd-score"><strong>${r.score??'—'}</strong><span>推荐指数</span></div><p>已知维度覆盖 ${r.coverage}%</p><button class="a-button a-primary" data-kd-open="${esc(a.id)}">查看画像与证据</button></div></article>`
}
export function createKolDiscovery(ctx){
  const {esc}=ctx,host=()=>ctx.$('#as-output')
  let generation=0,timer=null,data=null,detail=null,candidateData=null,selected=null,view='ranking',busy=false,dirty=false,editing=false,message='',isError=false,legacy=null
  let filters={objective:'trial',q:'',stage:'',status:'all',offset:0}
  const option=(v,label,current)=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(label)}</option>`
  const endpoint=id=>'/kol/accounts/'+encodeURIComponent(id)
  function notice(value,error=false){message=value;isError=error;const n=host().querySelector('[data-kd-message]');if(n){n.textContent=value;n.className=error?'si-error':'a-muted'}}
  function stop(){clearTimeout(timer);timer=null}
  async function draw(){
    stop();ctx.clear();const stamp=++generation
    host().innerHTML=loadingState('正在读取中文 KOL 画像…')
    try{
      const result=await xRequest('/kol?'+new URLSearchParams(filters));if(stamp!==generation)return;data=result
      const d=selected?await xRequest(endpoint(selected)+'?objective='+filters.objective):null;if(stamp!==generation)return;detail=d
      if(view==='candidates'){const c=await xRequest('/kol/candidates');if(stamp!==generation)return;candidateData=c}
      render()
      if(data.running)timer=setTimeout(()=>{if(!dirty&&!busy)draw()},4000)
    }catch(error){if(stamp!==generation)return;host().innerHTML=`<section class="a-card si-panel"><h2>KOL画像暂不可用</h2><p class="si-error">${esc(error.message)}</p><button class="a-button" data-kd-retry>重试</button></section>`;host().querySelector('[data-kd-retry]').onclick=draw}
  }
  async function action(fn){
    if(busy)return;busy=true;stop();const stamp=generation
    const controls=[...host().querySelectorAll('input,select,textarea,button')].map(n=>[n,n.disabled]);controls.forEach(([n])=>n.disabled=true)
    try{await fn();if(stamp!==generation)return;dirty=false;busy=false;await draw()}
    catch(error){if(stamp===generation)notice(error.message,true)}
    finally{busy=false;if(stamp===generation)controls.forEach(([n,disabled])=>{if(n.isConnected)n.disabled=disabled})}
  }
  function nav(){return `<div class="kd-nav" aria-label="KOL研究视图">${[['ranking','画像与推荐'],['candidates','发现候选'],['jobs','资料更新'],['legacy','关键词发现']].map(([key,label])=>`<button class="a-button" data-kd-nav="${key}" aria-pressed="${view===key}">${label}</button>`).join('')}<span>内容审阅画像 · 时间 UTC+7</span></div>`}
  function render(){
    legacy?.dispose();legacy=null
    host().innerHTML=`<div class="si-page kd-page"><header class="kd-hero"><div><div class="kd-eyebrow">CREATOR INTELLIGENCE / 中文 X</div><h2>先理解人，再决定与谁合作</h2><p>围绕持续筹码分析，比较内容定位、研究能力、合作入口和证据。</p><div class="kd-method">${esc(data.method.label)}<span>受众和带客效果尚待验证</span></div></div><div class="kd-hero-actions"><button class="a-button" data-kd-refresh>刷新排名</button><button class="a-button a-primary" data-kd-add-toggle>＋ 添加账号</button></div></header>${nav()}<p data-kd-message role="status" class="${isError?'si-error':'a-muted'}">${esc(message)}</p><div data-kd-add hidden></div><div data-kd-body>${view==='legacy'?'<div data-kd-legacy></div>':selected&&detail?detailMarkup():view==='candidates'?candidatesMarkup():view==='jobs'?jobsMarkup():rankingMarkup()}</div><p class="a-muted kd-foot">排名基于当前证据与目标权重，不是转化概率。未提供证据的维度保留未知；粉丝数不直接加分。</p></div>`
    bind()
    if(view==='legacy')mountLegacy()
  }
  function objectiveMarkup(){
    return `<div class="kd-objectives">${Object.entries(data.objectives).map(([key,o])=>`<button data-kd-objective="${key}" aria-pressed="${filters.objective===key}"><strong>${esc(o.label)}</strong><span>${esc(o.description)}</span></button>`).join('')}</div>`
  }
  function rankingMarkup(){
    const s=data.summary
    return `<div class="kd-stats">${[['候选账号',s.accounts,'以账号为单位'],['可比较画像',s.ranked,'当前推荐目标'],['待补充画像',s.pending,'缺内容判断，不强行评分'],['已采集内容',s.posts,'每账号样本范围不同']].map(([l,v,n])=>`<div><span>${l}</span><strong>${pretty(v)}</strong><small>${n}</small></div>`).join('')}</div>${objectiveMarkup()}<section class="a-card si-panel kd-ranking"><form class="kd-filters" data-kd-filter><label>找账号或定位<input name="q" maxlength="120" value="${esc(filters.q)}" placeholder="账号、研究方向、标签…"></label><label>画像状态<select name="status">${[['all','全部画像'],['ranked','可比较'],['pending','待画像'],['limited','样本有限 / 待复核']].map(([v,l])=>option(v,l,filters.status)).join('')}</select></label><label>跟进状态<select name="stage">${option('','全部状态',filters.stage)}${Object.entries(data.stages).map(([v,l])=>option(v,l,filters.stage)).join('')}</select></label><button class="a-button" type="submit">筛选</button><button class="a-button" type="button" data-kd-reset>重置</button></form><div class="kd-listhead"><strong>${esc(data.objectives[filters.objective].label)}候选排名</strong><span>${data.total} 位匹配 · 仅比较证据可用的候选</span><button class="a-button" data-kd-method>查看排名依据</button></div><div data-kd-method-panel hidden>${methodMarkup()}</div>${data.accounts.length?data.accounts.map(a=>accountCard(a,{esc,stages:data.stages})).join(''):`<div class="kd-empty"><h3>从一组了解过的账号开始</h3><p>导入已核查的真实账号，或添加新的中文创作者。</p>${data.bootstrap_available?'<button class="a-button a-primary" data-kd-bootstrap>导入已审阅的8位候选</button>':'<button class="a-button" data-kd-empty-add>添加账号</button>'}</div>`}<div class="kd-pagination"><button class="a-button" data-kd-prev ${data.offset===0?'disabled':''}>上一页</button><span>${data.total?data.offset+1:0}—${Math.min(data.offset+data.accounts.length,data.total)} / ${data.total}</span><button class="a-button" data-kd-next ${data.offset+data.limit>=data.total?'disabled':''}>下一页</button></div></section>`
  }
  function methodMarkup(){
    const o=data.objectives[filters.objective]
    return `<div class="kd-method-panel"><p>目标：${esc(o.description)}。语义维度由内容审阅给出0—5分，并要求引用当前样本。</p><div class="kd-tags">${Object.entries(o.weights).map(([key,weight])=>`<span>${esc(key==='distribution'?'相关内容分发':data.dimension_labels[key])} ${weight}%</span>`).join('')}</div><p>推荐指数 = 已知维度的加权得分 ÷ 已知维度权重。缺失项不记0分；覆盖不足60%、原创样本不足3条、资料过期或样本变化待复核时不进入排名。相关分发至少需要3条被画像引用的原创内容及曝光数据。</p><p>证据可信度另看样本量、时间跨度和新鲜度。评论者与受众尚未采样，不能推断粉丝真实性、购买力或实际转化。</p></div>`
  }
  function detailMarkup(){
    const a=detail.account,r=a.recommendation,review=a.review
    if(editing)return editorMarkup()
    const references=new Map(detail.evidence_posts.map(p=>[p.id,p]))
    return `<section class="a-card si-panel kd-detail"><div class="kd-detail-head"><div><a class="kd-back" href="#" data-kd-back>← 返回推荐</a><h2>${esc(a.name)} <small>@${esc(a.username)}</small></h2><p>${esc(a.profile?.description||'尚未取得公开简介')}</p><div class="kd-tags"><span>${esc(CONFIDENCE[r.confidence])}</span><span>${esc(data.stages[a.stage])}</span><span>关注者 ${pretty(a.profile?.followers)}</span></div></div><div class="kd-detail-actions"><a class="a-button" href="${esc(a.profile_url)}" target="_blank" rel="noopener noreferrer">X 主页 ↗</a><button class="a-button" data-kd-update ${data.running||!data.configured?'disabled':''}>${data.running?'资料任务运行中':'更新账号资料'}</button><button class="a-button a-primary" data-kd-edit ${!a.snapshot_id?'disabled':''}>${review?'编辑 / 复核画像':'补充内容画像'}</button></div></div>${r.blockers.length?`<div class="kd-alert">${esc(r.blockers.join(' · '))}。原画像和证据会保留。</div>`:''}<div class="kd-detail-grid"><div><section class="kd-section"><span class="kd-eyebrow">内容定位 · 审阅判断</span><h3>${esc(review?.positioning||'待补充画像')}</h3><p>${esc(review?.summary||'已加入候选池。采集主页和历史内容后，再判断其定位与合作适配。')}</p><div class="kd-tags">${(review?.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div>${review?`<small class="a-muted">${esc(a.reviewer)} · ${time(a.reviewed_at)} · 依据对应版本样本</small>`:''}</section><section class="kd-section"><h3>为什么推荐 / 哪些还不知道</h3>${r.dimensions.map(d=>`<article class="kd-dimension"><div><strong>${esc(d.label)}</strong><span>权重 ${d.weight}% · ${d.value==null?'未知':d.value.toFixed(1)+'/5'}</span></div><div class="kd-meter"><i style="width:${d.value==null?0:d.value*20}%"></i></div><p>${esc(d.reason)}</p><div class="kd-refs">${d.evidence_ids.map((id,i)=>`<a href="${esc(references.get(id)?.url||'https://x.com/'+a.username+'/status/'+id)}" target="_blank" rel="noopener noreferrer">证据 ${i+1} ↗</a>`).join('')}</div></article>`).join('')}</section><section class="kd-section"><h3>建议切入点</h3><p>${esc(review?.approach||'先补充画像，避免在不了解任务的情况下发送推广。')}</p><h3>需要留意</h3><p>${esc(review?.risks||'尚未完成内容与合作背景核查。')}</p><h3>待核实事项</h3><p>${esc(review?.unknowns||'受众、合作范围、报价、实际带客效果未知。')}</p></section><details class="kd-section"><summary>已采集内容与证据（${detail.posts.length}条）</summary><p class="a-muted">更新于 ${time(a.fetched_at)}。最多抓取3页，${a.has_more?'仍有更早内容未采集':'本次分页已结束'}；指标按最近90天样本计算。</p>${detail.posts.map(p=>`<article class="kd-post"><div><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">原帖 ↗</a><small>${time(Date.parse(p.createdAt))}${p.retweeted_tweet?' · 转推，不计原创':''}</small></div><p>${esc(p.text)}</p><small>曝光 ${pretty(p.viewCount)} · 点赞 ${pretty(p.likeCount)} · 回复 ${pretty(p.replyCount)}</small></article>`).join('')}</details></div><aside><section class="kd-score-panel"><span>${esc(data.objectives[filters.objective].label)}推荐指数</span><strong>${r.score??'—'}</strong><p>已知维度覆盖 ${r.coverage}% · ${esc(CONFIDENCE[r.confidence])}</p><small>不代表获客概率或预期交付人数</small></section><section class="kd-section"><h3>可观察指标</h3><dl class="kd-observed">${[['样本总量',r.metrics.sample_posts],['近90天原创',r.metrics.original_posts],['样本曝光中位数',r.metrics.median_views],['相关证据曝光中位数',r.related_median_views],['点赞中位数',r.metrics.median_likes],['回复中位数',r.metrics.median_replies]].map(([l,v])=>`<div><dt>${l}</dt><dd>${pretty(v)}</dd></div>`).join('')}</dl><p class="a-muted">样本跨度不同。曝光与互动只作观察，不证明真实受众或带客能力。</p></section><section class="kd-section"><h3>合作跟进</h3><form data-kd-follow><label>状态<select name="stage">${Object.entries(data.stages).map(([v,l])=>option(v,l,a.stage)).join('')}</select></label><label>负责人<input name="assignee" maxlength="80" value="${esc(a.assignee)}"></label><label>下次跟进 · UTC+7<input name="next" type="datetime-local" value="${local(a.next_followup_at)}"></label><label>档案备注<textarea name="notes" maxlength="4000" rows="3">${esc(a.notes)}</textarea></label><label>本次记录<textarea name="content" maxlength="2000" rows="3" placeholder="记录实际沟通与下一步"></textarea></label><button class="a-button a-primary" type="submit">保存跟进</button></form><div class="kd-history">${detail.history.map(h=>`<article><span>${esc(data.stages[h.stage])} · ${time(h.created_at)}</span><p>${esc(h.content)}</p></article>`).join('')||'<p class="a-muted">暂无跟进记录</p>'}</div></section></aside></div></section>`
  }
  function editorMarkup(){
    const a=detail.account,v=a.review||{positioning:'',summary:'',approach:'',risks:'',unknowns:'',tags:[],dimensions:{}},fields={positioning:'内容定位',summary:'内容画像与推荐理由',approach:'合作切入点',risks:'需要留意',unknowns:'待核实事项'}
    return `<section class="a-card si-panel kd-editor"><div class="kd-listhead"><h2>内容画像审阅 · ${esc(a.name)}</h2><button class="a-button" data-kd-edit-cancel>返回画像</button></div><p class="a-muted">基于当前采集内容填写。评分是审阅判断，需引用证据；不知道的维度选择“未知”。保存后重算三个目标的推荐指数。</p><form data-kd-review>${Object.entries(fields).map(([key,label])=>`<label>${label}<textarea name="${key}" rows="${key==='positioning'?2:3}" maxlength="${key==='positioning'?800:2000}" required>${esc(v[key])}</textarea></label>`).join('')}<label>标签（逗号分隔，最多8个）<input name="tags" maxlength="250" value="${esc(v.tags.join('，'))}"></label><h3>评分与来源</h3>${Object.entries(data.dimension_labels).map(([key,label])=>{const d=v.dimensions[key]||{value:null,reason:'尚无足够证据',evidence_ids:[]};return `<fieldset><legend>${esc(label)}</legend><label>审阅评分<select name="score_${key}">${option('','未知',d.value??'')}${Array.from({length:11},(_,i)=>i/2).map(n=>option(n,n+'/5',d.value??'')).join('')}</select></label><label>理由<textarea name="reason_${key}" rows="2" maxlength="500" required>${esc(d.reason)}</textarea></label><label>证据（可多选；显示当前样本）<select multiple size="4" name="refs_${key}">${detail.posts.map(p=>`<option value="${esc(p.id)}" ${d.evidence_ids.includes(p.id)?'selected':''}>${esc(p.text.replace(/\s+/g,' ').slice(0,100))}</option>`).join('')}</select></label></fieldset>`}).join('')}<button class="a-button a-primary" type="submit">保存画像并重算推荐</button></form></section>`
  }
  function candidatesMarkup(){
    const rows=candidateData?.candidates||[]
    return `<section class="a-card si-panel"><div class="kd-listhead"><h2>发现下一批候选</h2><span>从中文内容与已研究账号的公开提及扩展</span></div><p class="a-muted">${esc(candidateData?.note||'正在读取候选…')}</p><div class="kd-candidates">${rows.map(c=>`<article><div><strong>${esc(c.name)}</strong><a href="https://x.com/${esc(c.username)}" target="_blank" rel="noopener noreferrer">@${esc(c.username)} ↗</a></div><span class="kd-tag">${esc(c.source)}</span><p>${esc(c.evidence)}</p><div><a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">发现证据 ↗</a><button class="a-button" data-kd-add-candidate="${esc(c.username)}">加入候选池</button></div></article>`).join('')||'<div class="kd-empty">还没有新的候选。可添加种子账号，或从关键词发现补充来源。</div>'}</div></section>`
  }
  function jobsMarkup(){return `<section class="a-card si-panel"><h2>账号资料更新</h2><p class="a-muted">每次更新主页和最近最多3页内容。资料有变化时，原画像保留并标为待复核；不会自动编写新的语义判断。</p><p>今日数据读取估算 $${data.budget.estimated_usd.toFixed(4)} / $${data.budget.limit_usd.toFixed(2)} · 与关键词采集共享预算</p>${data.jobs.length?ctx.table(['账号','开始 · UTC+7','状态','采集内容','页数','结果'],data.jobs.map(j=>[esc(j.name),time(j.started_at),esc(({running:'更新中',complete:'完成',failed:'失败',interrupted:'中断'})[j.state]||j.state),pretty(j.posts),pretty(j.pages),esc(j.error||'—')])):'<div class="kd-empty">暂无账号更新任务。可在账号画像中更新资料。</div>'}</section>`}
  async function mountLegacy(){
    const stamp=generation
    const {createXAcquisition}=await import('./xAcquisition.js');if(stamp!==generation||view!=='legacy')return
    legacy=createXAcquisition({...ctx,$:selector=>selector==='#as-output'?host().querySelector('[data-kd-legacy]'):ctx.$(selector),clear(){}})
    legacy.draw()
  }
  function showAdd(){
    const box=host().querySelector('[data-kd-add]');box.hidden=!box.hidden
    if(!box.hidden){box.innerHTML=`<form class="kd-addform" data-kd-addform><label>中文KOL的X账号或主页<input name="username" required maxlength="200" placeholder="@username 或 https://x.com/username"></label><button class="a-button a-primary" type="submit">添加并采集资料</button><p class="a-muted">采集后先标为待画像；不会自动联络对方。</p></form>`;box.querySelector('form').onsubmit=e=>{e.preventDefault();addAccount(new FormData(e.target).get('username'),true)}}
  }
  function addAccount(username,refresh=false){return action(async()=>{const result=await xRequest('/kol/accounts','POST',{username});if(refresh&&data.configured)await xRequest(endpoint(result.account.id)+'/refresh','POST',{});view='ranking';selected=result.account.id;editing=false;notice(refresh&&data.configured?'账号已加入，正在采集资料；语义画像待补充':'已加入候选池，可在详情采集资料并补充画像')})}
  function bind(){
    const node=host()
    node.querySelector('[data-kd-refresh]').onclick=()=>{if(!dirty)draw();else notice('请先保存正在编辑的内容',true)}
    node.querySelector('[data-kd-add-toggle]').onclick=showAdd
    node.querySelectorAll('[data-kd-nav]').forEach(b=>b.onclick=()=>{selected=null;editing=false;dirty=false;view=b.dataset.kdNav;draw()})
    node.querySelectorAll('[data-kd-objective]').forEach(b=>b.onclick=()=>{filters.objective=b.dataset.kdObjective;filters.offset=0;draw()})
    node.querySelector('[data-kd-filter]')?.addEventListener('submit',e=>{e.preventDefault();filters={...filters,...Object.fromEntries(new FormData(e.target)),offset:0};draw()})
    node.querySelector('[data-kd-reset]')?.addEventListener('click',()=>{filters={objective:filters.objective,q:'',stage:'',status:'all',offset:0};draw()})
    node.querySelector('[data-kd-method]')?.addEventListener('click',()=>{const panel=node.querySelector('[data-kd-method-panel]');panel.hidden=!panel.hidden})
    node.querySelector('[data-kd-prev]')?.addEventListener('click',()=>{filters.offset=Math.max(0,data.offset-20);draw()})
    node.querySelector('[data-kd-next]')?.addEventListener('click',()=>{filters.offset=data.offset+20;draw()})
    node.querySelectorAll('[data-kd-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.kdOpen;editing=false;draw()})
    node.querySelector('[data-kd-back]')?.addEventListener('click',e=>{e.preventDefault();selected=null;editing=false;draw()})
    node.querySelector('[data-kd-bootstrap]')?.addEventListener('click',()=>action(async()=>{const r=await xRequest('/kol/bootstrap','POST',{});notice('已导入'+r.imported.length+'位已审阅候选')}))
    node.querySelector('[data-kd-empty-add]')?.addEventListener('click',showAdd)
    node.querySelectorAll('[data-kd-add-candidate]').forEach(b=>b.onclick=()=>addAccount(b.dataset.kdAddCandidate))
    node.querySelector('[data-kd-update]')?.addEventListener('click',()=>action(async()=>{await xRequest(endpoint(selected)+'/refresh','POST',{});notice('账号资料更新已启动；新内容需要复核画像')}))
    node.querySelector('[data-kd-edit]')?.addEventListener('click',()=>{editing=true;render()})
    node.querySelector('[data-kd-edit-cancel]')?.addEventListener('click',()=>{editing=false;dirty=false;render()})
    const follow=node.querySelector('[data-kd-follow]')
    if(follow){follow.oninput=()=>{dirty=true};follow.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(follow));action(async()=>{await xRequest(endpoint(selected),'PATCH',{stage:v.stage,assignee:v.assignee,notes:v.notes,content:v.content,next_followup_at:parseTime(v.next),expected_updated_at:detail.account.updated_at,objective:filters.objective});notice('合作跟进已保存')})}}
    const form=node.querySelector('[data-kd-review]')
    if(form){form.oninput=()=>{dirty=true};form.onsubmit=e=>{
      e.preventDefault();const v=Object.fromEntries(new FormData(form)),dimensions={}
      for(const key of Object.keys(data.dimension_labels))dimensions[key]={value:v['score_'+key]===''?null:Number(v['score_'+key]),reason:v['reason_'+key],evidence_ids:[...form.elements['refs_'+key].selectedOptions].map(o=>o.value)}
      const review={positioning:v.positioning,summary:v.summary,approach:v.approach,risks:v.risks,unknowns:v.unknowns,tags:v.tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean),dimensions}
      action(async()=>{await xRequest(endpoint(selected)+'/review','PUT',{review,snapshot_id:detail.account.snapshot_id,expected_updated_at:detail.account.updated_at,objective:filters.objective});editing=false;notice('画像已保存，推荐排名已重算')})
    }}
  }
  return {draw,dispose(){generation++;stop();legacy?.dispose();legacy=null;dirty=false},hasPendingChanges:()=>dirty||busy||legacy?.hasPendingChanges?.()||false}
}
