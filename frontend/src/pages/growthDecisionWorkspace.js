import {getToken} from '../auth/authClient.js'
import {mountAIWeeklyReport} from './aiWeeklyReportPanel.js'
const BASE=import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001'
const safe=v=>String(v??'未知').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))
async function api(path,method='GET',body,signal){
 const response=await fetch(BASE+'/api/growth-workspace'+path,{method,signal,
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},
  ...(body?{body:JSON.stringify(body)}:{})})
 const data=await response.json().catch(()=>({}))
 if(!response.ok)throw Error(data.error||'增长决策工作台暂不可用')
 return data
}
const fmt=v=>v==null?'未知':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v)
const dateTime=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('zh-CN',{timeZone:'Asia/Bangkok',hour12:false}):'时间未知'}
function evidenceMarkup(e){
 const period=e.period||{},warnings=Array.isArray(e.warnings)?e.warnings:[];
 return '<div class="gws-evidence"><h4>指标证据</h4><dl>'+
  [['指标',e.metricId||e.metric_id],['来源',e.source],['状态',e.state||e.status],
   ['数据开始',period.start?dateTime(period.start):null],['数据结束',period.end?dateTime(period.end):null],
   ['采集时间',e.observedAt?dateTime(e.observedAt):null]]
  .map(([key,value])=>'<div><dt>'+safe(key)+'</dt><dd>'+safe(value)+'</dd></div>').join('')+'</dl>'+
  '<p>'+safe(warnings.length?'覆盖限制：'+warnings.join('；'):'未提供数据覆盖限制说明，不能据此推断历史完整。')+'</p>'+
  '<details><summary>完整指标证据（技术详情）</summary><pre>'+safe(JSON.stringify(e,null,2))+'</pre></details></div>';
}
function problemMarkup(data){
 const p=data.problem||{},history=Array.isArray(data.history)?data.history:[];
 return '<div class="gws-evidence"><h4>'+safe(p.subject||'问题记录')+'</h4><p>'+safe(p.description||'未提供描述')+'</p>'+
  '<p>状态：'+safe(p.status)+' · 优先级：'+safe(p.priority)+' · 下一步：'+safe(p.next_step)+'</p>'+
  '<h4>状态与调查历史 · '+history.length+' 条</h4>'+
  (history.length?'<ol class="gws-timeline">'+history.map(e=>
   '<li><time>'+safe(dateTime(e.at))+'</time><strong>'+safe(e.event_type||e.kind||e.type||'历史记录')+'</strong>'+
   (e.details?.reason?'<p>原因：'+safe(e.details.reason)+'</p>':'')+
   (e.details?.from||e.details?.to?'<p>'+safe(e.details?.from||'—')+' → '+safe(e.details?.to||'—')+'</p>':'')+
   ((e.evidenceIds||[]).length?'<p>关联证据：'+(e.evidenceIds||[]).map(safe).join('、')+'</p>':'')+
   '<details><summary>完整记录</summary><pre>'+safe(JSON.stringify(e,null,2))+'</pre></details></li>'
  ).join('')+'</ol>':'<p>暂无状态变更记录。</p>')+'</div>';
}

