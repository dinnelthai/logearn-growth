import {getToken} from '../auth/authClient.js'
import {mountGrowthDecisionWorkspace} from './growthDecisionWorkspace.js'
import {readPathsForTab} from './growthAgentRequestPlan.js'
import {getAutonomyTargets,saveAutonomyTarget,refreshAutonomyBrief} from '../api/aiAnalysis.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')
async function request(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body?{body:JSON.stringify(body)}:{})})
 const data=await response.json().catch(()=>({}))
 if(!response.ok)throw Error(data.error||'Agent 服务不可用')
 return data
}
export function createGrowthAgentControl(ctx){
 const host=()=>ctx.$('#as-output')
 let generation=0
 let workspaceDispose=null
 let activeTab='workspace'
 let ownerToken=getToken(),cache=new Map()
 const cached=path=>{
  const token=getToken()
  if(token!==ownerToken){cache.clear();ownerToken=token}
  if(!cache.has(path))cache.set(path,request(path).catch(e=>{cache.delete(path);throw e}))
  return cache.get(path)
 }
 const invalidate=()=>cache.clear()
 const esc=ctx.esc
 const safe=v=>esc(v==null?'未知':String(v))
 async function draw(){
  if(workspaceDispose){workspaceDispose();workspaceDispose=null}
  ctx.clear();const token=++generation
  host().innerHTML='<section class="a-card a-details">正在读取 AI Growth Agent 状态…</section>'
  const paths=[
   '/api/ai-analysis/growth-agent/status',
   '/api/ai-analysis/growth-agent/briefs?limit=7',
   '/api/ai-analysis/growth-agent/learning',
   '/api/growth-agent/research/questions',
   '/api/growth-agent/prompts/candidates',
   '/api/growth-agent/research/questions?status=approved',
   '/api/ai-analysis/growth-agent/cost-audit?days=7'
  ]
  const wanted=new Set(readPathsForTab(activeTab))
   const results=await Promise.allSettled(paths.map(p=>wanted.has(p)?cached(p):Promise.resolve({})))
  if(token!==generation)return
  const [status,briefs,learning,research,prompts,approved,costAudit]=results.map((x,i)=>x.status==='fulfilled'?x.value:{error:String(x.reason?.message||' unavailable'),endpoint:paths[i]})
  const targetData=activeTab==='runtime'?await getAutonomyTargets().catch(error=>({targets:[],supportedMetrics:[],error:error.message})):null
  if(token!==generation)return
  const err=x=>x?.error?'<p role="alert">'+safe(x.error)+'</p>':''
  const latest=status.latestBrief
  const score=latest?.score?.value??null
  const contentSource=latest?.report?.channelObservations?.x_content_30d||null
  const contentAI=latest?.report?.sections?.find(section=>
   section.goal==='conversion'&&section.status==='completed'&&
   section.skills?.some(skill=>skill.id==='content-growth'))||null
  const rows=briefs.briefs||[],questions=research.questions||[],candidates=prompts.candidates||[]
  const policies=learning.strategies||{}
  host().innerHTML=`
  <section class="a-card a-details"><h2>AI Growth Agent 控制台</h2>
   <p>只读状态与人工审核。查看和刷新不触发付费 AI，也不执行运营修改。</p>
   ${err(status)}
   <div style="display:flex;gap:16px;flex-wrap:wrap">
    <div><strong>调度</strong><p>${status.schedulerRunning?'运行中':status.schedulerConfigured?'未确认运行':'未启用'}</p></div>
    <div><strong>最近日报</strong><p>${safe(latest?.day)} · ${safe(latest?.status)}</p></div>
    <div><strong>业务目标评分</strong><p>${score==null?'未达到评分条件':safe(score)+'/100'}</p></div>
    <div><strong>配置目标</strong><p>${status.targetCount??'未知'}</p></div>
   </div>
   <p class="a-muted">调度健康：${safe(status.schedulerHealth?.status)} · 自动付费：${status.paidDailyDispatchConfigured?'已配置（须核验预算）':'未启用'} · 实际模型表现不能用 KPI 完成度代表。</p>
   <button class="a-button" data-refresh>重新读取（不付费）</button>
  </section>
  ${contentSource||contentAI?`<section class="a-card a-details"><h2>X 官方内容 · Agent 证据</h2>
   <p class="a-muted">从现有内容渠道只读采集写入日报；近30天指标是有界累计样本，不自动调用模型。</p>
   ${contentSource?.accounts?.length?`<div style="display:flex;gap:20px;flex-wrap:wrap">${contentSource.accounts.map(a=>
     `<div><strong>@${safe(a.account)}</strong><p>样本 ${safe(a.sampledPosts)} 篇 · 已知浏览 ${safe(a.measuredImpressions)} · 样本互动率 ${a.measuredEngagementRate==null?'未知':safe(a.measuredEngagementRate)+'%'}</p><small>观测截至：${a.observedAt==null?'未记录':safe(new Date(a.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Bangkok'}))}</small></div>`).join('')}</div>`:'<p>最近日报尚未记录可用的 X 样本。</p>'}
   ${contentAI?`<p><strong>已完成的 AI 内容分析：</strong>${safe(contentAI.summary)}</p>
     ${(contentAI.actions||[]).slice(0,3).map(action=>`<p>建议：${safe(action.text)}</p>`).join('')}
     <p><a href="?view=ai-analysis">查看完整证据与审核建议</a></p>`:
     '<p class="a-muted">尚无已完成的内容专项 AI 评价；证据已记录不代表模型已运行。可在 AI 增长分析中发起内容专项。</p>'}
  </section>`:''}
  <section class="a-card a-details"><h2>最近7份日报</h2>${err(briefs)}
   <div class="a-scroll"><table><thead><tr><th>日期</th><th>状态</th><th>评分</th><th>原始分析</th></tr></thead><tbody>
    ${rows.map(b=>`<tr><td>${safe(b.day)}</td><td>${safe(b.status)}</td><td>${b.score?.value==null?'证据不足':safe(b.score.value)}</td><td>${Array.isArray(b.analysis_ids)?b.analysis_ids.length:'未知'}</td></tr>`).join('')||'<tr><td colspan="4">暂无已记录日报</td></tr>'}
   </tbody></table></div>
   <p class="a-muted">ready 仅表示当时配置的目标及数据检查通过，不代表建议已执行。</p>
   <div class="ga-cost-audit"><h3>近7日 AI Token 与费用 · 只读</h3>${err(costAudit)}
   <p>调用 ${safe(costAudit.total?.calls)} 次 · 输入 ${safe(costAudit.total?.inputTokens)} Tokens · 输出 ${safe(costAudit.total?.outputTokens)} Tokens · 已登记费用 ${safe(costAudit.total?.knownCostUsd)} · 未知费用 ${safe(costAudit.total?.unknownCostCalls)} 次</p>
   <div class="a-scroll"><table><thead><tr><th>任务</th><th>调用次数</th><th>Tokens</th><th>未知费用</th></tr></thead><tbody>
   ${(costAudit.topOperations||[]).slice(0,6).map(o=>`<tr><td>${safe(o.operationType)} · ${safe(o.operationId)}</td><td>${safe(o.calls)}</td><td>${safe(o.totalTokens)}</td><td>${safe(o.unknownCostCalls)}</td></tr>`).join('')||'<tr><td colspan="4">暂无已登记的模型调用</td></tr>'}
   </tbody></table></div><small class="a-muted">未知价格或 Token 缺失时，不得把实际费用视为零。</small></div>
  </section>
  <section class="a-card a-details"><h2>自动日报评分目标</h2>
   <p class="a-muted">目标仅用于日报评分，不自动发起 AI 调查。数值与权重由人工配置。</p>
   ${err(targetData)}
   <form data-auto-target style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
    <label>业务目标<select name="goal"><option value="activation">激活</option><option value="retention">留存</option><option value="conversion">转化</option><option value="revenue">收入</option></select></label>
    <label>观测指标<select name="metric">${(targetData?.supportedMetrics||[]).map(m=>`<option value="${safe(m)}">${safe(m)}</option>`).join('')}</select></label>
    <label>观察值目标<input name="target" type="number" min="0.000001" step="any" required></label>
    <label>权重（1–10）<input name="weight" type="number" min="1" max="10" value="1" required></label>
    <button class="a-button" type="submit" ${!(targetData?.supportedMetrics||[]).length?'disabled':''}>保存日报目标</button>
   </form>
   ${(targetData?.targets||[]).map(t=>`<p>${safe(t.goal)} · ${safe(t.metric)} ≥ ${safe(t.target)} · 权重 ${safe(t.weight)} · v${safe(t.version)}</p>`).join('')||'<p>尚未配置日报目标</p>'}
   <button class="a-button" type="button" data-brief-refresh>刷新既有日报与学习记录（不调用模型）</button>
   <p data-target-result role="status"></p>
  </section>
  <section class="a-card a-details"><h2>自我评价与下一轮策略</h2>${err(learning)}
   <p>成熟复盘 ${learning.assessment?.reviewed??'未知'} · 观察支持 ${learning.assessment?.observedSupported??'未知'} · 观察不支持 ${learning.assessment?.observedContradicted??'未知'}</p>
   <div class="a-scroll"><table><thead><tr><th>目标</th><th>策略版本</th><th>待重新检查指标</th></tr></thead><tbody>
   ${['activation','retention','conversion','revenue'].map(g=>`<tr><td>${g}</td><td>${safe(policies[g]?.version)}</td><td>${safe(policies[g]?.policy?.focusMetrics?.join(', ')||'无成熟反证')}</td></tr>`).join('')}
   </tbody></table></div>
   <p class="a-muted">仅为历史观察结果，不能当作真实因果收益或模型预测准确率。</p>
  </section>
  <section class="a-card a-details"><h2>研究问题（需人工决定）</h2>${err(research)}
   <p>扫描现有变更、手工内容记录和粉丝覆盖变化，不调用模型。</p>
   <button class="a-button" data-scan>扫描新增线索</button><p data-research-message role="status"></p>
   ${questions.slice(0,25).map(q=>`<article class="a-card a-details"><strong>${safe(q.title)}</strong><p>${safe(q.question)}</p><small>${safe(q.kind)} · 优先级 ${safe(q.priority)}</small> <button class="a-button" data-review="${safe(q.id)}" data-action="approve">批准研究</button> <button class="a-button" data-review="${safe(q.id)}" data-action="dismiss">忽略</button></article>`).join('')||'<p>暂无待审核线索</p>'}
  </section>
  <section class="a-card a-details"><h2>已批准、待启动的调查</h2>${err(approved)}
   ${(approved.questions||[]).map(q=>`<article><strong>${safe(q.title)}</strong> <button data-dispatch="${safe(q.id)}">创建专项 AI 调查（可能付费）</button></article>`).join('')||'<p>暂无待启动的已批准问题</p>'}
  </section>
  <section class="a-card a-details"><h2>提示词候选（不自动上线）</h2>${err(prompts)}
   <div class="a-scroll"><table><thead><tr><th>模块</th><th>理由</th><th>状态</th><th>评估版本</th></tr></thead><tbody>
   ${candidates.slice(0,25).map(c=>`<tr><td>${safe(c.role)}</td><td>${safe(c.reason)}</td><td>${safe(c.status)}</td><td>${safe(c.version)}</td></tr>`).join('')||'<tr><td colspan="4">无候选</td></tr>'}
   </tbody></table></div>
   <p class="a-muted">候选必须先通过真实独立评估，然后人工审批、零流量发布及分阶段灰度。本页面不会直接批准或上线模型提示词。</p>
  </section>`
  // Split the existing long page into three presentational views.
  // Preserve all API calls, action handlers and approval gates below.
  const sections=[...host().querySelectorAll(':scope > section')]
  const runtimePanel=document.createElement('div')
  runtimePanel.className='ga-runtime ga-panel'
  runtimePanel.id='ga-panel-runtime'
  runtimePanel.setAttribute('role','tabpanel')
  const governancePanel=document.createElement('div')
  governancePanel.className='ga-governance ga-panel'
  governancePanel.id='ga-panel-governance'
  governancePanel.setAttribute('role','tabpanel')
  sections.slice(0,4).forEach(section=>runtimePanel.append(section))
  sections.slice(4).forEach(section=>governancePanel.append(section))
  const workspaceRoot=document.createElement('div')
  workspaceRoot.className='ga-workspace ga-panel'
  workspaceRoot.id='ga-panel-workspace'
  workspaceRoot.setAttribute('role','tabpanel')
  const tabNav=document.createElement('nav')
  tabNav.className='ga-switcher'
  tabNav.setAttribute('aria-label','Growth Agent 页面视图')
  tabNav.innerHTML=`<div class="ga-heading"><span class="ga-eyebrow">LogEarn · Growth Intelligence</span><strong>增长决策中心</strong><small>先看问题，再看证据，最后决定行动</small></div>
  <div class="ga-tabs" role="tablist" aria-label="切换增长工作区">
   <button class="ga-tab" role="tab" type="button" data-ga-tab="workspace" aria-controls="ga-panel-workspace">决策工作台</button>
   <button class="ga-tab" role="tab" type="button" data-ga-tab="runtime" aria-controls="ga-panel-runtime">运行与日报</button>
   <button class="ga-tab" role="tab" type="button" data-ga-tab="governance" aria-controls="ga-panel-governance">研究与治理</button>
  </div>`
  host().classList.add('ga-control-surface')
  host().replaceChildren(tabNav,workspaceRoot,runtimePanel,governancePanel)
  const panels={workspace:workspaceRoot,runtime:runtimePanel,governance:governancePanel}
  const setTab=name=>{
   if(!panels[name])return
   activeTab=name
   Object.entries(panels).forEach(([key,panel])=>{panel.hidden=key!==name})
   tabNav.querySelectorAll('[data-ga-tab]').forEach(button=>{
    const selected=button.dataset.gaTab===name
    button.setAttribute('aria-selected',String(selected))
    button.tabIndex=selected?0:-1
   })
  }
  tabNav.querySelectorAll('[data-ga-tab]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.gaTab!==activeTab){activeTab=button.dataset.gaTab;draw()}
   }))
  tabNav.querySelector('[role="tablist"]').addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
   const keys=Object.keys(panels),at=keys.indexOf(activeTab)
   const next=event.key==='Home'?0:event.key==='End'?keys.length-1:(at+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length
   event.preventDefault();activeTab=keys[next];draw().then(()=>host().querySelector('[data-ga-tab="'+keys[next]+'"]')?.focus())
  })
  setTab(activeTab)
  if(activeTab==='workspace')workspaceDispose=mountGrowthDecisionWorkspace(workspaceRoot,{navigate:ctx.navigate})
  host().querySelector('[data-refresh]').onclick=()=>{invalidate();draw()}
  const targetForm=host().querySelector('[data-auto-target]')
  if(targetForm)targetForm.onsubmit=async event=>{
   event.preventDefault();const button=event.target.querySelector('button');button.disabled=true
   const note=host().querySelector('[data-target-result]')
   try{
    const data=new FormData(event.target),goal=String(data.get('goal')),metric=String(data.get('metric'))
    const old=(targetData?.targets||[]).find(t=>t.goal===goal&&t.metric===metric&&t.source==='all')
    await saveAutonomyTarget({goal,metric,source:'all',target:Number(data.get('target')),weight:Number(data.get('weight')),expectedVersion:old?.version??null})
    invalidate();await draw()
   }catch(e){if(note)note.textContent=e.message;button.disabled=false}
  }
  const refreshBrief=host().querySelector('[data-brief-refresh]')
  if(refreshBrief)refreshBrief.onclick=async()=>{
   refreshBrief.disabled=true
   try{await refreshAutonomyBrief();invalidate();await draw()}
   catch(e){refreshBrief.disabled=false;const note=host().querySelector('[data-target-result]');if(note)note.textContent=e.message}
  }
  host().querySelector('[data-scan]').onclick=async()=>{const node=host().querySelector('[data-research-message]');try{const result=await request('/api/growth-agent/research/scan','POST',{source:'all'});node.textContent='新增 '+result.inserted.length+' 个研究问题';invalidate();await draw()}catch(e){node.textContent=e.message}}
  host().querySelectorAll('[data-dispatch]').forEach(button=>button.onclick=async()=>{
   if(!window.confirm('确认创建这项 AI 调查？后台执行时可能调用付费模型，并需要服务端明确开启研究开关。'))return
   button.disabled=true
   try{await request('/api/growth-agent/research/questions/'+encodeURIComponent(button.dataset.dispatch)+'/dispatch','POST',{confirmPaidAnalysis:true});invalidate();await draw()}
   catch(e){button.disabled=false;button.title=e.message;window.alert(e.message)}
  })
  host().querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{
   button.disabled=true
   try{await request('/api/growth-agent/research/questions/'+encodeURIComponent(button.dataset.review)+'/decision','POST',{action:button.dataset.action});invalidate();await draw()}
   catch(e){button.disabled=false;button.title=e.message;host().querySelector('[data-research-message]').textContent=e.message}
  })
 }
 return {draw,dispose(){generation++;cache.clear();if(workspaceDispose)workspaceDispose();host().classList.remove('ga-control-surface')}}
}
