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
   const business=issues.filter(x=>x.type==='business'),data=issues.filter(x=>x.type==='data-quality'),other=issues.filter(x=>!['business','data-quality'].includes(x.type))
   root.innerHTML=`<section class="a-card a-details" aria-label="AI 运营周报"><div data-ai-weekly-report>正在加载 AI 周报…</div></section><section class="a-card a-details"><h2>月度目标和决策工作台</h2>
   <p>仅查看已保存的事实、问题和人工执行状态；未绑定正式数据时进度显示未知。此页面不会自动付费、发布或修改用户权益。</p>
   <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
    <div><strong>当前月</strong><p>${safe(new Date(d.month.start+25200000).toISOString().slice(0,7))}</p></div>
    <div><strong>未解决问题</strong><p>${issues.filter(x=>['open','monitoring'].includes(x.status)).length}</p></div>
    <div><strong>数据质量问题</strong><p>${data.filter(x=>['open','monitoring'].includes(x.status)).length}</p></div>
    <div><strong>待跟进行动</strong><p>${actions.filter(a=>!['executed','rejected'].includes(a.status)).length}</p></div>
   </div>
   <h3>本月目标</h3>
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
   <p role="status" data-workspace-message></p></section>
   <section class="a-card a-details"><h2>重点问题</h2><p>事实问题、数据缺口、待验证假设和人工问题统一管理，但调查运行与人工行动各自独立。</p>
    ${issueGroup('业务表现',business)}${issueGroup('数据质量',data)}${issueGroup('其他研究',other)}
    <form data-add-problem><strong>主动提出问题</strong><label>主题 <input name="subject" required placeholder="例如：调查某个推荐人的有效分析"></label>
     <label>要查什么 <textarea name="description" required rows="2"></textarea></label><button type="submit" class="a-button a-primary">加入问题池</button></form>
   </section>
   <section class="a-card a-details"><h2>人工行动与复盘</h2>
    ${actions.slice(0,30).map(a=>`<article><strong>${safe(a.description)}</strong><p>负责人：${safe(a.assignee)} · ${safe(a.status)} · 效果 ${safe(a.review?.outcome||'未成熟/未评价')}</p></article>`).join('')||'<p>暂无与问题相关联的行动。</p>'}
   </section>
   <section class="a-card a-details"><details><summary>历史业务快照（规则草稿，不调用 AI 模型）</summary>
    <p>用于保存当期目标、问题和行动 ID；不是 AI 周报，不代表 AI 生成成功。</p>
    ${['daily','weekly','monthly'].map(k=>`<button class="a-button" data-period="${k}">保存${{daily:'日',weekly:'周',monthly:'月'}[k]}报快照</button>`).join(' ')}
    ${reports.slice(0,20).map(r=>`<p>${safe(r.kind)} · ${safe(new Date(r.period_start+25200000).toISOString().slice(0,10))} · 修订 v${r.revision} · ${safe(r.status)} · 问题 ${r.snapshot?.problemIds?.length??'未知'} 项</p>`).join('')||'<p>尚无业务快照。</p>'}
   </details></section>`
   bind(d)
   const weeklyRoot=root.querySelector('[data-ai-weekly-report]');
   if(weeklyRoot)disposeWeekly=mountAIWeeklyReport(weeklyRoot,{api,safe,navigate});
  }catch(error){if(!disposed&&version===seq)root.innerHTML=`<section class="a-card a-details"><h2>决策工作台未就绪</h2><p role="alert">${safe(error.message)}</p><button class="a-button" data-retry>重新读取</button></section>`;root.querySelector('[data-retry]')?.addEventListener('click',draw)}
 }
 function issueGroup(label,items){return `<h3>${safe(label)}（${items.length}）</h3>${items.slice(0,20).map(i=>`<article class="a-card a-details"><strong>${safe(i.subject)}</strong><p>${safe(i.description)}</p>
  <p><small>优先级 ${i.priority} · ${safe(i.status)} · 影响 ${safe(i.impact?.status)} · 下一步 ${safe(i.next_step)}</small></p>
  <button class="a-button" data-investigate="${safe(i.id)}">创建人工待执行调查</button>
  <button class="a-button" data-history="${safe(i.id)}" aria-expanded="false">查看证据与历史</button><div class="gws-detail" data-gws-detail aria-live="polite" hidden></div></article>`).join('')||'<p class="a-muted">暂无此类问题；不代表该领域业务正常。</p>'}`}
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
   const target=btn.parentElement?.querySelector('[data-gws-detail]');
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