export function mountGrowthDecisionWorkspace(root,{navigate=null}={}){
 let disposed=false,seq=0,controller=null,disposeWeekly=null
 async function draw(){
  disposeWeekly?.();disposeWeekly=null;
  controller?.abort();controller=new AbortController()
   const version=++seq
  root.innerHTML='<p class="a-muted">正在读取目标、问题与周期报告…</p>'
  try{
   const d=await api('/dashboard','GET',undefined,controller.signal)
   if(disposed||version!==seq)return
   const goals=d.goals||[],issues=d.problems||[],actions=d.actions||[],reports=d.reports||[]
   const executive=d.executive||{},north=executive.latestVerifiedNorthStar||null
   const waiting=Array.isArray(executive.awaitingApproval)?executive.awaitingApproval:[]
   const reviews=Array.isArray(executive.reviewsDue)?executive.reviewsDue:[]
   const reminders=Array.isArray(executive.reminders?.pending)?executive.reminders.pending:[]
   const portfolio=Array.isArray(executive.portfolio?.items)?executive.portfolio.items:[]
   const topIssues=issues.filter(x=>['open','monitoring'].includes(x.status)).slice(0,3);
   const moreIssues=issues.filter(x=>!topIssues.includes(x));
   const business=moreIssues.filter(x=>x.type==='business'),data=moreIssues.filter(x=>x.type==='data-quality'),other=moreIssues.filter(x=>!['business','data-quality'].includes(x.type))
   root.innerHTML=`<section class="a-card a-details ga-ws-weekly" aria-label="AI 运营周报"><div data-ai-weekly-report>正在加载 AI 周报…</div></section>
   <section class="a-card a-details ga-ws-executive" aria-label="AI 增长执行官待办">
    <div class="ga-ws-section-title"><h2>增长执行官 · 今日决策</h2><span>证据驱动 · 对外执行需批准</span></div>
    <p>北极星：筹码峰查看/下钻去重用户；真实交易独立统计。月目标：${executive.northStar?.target==null?'未配置':fmt(executive.northStar.target)+' 人'}。</p>
    <div class="ga-ws-stats">
     <div><strong>最近可信日分析用户</strong><p>${north?fmt(north.value):'未知'}</p><small>${north?dateTime(north.period.end)+' 截止':'需完整水位与身份核验'}</small></div>
     <div><strong>待批准行动</strong><p>${fmt(executive.waitingApproval??0)}</p></div>
     <div><strong>到期待复盘</strong><p>${fmt(reviews.length)}</p></div>
     <div><strong>超期运营任务</strong><p>${fmt(executive.overdueTasks?.length??0)}</p></div>
    </div>
    ${(executive.priorities||[]).length?'<h3>本轮优先问题</h3>'+executive.priorities.slice(0,3).map(p=>'<p><strong>'+safe(p.subject)+'</strong> · 优先级 '+safe(p.priority)+'/5 · '+safe(p.nextStep||'待调查')+'</p>').join(''):'<p>暂无可信新增问题；未知来源不代表经营正常。</p>'}
    ${waiting.length?'<h3>待批准的内部行动</h3>'+waiting.map(a=>'<div class="ga-ws-action"><strong>'+safe(a.description)+'</strong><span>'+safe(a.assignee)+'</span><button class="a-button" data-executive-approve="'+safe(a.id)+'">采纳为待执行（不对外操作）</button></div>').join(''):'<p>暂无待批准的内部建议。</p>'}
    ${reviews.length?'<p role="status">有 '+reviews.length+' 项行动观察期已到；须提供匹配的后续证据后才能复盘，不会自动宣称改善。</p>':''}
    <details class="ga-ws-accordion"><summary>经营机会与调查队列（${portfolio.length}）</summary><div class="ga-ws-expand">
    ${portfolio.slice(0,8).map(p=>'<div class="ga-ws-action"><strong>'+safe(p.subject)+'</strong><span>'+safe(p.decision)+' · 影响人数未知 · 预计ROI未核验 · '+safe(p.evidenceStrength)+'</span></div>').join('')||'<p>暂无可比较的机会。</p>'}
    </div></details>
    <details class="ga-ws-accordion"><summary>运营学习与目标核对</summary><div class="ga-ws-expand">
     <p>已复盘 ${fmt(executive.learning?.reviewed??0)}，观察改善 ${fmt(executive.learning?.observedImprovement??0)}，观察下降 ${fmt(executive.learning?.observedDecline??0)}。前后变化不代表因果。</p>
     <p>目标核对：${safe(executive.goalAlignment?.status||'未核验')}；不同周期目标不会相加或覆盖。</p>
    </div></details>
    ${reminders.length?'<h3>站内待办提醒（'+reminders.length+'）</h3>'+reminders.slice(0,8).map(n=>'<div class="ga-ws-action"><strong>'+safe(n.kind)+'</strong><span>到期 '+safe(dateTime(n.dueAt))+'</span><button class="a-button" data-exec-notice="'+safe(n.id)+'">已知悉</button></div>').join(''):'<p>暂无新的站内提醒。</p>'}
    <small>自动只读观察、问题追踪与内部建议；不会自动发布、付费或修改生产环境。数据不完整时不制造下降结论。</small>
   </section><section class="a-card a-details ga-ws-overview"><div class="ga-ws-section-title"><h2>本月工作概览</h2><span>基于已保存的数据和人工记录</span></div>
   <div class="ga-ws-stats">
    <div><strong>当前月</strong><p>${safe(new Date(d.month.start+25200000).toISOString().slice(0,7))}</p></div>
    <div><strong>未解决问题</strong><p>${issues.filter(x=>['open','monitoring'].includes(x.status)).length}</p></div>
    <div><strong>数据质量问题</strong><p>${issues.filter(x=>x.type==='data-quality'&&['open','monitoring'].includes(x.status)).length}</p></div>
    <div><strong>待跟进行动</strong><p>${actions.filter(a=>!['executed','rejected'].includes(a.status)).length}</p></div>
   </div></section>
   <section class="a-card a-details ga-ws-goals"><div class="ga-ws-section-title"><h2>月度目标</h2><span>${goals.length} 项</span></div>
   ${goals.length?'<p class="ga-ws-intro">当前目标：'+goals.slice(0,2).map(({goal:g})=>safe(g.metric_id)).join('、')+(goals.length>2?' 等':'')+'</p>':'<p class="ga-ws-intro">暂未设置目标，进度不能判断。</p>'}
   <details class="ga-ws-accordion"><summary>查看目标与设置</summary><div class="ga-ws-expand">
   <h3>已有目标</h3>
   ${goals.map(({goal:g,progress:p})=>`<article class="a-card a-details"><strong>${safe(g.metric_id)} · v${g.version} ${g.kind==='north'?'（北极星）':''}</strong>
    <p>目标 ${fmt(g.target_value)} ${safe(g.unit)} · ${safe(g.aggregation)} · 当前观测 ${p.observed==null?'未知':fmt(p.observed)} · 差距 ${p.delta==null?'未知':fmt(p.delta)}</p><small>生效 ${safe(new Date(g.effective_at).toISOString())} · 数据状态 ${safe(p.status)}${p.status==='partial'?'：覆盖未确认，不能判断目标是否达成':''}</small>
    ${p.evidenceId?`<button class="a-button" data-evidence="${safe(p.evidenceId)}" aria-expanded="false">查看指标证据</button><div class="gws-detail" data-gws-detail aria-live="polite" hidden></div>`:''}
   </article>`).join('')||'<p>尚无月度目标。创建后需由后端已批准数据适配器提供指标证据。</p>'}
   <form data-add-goal><strong>新增月目标</strong><div style="display:flex;gap:8px;flex-wrap:wrap">
    <label>指标 ID <input name="metric" required placeholder="正式指标 ID"></label>
    <label>指标定义版本 <input name="definition" required placeholder="例如 1"></label>
    <label>目标数值 <input name="target" type="number" min="0" step="any" required></label>
    <label>单位 <input name="unit" required placeholder="users"></label>
    <label>聚合方式 <select name="aggregation"><option value="snapshot">窗口快照</option><option value="rolling-distinct">滚动窗口去重</option><option value="sum">周期累计</option><option value="ratio">比例</option></select></label>
    <label>方向 <select name="direction"><option value="increase">越高越好</option><option value="decrease">越低越好</option></select></label>
    <label>类别 <select name="kind"><option value="north">北极星</option><option value="supporting">辅助</option></select></label>
    <button class="a-button a-primary" type="submit">保存目标</button></div><small>不更改正式指标口径；版本和证据窗口单独保存。</small></form>
   </div></details><p role="status" data-workspace-message></p></section>
   <section class="a-card a-details ga-ws-issues"><div class="ga-ws-section-title"><h2>优先处理</h2><span>${issues.filter(x=>['open','monitoring'].includes(x.status)).length} 项未解决</span></div>
    ${topIssues.map(issueCard).join('')||'<p class="ga-ws-intro">暂无待处理问题；不代表业务正常。</p>'}
    ${moreIssues.length?'<details class="ga-ws-accordion"><summary>其他问题（'+moreIssues.length+'）</summary><div class="ga-ws-expand">'+issueGroup('业务表现',business)+issueGroup('数据质量',data)+issueGroup('其他研究',other)+'</div></details>':''}
    <details class="ga-ws-accordion"><summary>手工新增问题</summary><div class="ga-ws-expand"><form data-add-problem><strong>主动提出问题</strong><label>主题 <input name="subject" required placeholder="例如：调查某个推荐人的有效分析"></label>
     <label>要查什么 <textarea name="description" required rows="2"></textarea></label><button type="submit" class="a-button a-primary">加入问题池</button></form></div></details>
   </section>
   <section class="a-card a-details ga-ws-actions"><div class="ga-ws-section-title"><h2>运营行动与复盘</h2><span>${actions.filter(a=>!['executed','rejected'].includes(a.status)).length} 项待跟进</span></div>
    ${actions.slice(0,4).map(a=>`<div class="ga-ws-action"><strong>${safe(a.description)}</strong><span>${safe(a.assignee)} · ${safe(a.status)} · ${safe(a.review?.outcome||'未评价')}</span></div>`).join('')||'<p class="ga-ws-intro">暂无关联行动。可以从问题调查中创建行动。</p>'}
    ${actions.length>4?`<details class="ga-ws-accordion"><summary>全部行动（${actions.length}）</summary><div class="ga-ws-expand">${actions.slice(4,30).map(a=>`<div class="ga-ws-action"><strong>${safe(a.description)}</strong><span>${safe(a.assignee)} · ${safe(a.status)} · ${safe(a.review?.outcome||'未评价')}</span></div>`).join('')}</div></details>`:''}
   </section>
   <section class="a-card a-details ga-ws-archive"><details><summary>历史业务快照（规则草稿，不调用 AI 模型）</summary>
    <p>用于保存当期目标、问题和行动 ID；不是 AI 周报，不代表 AI 生成成功。</p>
    ${['daily','weekly','monthly'].map(k=>`<button class="a-button" data-period="${k}">保存${{daily:'日',weekly:'周',monthly:'月'}[k]}报快照</button>`).join(' ')}
    ${reports.slice(0,20).map(r=>`<p>${safe(r.kind)} · ${safe(new Date(r.period_start+25200000).toISOString().slice(0,10))} · 修订 v${r.revision} · ${safe(r.status)} · 问题 ${r.snapshot?.problemIds?.length??'未知'} 项</p>`).join('')||'<p>尚无业务快照。</p>'}
   </details></section>`
   bind(d)
   root.querySelectorAll('[data-exec-notice]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true
    try{await api('/executive/reminders/'+encodeURIComponent(btn.dataset.execNotice)+'/ack','POST',{});await draw()}
    catch(error){const message=root.querySelector('[data-workspace-message]');if(message)message.textContent=error.message;btn.disabled=false}
   }))
   root.querySelectorAll('[data-executive-approve]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true
    try{
     await api('/actions/'+encodeURIComponent(btn.dataset.executiveApprove)+'/status','POST',{status:'accepted'})
     await draw()
    }catch(error){
     const message=root.querySelector('[data-workspace-message]')
     if(message)message.textContent=error.message
     btn.disabled=false
    }
   }))
   const weeklyRoot=root.querySelector('[data-ai-weekly-report]');
   if(weeklyRoot)disposeWeekly=mountAIWeeklyReport(weeklyRoot,{api,safe,navigate,
    onCreateProblem:async ({subject,description})=>{
     await api('/problems','POST',{subject,description});
     const message=root.querySelector('[data-workspace-message]');
     if(message)message.textContent='已从 AI 周报添加待处理问题。重新打开页面可在问题池查看。';
    }});
  }catch(error){if(!disposed&&version===seq)root.innerHTML=`<section class="a-card a-details"><h2>决策工作台未就绪</h2><p role="alert">${safe(error.message)}</p><button class="a-button" data-retry>重新读取</button></section>`;root.querySelector('[data-retry]')?.addEventListener('click',draw)}
 }
 function issueCard(i){
  return `<article class="ga-ws-issue"><div class="ga-ws-issue-head"><strong>${safe(i.subject)}</strong><span>${safe(i.type==='data-quality'?'数据质量':i.type==='business'?'业务表现':'研究问题')} · ${safe(i.status)}</span></div>
   <p>${safe(i.description)}</p>
   <div class="ga-ws-issue-footer"><span>优先级 ${safe(i.priority)} · 下一步：${safe(i.next_step)}</span>
   <div><button class="a-button" data-history="${safe(i.id)}" aria-expanded="false">证据与历史</button>
   <button class="a-button" data-investigate="${safe(i.id)}">创建调查</button></div></div>
   <div class="gws-detail" data-gws-detail aria-live="polite" hidden></div></article>`;
 }
 function issueGroup(label,items){
  return items.length?`<h3>${safe(label)}（${items.length}）</h3>${items.slice(0,20).map(issueCard).join('')}`:'';
 }
 function bind(d){
  const say=v=>{const message=root.querySelector('[data-workspace-message]');if(message)message.textContent=v;else window.alert(v)}
  const goalForm=root.querySelector('[data-add-goal]')
  goalForm?.addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(goalForm),b={metricId:String(form.get('metric')).trim(),definitionVersion:String(form.get('definition')).trim(),target:Number(form.get('target')),unit:String(form.get('unit')).trim(),direction:form.get('direction'),aggregation:form.get('aggregation'),kind:form.get('kind'),periodStart:d.month.start,periodEnd:d.month.end,scope:{source:'all'}};
   try{await api('/goals','POST',b);await draw()}catch(error){say(error.message)}
  })
  const form=root.querySelector('[data-add-problem]');form?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form);try{await api('/problems','POST',{subject:String(fd.get('subject')).trim(),description:String(fd.get('description')).trim()});await draw()}catch(error){say(error.message)}})
  root.querySelectorAll('[data-period]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await api('/reports/'+btn.dataset.period,'POST',{publish:false});await draw()}catch(error){btn.disabled=false;say(error.message)}}))
  root.querySelectorAll('[data-investigate]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{const v=await api('/problems/'+encodeURIComponent(btn.dataset.investigate)+'/investigations','POST',{});say('已创建待执行调查 '+v.id+'。未启动付费模型。')}catch(error){say(error.message)}finally{btn.disabled=false}}))

  const reveal=async(btn,fetcher,renderer)=>{
   const target=btn.closest('article')?.querySelector('[data-gws-detail]');
   if(!target)return;
   if(!target.hidden){target.hidden=true;btn.setAttribute('aria-expanded','false');return}
   btn.disabled=true;target.hidden=false;target.textContent='正在读取证据…';
   try{target.innerHTML=renderer(await fetcher())}
   catch(error){target.textContent='读取失败：'+error.message}
   finally{btn.disabled=false;btn.setAttribute('aria-expanded','true')}
  }
  root.querySelectorAll('[data-history]').forEach(btn=>btn.addEventListener('click',()=>
    reveal(btn,()=>api('/problems/'+encodeURIComponent(btn.dataset.history)),problemMarkup)))
  root.querySelectorAll('[data-evidence]').forEach(btn=>btn.addEventListener('click',()=>
    reveal(btn,()=>api('/evidence/'+encodeURIComponent(btn.dataset.evidence)),evidenceMarkup)))
 }
 draw()
 return ()=>{disposed=true;seq++;controller?.abort();disposeWeekly?.()}
}
