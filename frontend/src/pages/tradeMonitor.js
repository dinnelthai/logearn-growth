import {computeTradeMonitor} from '../analytics/tradeMonitor.js'
import {createChartLifecycle} from './chartLifecycle.js'
export function createTradeMonitorPage(ctx) {
 const {root,$,$$,names,day,base,asof,date,clock,daynum,esc,fmt,pct,table,stat,drill,closeDrill,themeMedia}=ctx
 const clearNative=ctx.clear
 let users=[],nativeChart=null
 const chartLifecycle=createChartLifecycle(themeMedia)
function drawTradeMonitor(c){
clearNative();users=ctx.getUsers();
const r=computeTradeMonitor({users,startAt:c.start,endAt:c.end,asOf:asof,source:c.source});
const pct2=(a,b)=>b!=null&&b>0?(a/b*100).toFixed(1)+'%':'—';
const q=ctx.getTradeQuality?.();
const qualityMarkup=q?`<details class="a-card a-details"><summary>交易事实数据质量 · 已加载全量快照</summary><p>输入 ${fmt(q.input)} 条，接受 ${fmt(q.accepted)} 条，排除 ${fmt(q.excluded)} 条。此处不是当前日期筛选内的提交统计。</p>${table(['检查项','条数'],[['缺少交易 ID',q.missingId],['缺少用户 ID',q.missingUser],['无效确认时间',q.invalidTime],['无效成交额',q.invalidAmount],['非确认状态',q.notConfirmed],['晚于观测截止',q.future],['相同事实重复',q.duplicates],['同 ID 冲突记录',q.conflictingRows]].map(([label,count])=>[label,fmt(count)]))}<p>同一 ID 内容冲突的 ${fmt(q.conflictingIds)} 组全部隔离；排除原因互斥，每条记录仅计一个原因。接受事实 + 排除记录 = 输入记录。</p></details>`:'';
const context=`${date(c.start)}–${date(c.end-day)} · ${c.source==='all'?'全部来源':c.source}`;
const CHAIN_NAMES={'mock_demo':'Mock 演示链','1':'Ethereum','56':'BNB Chain','137':'Polygon','42161':'Arbitrum','10':'Optimism','8453':'Base','43114':'Avalanche'};
const chainName=id=>CHAIN_NAMES[id]??'Chain '+id;
const reasonRows=r.failureReasons.map(fr=>`<tr><td>${esc(fr.reason)}</td><td style="text-align:right">${fr.count}</td><td style="text-align:right">${pct2(fr.count,r.totalFailed)}</td></tr>`).join('');
const chainRows=r.byChain.map(c=>`<tr><td>${esc(chainName(c.chain))}<small class="a-muted"> · ${esc(c.chain)}</small></td><td style="text-align:right">${c.submitted}</td><td style="text-align:right">${c.succeeded}</td><td style="text-align:right">${c.failed}</td><td style="text-align:right">${c.successRate===null?'—':pct2(c.succeeded,c.submitted)}</td></tr>`).join('');
$('#as-output').innerHTML=`<div class="a-context"><span class="a-chip">交易成功率监控 · 基于事件打点</span><span>${context}</span></div>
<div class="a-summary a-four">
${stat('提交笔数',fmt(r.totalSubmitted),'按交易 ID 去重的提交批次')}
${stat('已关联成功笔数',fmt(r.totalSucceeded),'本批次截至观测时间已确认成功')}
${stat('交易成功率',r.successRate!==null?pct2(r.totalSucceeded,r.totalSubmitted):'—',r.missingCorrelation?'缺少交易关联 ID，暂不计算':'本批次成功 / 提交')}
${stat('已关联失败笔数',fmt(r.totalFailed),r.failureRate!==null?pct2(r.totalFailed,r.totalSubmitted)+' 失败率':'本批次已关联失败结果')}
</div>
<div class="a-summary">
${stat('提交用户数',fmt(r.uniqueSubmitters),'有提交行为的去重用户')}
${stat('成功交易用户',fmt(r.uniqueTraders),'本批次至少关联成功一笔的去重用户')}
${stat('结果待确认',fmt(r.pending),'已有关联 ID，尚未取得终态')}
${stat('提交缺少关联 ID',fmt(r.missingCorrelation),'无法确定这些提交的最终结果')}
${stat('未关联本批次的结果',fmt(r.unmatchedOutcomes),'不计入本批次成功与失败')}
</div>
<div class="a-card"><div class="a-cardhead"><h2>每日趋势</h2><span class="a-muted">提交 / 成功 / 失败笔数</span></div><div id="as-trade-monitor-chart" style="height:280px;width:100%" role="img" aria-label="每日交易提交、成功、失败趋势图"></div></div>
<div class="a-card"><div class="a-cardhead"><h2>按链分类</h2><span class="a-muted">按 chain 字段统计</span></div><div class="a-scroll"><table><thead><tr><th>链</th><th style="text-align:right">提交</th><th style="text-align:right">成功</th><th style="text-align:right">失败</th><th style="text-align:right">成功率</th></tr></thead><tbody>${chainRows}</tbody></table></div></div>
${r.failureReasons.length?`<div class="a-card"><div class="a-cardhead"><h2>失败原因分布</h2><span class="a-muted">按 properties.reason 统计</span></div><div class="a-scroll"><table><thead><tr><th>原因</th><th style="text-align:right">笔数</th><th style="text-align:right">占失败比</th></tr></thead><tbody>${reasonRows}</tbody></table></div></div>`:''}
${qualityMarkup}
<details class="a-card a-details"><summary>指标口径</summary><p>按统计期内的提交时间入组，通过 trade_attempt_id / trade_id 关联截至观测时间的结果；跨日确认计入原提交批次。重复上报不重复计数。</p><p>成功率 = 本批次已成功笔数 / 提交笔数。处理中 ${r.pending} 笔；缺少关联 ID ${r.missingCorrelation} 笔；当期无法关联本批次的结果 ${r.unmatchedOutcomes} 条，均不冒充成功或失败。</p><p>链分类来自事件的顶层 chain 字段（EVM chain ID）；失败原因来自 properties.reason 字段。</p></details>`;
if(!globalThis.echarts)return;
const host=$('#as-trade-monitor-chart');
const colorFn=key=>{const p=document.createElement('span');p.style.color=`var(${key})`;root.appendChild(p);const v=getComputedStyle(p).color;p.remove();return v};
nativeChart=echarts.init(host,null,{renderer:'svg'});
const paint=()=>{if(!nativeChart||!host.isConnected)return;nativeChart.setOption({animation:false,aria:{enabled:true},tooltip:{trigger:'axis',confine:true,backgroundColor:colorFn('--a-panel'),borderColor:colorFn('--a-border'),textStyle:{color:colorFn('--a-text')}},legend:{top:0,textStyle:{color:colorFn('--a-text')}},grid:{left:48,right:20,top:40,bottom:32},xAxis:{type:'category',data:r.days.map(d=>date(d.t)),axisLabel:{color:colorFn('--a-muted')},axisLine:{lineStyle:{color:colorFn('--a-border')}}},yAxis:{type:'value',minInterval:1,axisLabel:{color:colorFn('--a-muted')},splitLine:{lineStyle:{color:colorFn('--a-border')}}},series:[{name:'提交',type:'bar',barMaxWidth:28,itemStyle:{color:colorFn('--a-muted')},data:r.days.map(d=>d.submitted)},{name:'成功',type:'bar',barMaxWidth:28,itemStyle:{color:colorFn('--a-accent')},data:r.days.map(d=>d.succeeded)},{name:'失败',type:'bar',barMaxWidth:28,itemStyle:{color:'#e05c5c'},data:r.days.map(d=>d.failed)}]},true)};
paint();chartLifecycle.attach(nativeChart,host,paint);
}
 return {draw:drawTradeMonitor,dispose(){chartLifecycle.dispose();nativeChart=null}}
}
