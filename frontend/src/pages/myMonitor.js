import {fetchMyMonitorMetrics} from '../api/metrics.js'
import {fetchBackendMeta} from '../api/backendAnalytics.js'
import {createChartLifecycle} from './chartLifecycle.js'
export function createMyMonitor(ctx) {
 const {$,esc,fmt,table}=ctx
 let request=0, days=7, charts=[]
 const rate=m=>m.rate==null?'—':(m.rate*100).toFixed(1)+'%'
 const counts=m=>m.available?`${fmt(m.numerator)} / ${fmt(m.denominator)} 人`:'待接入：'+m.missing.map(k=>({pages:'页面访问',analysis:'筹码分析',login:'登录成功',starts:'登录发起',trial:'试用开启'}[k])).join('、')
 async function draw() {
  ctx.clear();const id=++request,host=$('#as-output');host.innerHTML='<p class="a-muted">正在加载我的监控…</p>'
  try {
   const meta=await fetchBackendMeta();if(id!==request)return
   const asOf=Date.parse(meta.as_of),end=Math.floor((asOf+25200000)/86400000)*86400000-25200000+86400000,start=end-days*86400000
   const data=await fetchMyMonitorMetrics({start,end,snapshot_id:meta.snapshot_id});if(id!==request)return
   const ms=Object.values(data.metrics),hero=data.metrics.activation
   const card=m=>`<div class="home-kpi"><span>${esc(m.label)}</span><strong>${rate(m)}</strong><small>${esc(counts(m))}</small><small>${m.available?(m.pending?`${fmt(m.pending)} 人观察未结束`:'观察窗已结束'):'未观测到必要事件'}</small></div>`
   host.innerHTML=`<div class="si-page my-monitor"><section class="home-toolbar"><div class="si-sectionhead"><div><p>数据截至 ${esc(new Date(asOf+25200000).toISOString().slice(0,16).replace('T',' '))} · UTC+7 · 今日进行中</p></div><label>统计日期<select data-monitor-period>${[1,7,14,30].map(n=>`<option value="${n}" ${n===days?'selected':''}>最近 ${n} 天（含今日）</option>`).join('')}</select></label></div></section>
   <section class="a-card monitor-hero"><div><p class="a-muted">核心增长指标</p><h2>${esc(hero.label)}</h2><p>${esc(hero.formula)}</p><p class="a-muted">${esc(counts(hero))} · 24 小时转化窗口</p></div><strong>${rate(hero)}</strong></section>
   <div class="home-kpi-grid">${ms.filter(m=>m.key!=='activation').map(card).join('')}</div>
   <section class="a-card si-panel"><h2>每日转化趋势</h2><p class="a-muted">按入口行为发生日入组；每日人数不能相加作为周期去重人数。</p><div id="my-monitor-trend" class="home-chart" role="img" aria-label="每日转化率趋势"></div></section>
   <section class="a-card si-panel"><h2>每日监控明细</h2>${table(['日期',...ms.map(m=>esc(m.label))],data.days.map(d=>[esc(d.date),...ms.map(m=>{const x=d.metrics[m.key];return `${rate(x)}<br><small class="a-muted">${esc(counts(x))}${x.pending?'<br>观察中 '+fmt(x.pending)+' 人':''}</small>`})]))}</section>
   <section class="a-card si-panel"><h2>指标口径与数据状态</h2>${table(['指标','计算口径','状态'],ms.map(m=>[esc(m.label),esc(m.formula),m.available?'已接入 · '+esc(counts(m)):'待接入 · '+esc(counts(m))]))}<p class="a-muted">${data.meta.history_complete?'历史完整。':'历史覆盖未确认：新访客和首次分析按首次观测计算，可能包含历史用户。'}匿名浏览器与账号仅在可靠关联时合并，浏览器标识不等于自然人。新访客指本期首次观测页面且未在更早业务日观测到行为的身份。</p><p class="a-muted">登录成功仅统计带账号的 login_succeeded；登录发起采用 login_button_clicked。免费试用开启采用权益开启成功事件 free_trial_started，不用试用按钮点击代替。当前筹码完成沿用展示或下钻事件，仍需产品端确认成功完成的采集口径。</p><p class="a-muted">D1/D7 为指定自然日的页面访问或筹码分析回访，尚未到期用户不计入分母；页面采集不足时仅能观测分析回访。未观测到事件表示采集待确认；没有到期批次或分母为零显示 —。各转化卡片按不同入口入组，不能直接相乘。</p><div class="a-audience-actions"><button class="a-button" data-monitor-go="funnel">排查登录与激活漏斗</button><button class="a-button" data-monitor-go="retention">查看分析留存</button></div></section></div>`
   host.querySelector('[data-monitor-period]').onchange=e=>{days=Number(e.target.value);draw()}
   host.querySelectorAll('[data-monitor-go]').forEach(b=>b.onclick=()=>ctx.navigate(b.dataset.monitorGo))
   const el=host.querySelector('#my-monitor-trend')
   if(globalThis.echarts){const chart=globalThis.echarts.init(el,null,{renderer:'svg'}),owner=createChartLifecycle(ctx.themeMedia);const paint=()=>{const style=getComputedStyle(ctx.root),text=style.getPropertyValue('--a-muted').trim();chart.setOption({animation:false,tooltip:{trigger:'axis',confine:true,valueFormatter:v=>v==null?'—':v.toFixed(1)+'%'},legend:{type:'scroll',top:0,textStyle:{color:text}},grid:{top:55,left:50,right:20,bottom:35},xAxis:{type:'category',data:data.days.map(d=>d.date.slice(5)),axisLabel:{color:text}},yAxis:{type:'value',min:0,max:100,axisLabel:{color:text,formatter:'{value}%'}},series:ms.filter(m=>m.available).map(m=>({name:({activation:'新访客首次分析',visit_login:'访问→登录',login_analysis:'登录→首次分析',login_success:'登录发起→成功',trial:'试用开启',d1:'D1回访',d7:'D7回访'}[m.key]),type:'line',connectNulls:false,data:data.days.map(d=>d.metrics[m.key].rate==null?null:d.metrics[m.key].rate*100)}))},true)};paint();owner.attach(chart,el,paint);charts.push(owner)}
  }catch(e){if(id===request){host.innerHTML=`<section class="a-card"><h2>我的监控加载失败</h2><p>${esc(e.message)}</p><button class="a-button" data-monitor-retry>重新加载</button></section>`;host.querySelector('[data-monitor-retry]').onclick=draw}}
 }
 return {draw,dispose(){request++;charts.forEach(c=>c.dispose());charts=[]}}
}
