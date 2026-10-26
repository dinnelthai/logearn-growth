import {fetchComparisonFunnelMetrics} from '../api/metrics.js'
import {fetchDrillUsers,fetchUserTimeline} from '../api/drill.js'
const PRESETS={analysis:'登录后分析',ai:'策略后分析',token_visit:'同次Token访问',strategy_run:'同次策略运行'}
const STEPS={logged_in_visit:'已登录访问',token:'Token详情',chip:'筹码分析',ai:'启动策略',token_click:'Token入口点击',strategy_result:'策略结果',signal_view:'信号查看'}
export function mountSegmentFunnelComparison(host,metrics,ctx){
 if(!host)return ()=>{}
 const {esc,fmt,table,drawer}=ctx,groups=metrics.comparison||[]
 if(groups.length<2){host.innerHTML='<p class="a-muted">当前筛选不足两组，切换对比维度或放宽条件后可比较漏斗。</p>';return ()=>{}}
 let generation=0,disposed=false
 host.innerHTML=`<h3>比较各组转化漏斗</h3><p class="a-muted">沿用上方分组的固定名单、统计期和快照。选择2至8组，合并去重后最多5000人。</p><form data-crowd-funnel><div class="si-filter-extra">${groups.map((g,i)=>`<label><input type="checkbox" name="group" value="${esc(g.list_key)}" ${i<2?'checked':''}>${esc(g.label)} · ${fmt(g.users)}人</label>`).join('')}</div><div class="si-filter-main"><label>漏斗<select name="preset">${Object.entries(PRESETS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>转化窗口<select name="hours">${[1,24,72].map(h=>`<option value="${h}" ${h===24?'selected':''}>${h}小时</option>`).join('')}</select></label><button class="a-button" type="submit">运行漏斗对比</button></div></form><p role="status" data-crowd-status></p><div data-crowd-result></div>`
 const form=host.querySelector('[data-crowd-funnel]'),status=host.querySelector('[data-crowd-status]'),output=host.querySelector('[data-crowd-result]'),button=form.querySelector('button')
 const current=token=>!disposed&&host.isConnected&&token===generation
 form.onchange=()=>{generation++;button.disabled=false;status.textContent='条件已更改，请重新运行';output.innerHTML=''}
 form.onsubmit=async event=>{
  event.preventDefault();const token=++generation,group_keys=[...form.querySelectorAll('input[name="group"]:checked')].map(n=>n.value)
  if(group_keys.length<2||group_keys.length>8){status.textContent='请选择2至8个不同人群';return}
  button.disabled=true;status.textContent='正在计算各组漏斗…';output.innerHTML=''
  try{
   const result=await fetchComparisonFunnelMetrics({base_cache_id:metrics.drill.cache_id,group_keys,preset:form.elements.preset.value,hours:Number(form.elements.hours.value)})
   if(!current(token))return
   const ratio=(n,d)=>d?`${(n/d*100).toFixed(1)}%`:'—'
   const link=(value,label)=>`<button class="a-tablelink" data-crowd-list="${esc(value.list_key)}" data-title="${esc(label)}">${fmt(value.count)}</button>`
   output.innerHTML=table(['人群','固定名单','步骤','到达','相对起点','后续未观测','待观察'],result.groups.flatMap(g=>g.stages.map((s,i)=>[
    esc(g.label),fmt(g.pool_users),esc(STEPS[s.step]||s.step),link(s.reached,g.label+' · '+(STEPS[s.step]||s.step)),ratio(s.reached.count,g.entered),i===g.stages.length-1?'—':link(s.unobserved,g.label+' · 后续未观测'),i===g.stages.length-1?'—':link(s.pending,g.label+' · 待观察'),
   ])))+`<p class="a-muted">${esc(result.definition)}</p>`+table(['人群','缺少关联起点','后续关联不完整'],result.groups.map(g=>[esc(g.label),link(g.missing_start,g.label+' · 缺起点'),link(g.incomplete,g.label+' · 关联不完整')]))
   status.textContent=`${PRESETS[result.preset]} · ${result.hours}小时窗口 · 去重名单${fmt(result.pool_users)}人`
   output.querySelectorAll('[data-crowd-list]').forEach(node=>node.onclick=()=>{
    const cacheId=result.drill.cache_id,listKey=node.dataset.crowdList
    drawer.openRemote({title:node.dataset.title,description:'分组固定名单 · 同一分析快照',selection:{cache_id:cacheId,list_key:listKey},
     fetchPage:({offset,limit,q})=>fetchDrillUsers({kind:'cached_list',params:{cache_id:cacheId,list_key:listKey},offset,limit,q}),
     fetchTimeline:async(userId,el)=>{
      el.textContent='正在加载时间线…'
      try{const data=await fetchUserTimeline({userId,cacheId,start:result.start,end:result.end+result.hours*3600000,limit:200});if(current(token)&&el.isConnected)el.innerHTML=table(['事件','时间 · UTC+7'],data.events.map(e=>[esc(ctx.names?.[e.event_name]||e.event_name),esc(new Date(e.t+25200000).toISOString().slice(0,19).replace('T',' '))]))}
      catch(error){if(current(token)&&el.isConnected)el.textContent=error.message}
     },
    })
   })
  }catch(error){if(current(token))status.textContent=error.status===409?'原分群结果或快照已过期，请重新运行上方分群后再比较':error.message}
  finally{if(current(token))button.disabled=false}
 }
 return ()=>{disposed=true;generation++}
}
