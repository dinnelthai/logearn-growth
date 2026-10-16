import {loginBreakdownMarkup} from './loginBreakdown.js'
import {createChartLifecycle} from './chartLifecycle.js'
export function growthPanel(data,{esc,fmt,table}){
 if(!data)return '<section class="a-card si-panel"><h2>增长驱动</h2><p class="si-error">增长转化暂不可用，请刷新后重试。</p></section>'
 const rate=m=>m.rate==null?'—':(m.rate*100).toFixed(1)+'%',counts=m=>m.available?`${fmt(m.numerator)} / ${fmt(m.denominator)} 人`:'必要事件待接入'
 const metrics=Object.values(data.metrics)
 return `<section class="a-card si-panel"><div class="si-sectionhead"><h2>增长驱动</h2><span class="a-muted">各指标按自身入口入组</span></div><div class="home-kpi-grid">${['activation','visit_login','d1','d7'].map(key=>{const m=data.metrics[key];return `<div class="home-kpi"><span>${esc(m.label)}</span><strong>${rate(m)}</strong><small>${counts(m)}</small><small>${!m.available?'必要事件待接入':m.pending?fmt(m.pending)+' 人观察未结束':'到期分母；无分母为—'}</small></div>`}).join('')}</div><p class="a-muted">D1 / D7 为首次分析后指定自然日的页面访问或分析回访；北极星详情的分析回访只计有效分析，两者分别保留。</p><details data-home-growth-details><summary>增长转化趋势、完整指标与口径</summary><div id="home-growth-chart" class="home-chart" role="img" aria-label="增长转化率趋势"></div>${table(['指标','比例','人数（分子 / 分母）','口径'],metrics.map(m=>[esc(m.label),rate(m),counts(m),esc(m.formula)]))}<details><summary>每日明细</summary>${table(['日期',...metrics.map(m=>esc(m.label))],data.days.map(d=>[esc(d.date),...metrics.map(m=>rate(d.metrics[m.key]))]))}</details><p class="si-footnote">历史覆盖未确认，新访客和首次分析按首次观测计算。主动登录采用带账号且 login_type=manual 的 login_succeeded；自动恢复和历史未知类型不计入主动登录转化。试用采用 free_trial_started；未到期用户不计D1/D7分母。页面采集不足时只能观测分析回访，各项转化不能直接相乘。</p></details></section>${loginBreakdownMarkup(data,{esc,fmt,table})}`
}
export function mountGrowthChart(ctx,data){
 const el=ctx.$('#home-growth-chart');if(!el||!globalThis.echarts)return null
 const chart=globalThis.echarts.init(el,null,{renderer:'svg'}),owner=createChartLifecycle(ctx.themeMedia)
 const paint=()=>{const text=getComputedStyle(ctx.root).getPropertyValue('--a-muted').trim();chart.setOption({animation:false,tooltip:{trigger:'axis',confine:true,valueFormatter:v=>v==null?'—':v.toFixed(1)+'%'},legend:{type:'scroll',textStyle:{color:text}},grid:{left:45,right:20,top:55,bottom:35},xAxis:{type:'category',data:data.days.map(d=>d.date.slice(5)),axisLabel:{color:text}},yAxis:{type:'value',min:0,max:100,axisLabel:{color:text,formatter:'{value}%'}},series:Object.values(data.metrics).filter(m=>m.available).map(m=>({name:m.label,type:'line',connectNulls:false,data:data.days.map(d=>d.metrics[m.key].rate==null?null:d.metrics[m.key].rate*100)}))},true)}
 paint();owner.attach(chart,el,paint);return owner
}
