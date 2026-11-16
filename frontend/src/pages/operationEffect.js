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
 if(result.pending)return result.awaiting_execution?'<p class="a-muted">尚未登记运营执行。本次观察会以首次手工登记的执行时间为起点，创建任务本身不视为触达。</p>':'<p class="a-muted">数据截至尚未超过首次执行时间，尚无有效观察窗口；请稍后重新检查。</p>'
 const before=result.comparison?.before?.total,after=result.comparison?.after?.total
 const errors=Object.values(result.errors||{}).filter(Boolean)
 const period='<p class="a-muted">前期 '+observedTime(result.before_period?.start)+' — '+observedTime(result.before_period?.end)+'；后期 '+observedTime(result.start)+' — '+observedTime(result.end)+' · UTC+7</p>'
 if(!before||!after)return period+'<p class="si-error">当前无法得到完整的账户基线，暂不计算变化。</p>'+errors.map(e=>'<p class="si-error">'+esc(e)+'</p>').join('')
 const count=v=>number(v)?fmt(v):'—'
 const delta=(a,b)=>number(a)&&number(b)?(b-a>0?'+':'')+fmt(b-a):'—'
 const rows=measures.map(([key,label])=>[label,count(before[key]),count(after[key]),delta(before[key],after[key])])
 const d7=result.return_d7
 rows.push(['回流 D7（观测）',count(d7?.before_users),count(d7?.after_users),delta(d7?.before_users,d7?.after_users)])
 const first=number(before.users)&&before.users>0,second=number(after.users)&&after.users>0
 const analysisBefore=first&&number(before.analysis_users)?(before.analysis_users/before.users*100).toFixed(1)+'%':'—'
 const analysisAfter=second&&number(after.analysis_users)?(after.analysis_users/after.users*100).toFixed(1)+'%':'—'
 const tradeBefore=first&&number(before.trade_users)?(before.trade_users/before.users*100).toFixed(1)+'%':'—'
 const tradeAfter=second&&number(after.trade_users)?(after.trade_users/after.users*100).toFixed(1)+'%':'—'
 const moved=result.movement||{},analysis=Array.isArray(moved.analysis_ids)?moved.analysis_ids:null,trade=Array.isArray(moved.trade_ids)?moved.trade_ids:null,reactivated=Array.isArray(moved.return_d7_ids)?moved.return_d7_ids:null
 const drill=(type,items,label)=>items===null?'<span class="a-muted">'+label+'：数据不足</span>':'<button class="a-button" data-op-movement="'+type+'" '+(items.length?'':'disabled')+'>'+esc(label)+' '+fmt(items.length)+' 人 ↗</button>'
 return period+
 '<div class="crm-kpis"><div class="si-kpi"><span>分析覆盖率 · 前 / 后</span><strong>'+analysisBefore+' → '+analysisAfter+'</strong></div><div class="si-kpi"><span>交易记录覆盖率 · 前 / 后</span><strong>'+tradeBefore+' → '+tradeAfter+'</strong></div></div>'+
 '<p class="a-muted">'+(result.complete?'已满':'尚未满')+'预设 '+fmt(result.window_days||7)+' 天观察期；相同名单、相同时长前后对比，不包含因果归因。</p>'+
 table(['指标','前期','后期','变化'],rows)+
 '<div class="a-audience-actions">'+drill('analysis',analysis,'前期未观测、本期有分析')+drill('trade',trade,'前期未观测、本期有交易记录')+drill('return_d7',reactivated,'回流 D7（观测）')+'</div>'+
 errors.map(e=>'<p class="si-error">'+esc(e)+'</p>').join('')+
 '<p class="si-footnote">回流 D7 是连续7个完整UTC+7自然日未观测到前台使用，随后恢复有效分析、策略启动或交易成功事件；各窗口按用户去重。历史覆盖未确认，观测回流不等于确认流失，也不是D7留存。其他新增行为不等于历史首次；交易记录须核实实际成交。</p>'
}
