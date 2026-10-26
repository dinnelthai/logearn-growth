import {fetchDrillUsers,fetchUserTimeline} from '../api/drill.js'
import {observedTime} from './observedDrill.js'
const names={core:'周核心分析用户',near:'每周分析2—3天用户',entered:'本周进入核心用户',retained:'两周持续核心用户',lost:'本周跌出核心用户'}
export function weeklyCoreMarkup(ctx,m){
 const {esc,fmt}=ctx
 if(!m?.available)return `<section class="a-card si-panel weekly-core"><h2>周核心分析用户数</h2><p class="si-error">${esc(m?.error||'当前结果未包含周核心指标，请刷新后重试。')}</p></section>`
 const button=(key,n)=>`<button class="si-numberlink" data-weekly-core-group="${key}">${fmt(n)} ↗</button>`,all=m.source==='all',pct=m.goal.progress==null?null:m.goal.progress*100
 return `<section class="a-card si-panel weekly-core" aria-label="周核心分析用户数"><div class="si-sectionhead"><div><span class="activity-eyebrow">习惯质量指标</span><h2>周核心分析用户数</h2></div><span class="a-chip">每周至少4天分析</span></div><div class="weekly-core-hero"><strong>${button('core',m.users)} <small>人</small></strong>${all?`<div><span>11月底目标：${fmt(m.goal.users)} 人</span><progress max="${m.goal.users}" value="${Math.min(m.users,m.goal.users)}" aria-label="周核心分析用户目标进度"></progress><span>${pct.toFixed(1)}% · 目标日期 ${esc(m.goal.due_date)}</span></div>`:`<p>当前来源：${esc(m.source)}；200人目标按全平台衡量。</p>`}</div><div class="home-kpi-grid">${[['两周持续核心','retained',m.retained],['本周进入核心','entered',m.entered],['本周跌出核心','lost',m.lost],['接近核心（2—3天）','near',m.near_users]].map(([label,key,n])=>`<div class="home-kpi"><span>${label}</span><strong>${button(key,n)}</strong></div>`).join('')}</div><p>前7天 ${fmt(m.previous_users)} 人 → 本周 ${fmt(m.users)} 人，净变化 ${m.delta>0?'+':''}${fmt(m.delta)} 人。进入核心不等于新注册。</p><p>近7个完整业务日：${esc(observedTime(m.start))} 至 ${esc(observedTime(m.end))}（UTC+7，截止不含）；不含进行中的今天，不随页面所选周期累加。</p><details><summary>分析天数分布与指标口径</summary><div class="weekly-core-days">${m.distribution.map(r=>`<span>${r.days}天：${fmt(r.users)}人</span>`).join('')}</div><p>${esc(m.definition)}</p><p>连续采集确认截至：${esc(m.events_complete_through||'未知')}。Aha与习惯仍需用户研究验证，4天是持续使用的行为标准。</p></details></section>`
}
export function bindWeeklyCore(ctx,host,m){
 if(!m?.available)return
 host.querySelectorAll('[data-weekly-core-group]').forEach(b=>b.onclick=()=>{
  const group=b.dataset.weeklyCoreGroup,params={end:m.end,source:m.source,snapshot_id:m.snapshot_id,group}
  ctx.drawer.openRemote({title:names[group]||'周核心分析用户',description:'固定7个完整UTC+7自然日；名单与指标使用同一快照。',selection:{kind:'weekly_core',params},columns:['用户','首次来源','本周分析天数','前周分析天数'],profileContext:{start:m.previous_start,end:m.end,snapshot_id:m.snapshot_id},
   fetchPage:({offset,limit,q})=>fetchDrillUsers({kind:'weekly_core',params,offset,limit,q}),renderRow:r=>[`<button class="a-tablelink" data-user="${ctx.esc(r.id)}">${ctx.esc(r.id)}</button>`,ctx.esc(r.source),ctx.fmt(r.analysis_days),ctx.fmt(r.previous_analysis_days)],
   fetchTimeline:async(id,el)=>{try{const d=await fetchUserTimeline({userId:id,start:m.previous_start,end:m.end,snapshotId:m.snapshot_id,limit:200});if(!el.isConnected)return;el.innerHTML=d.events.map(e=>`<div class="a-event"><strong>${ctx.esc(e.event_name)}</strong><div>${ctx.esc(observedTime(e.t))}</div></div>`).join('')||'<p>当前窗口没有已观测记录。</p>'}catch(e){if(el.isConnected)el.innerHTML=`<p class="si-error">${ctx.esc(e.message)}</p>`}}
  })
 })
}
