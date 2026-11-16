// Pure HTML renderer for a fixed-roster, equal-duration before/after observation.
// This is an observational comparison, not a randomized lift estimate.
const measures=[
 ['analysis_users','有效分析用户'],
 ['analysis_events','有效分析次数'],
 ['trade_users','有交易记录用户'],
 ['transactions','交易记录笔数'],
 ['volume_usd','已知成交额 USD']
]
const number=v=>typeof v==='number'&&Number.isFinite(v)
export function renderOperationEffect(result,{esc,fmt,table,observedTime}){
 if(result.pending)return '<p class="a-muted">数据截至尚未超过任务创建时间，尚无完整观察结果；请稍后重新检查。</p>'
 const before=result.comparison?.before?.total,after=result.comparison?.after?.total
 const errors=Object.values(result.errors||{}).filter(Boolean)
 const period='<p class="a-muted">前期 '+observedTime(result.before_period?.start)+' — '+observedTime(result.before_period?.end)+'；后期 '+observedTime(result.start)+' — '+observedTime(result.end)+' · UTC+7</p>'
 if(!before||!after)return period+'<p class="si-error">当前无法得到完整的账户基线，暂不计算变化。</p>'+errors.map(e=>'<p class="si-error">'+esc(e)+'</p>').join('')
 const count=v=>number(v)?fmt(v):'—'
 const delta=(a,b)=>number(a)&&number(b)?(b-a>0?'+':'')+fmt(b-a):'—'
 const rows=measures.map(([key,label])=>[label,count(before[key]),count(after[key]),delta(before[key],after[key])])
 const first=number(before.users)&&before.users>0,second=number(after.users)&&after.users>0
 const analysisBefore=first&&number(before.analysis_users)?(before.analysis_users/before.users*100).toFixed(1)+'%':'—'
 const analysisAfter=second&&number(after.analysis_users)?(after.analysis_users/after.users*100).toFixed(1)+'%':'—'
 const tradeBefore=first&&number(before.trade_users)?(before.trade_users/before.users*100).toFixed(1)+'%':'—'
 const tradeAfter=second&&number(after.trade_users)?(after.trade_users/after.users*100).toFixed(1)+'%':'—'
 const moved=result.movement||{},analysis=Array.isArray(moved.analysis_ids)?moved.analysis_ids:null,trade=Array.isArray(moved.trade_ids)?moved.trade_ids:null
 const drill=(type,items,label)=>items===null?'<span class="a-muted">'+label+'：数据不足</span>':'<button class="a-button" data-op-movement="'+type+'" '+(items.length?'':'disabled')+'>'+esc(label)+' '+fmt(items.length)+' 人 ↗</button>'
 return period+
 '<div class="crm-kpis"><div class="si-kpi"><span>分析覆盖率 · 前 / 后</span><strong>'+analysisBefore+' → '+analysisAfter+'</strong></div><div class="si-kpi"><span>交易记录覆盖率 · 前 / 后</span><strong>'+tradeBefore+' → '+tradeAfter+'</strong></div></div>'+
 '<p class="a-muted">'+(result.complete?'已满':'尚未满')+'预设 '+fmt(result.window_days||7)+' 天观察期；相同名单、相同时长前后对比，不包含因果归因。</p>'+
 table(['指标','前期','后期','变化'],rows)+
 '<div class="a-audience-actions">'+drill('analysis',analysis,'前期未观测、本期有分析')+drill('trade',trade,'前期未观测、本期有交易记录')+'</div>'+
 errors.map(e=>'<p class="si-error">'+esc(e)+'</p>').join('')+
 '<p class="si-footnote">“新增记录用户”只表示前一同长度窗口未观测该行为，并非历史首次。分析/交易覆盖可能受系统故障、采集缺失及市场环境影响；交易记录须进一步核实实际成交。</p>'
}
