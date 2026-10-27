import {getToken} from '../auth/authClient.js'
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
 const esc=ctx.esc
 const safe=v=>esc(v==null?'未知':String(v))
 async function draw(){
  ctx.clear();const token=++generation
  host().innerHTML='<section class="a-card a-details">正在读取 AI Growth Agent 状态…</section>'
  const paths=[
   '/api/ai-analysis/growth-agent/status',
   '/api/ai-analysis/growth-agent/briefs?limit=7',
   '/api/ai-analysis/growth-agent/learning',
   '/api/growth-agent/research/questions',
   '/api/growth-agent/prompts/candidates'
  ]
  const results=await Promise.allSettled(paths.map(p=>request(p)))
  if(token!==generation)return
  const [status,briefs,learning,research,prompts]=results.map((x,i)=>x.status==='fulfilled'?x.value:{error:String(x.reason?.message||' unavailable'),endpoint:paths[i]})
  const err=x=>x?.error?'<p role="alert">'+safe(x.error)+'</p>':''
  const latest=status.latestBrief
  const score=latest?.score?.value??null
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
  <section class="a-card a-details"><h2>最近7份日报</h2>${err(briefs)}
   <div class="a-scroll"><table><thead><tr><th>日期</th><th>状态</th><th>评分</th><th>原始分析</th></tr></thead><tbody>
    ${rows.map(b=>`<tr><td>${safe(b.day)}</td><td>${safe(b.status)}</td><td>${b.score?.value==null?'证据不足':safe(b.score.value)}</td><td>${Array.isArray(b.analysis_ids)?b.analysis_ids.length:'未知'}</td></tr>`).join('')||'<tr><td colspan="4">暂无已记录日报</td></tr>'}
   </tbody></table></div>
   <p class="a-muted">ready 仅表示当时配置的目标及数据检查通过，不代表建议已执行。</p>
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
  <section class="a-card a-details"><h2>提示词候选（不自动上线）</h2>${err(prompts)}
   <div class="a-scroll"><table><thead><tr><th>模块</th><th>理由</th><th>状态</th><th>评估版本</th></tr></thead><tbody>
   ${candidates.slice(0,25).map(c=>`<tr><td>${safe(c.role)}</td><td>${safe(c.reason)}</td><td>${safe(c.status)}</td><td>${safe(c.version)}</td></tr>`).join('')||'<tr><td colspan="4">无候选</td></tr>'}
   </tbody></table></div>
   <p class="a-muted">候选必须先通过真实独立评估，然后人工审批、零流量发布及分阶段灰度。本页面不会直接批准或上线模型提示词。</p>
  </section>`
  host().querySelector('[data-refresh]').onclick=draw
  host().querySelector('[data-scan]').onclick=async()=>{const node=host().querySelector('[data-research-message]');try{const result=await request('/api/growth-agent/research/scan','POST',{source:'all'});node.textContent='新增 '+result.inserted.length+' 个研究问题';await draw()}catch(e){node.textContent=e.message}}
  host().querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{
   button.disabled=true
   try{await request('/api/growth-agent/research/questions/'+encodeURIComponent(button.dataset.review)+'/decision','POST',{action:button.dataset.action});await draw()}
   catch(e){button.disabled=false;button.title=e.message;host().querySelector('[data-research-message]').textContent=e.message}
  })
 }
 return {draw,dispose(){generation++}}
}
