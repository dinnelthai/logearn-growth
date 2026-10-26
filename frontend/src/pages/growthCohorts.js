import {observedTime} from './observedDrill.js'
const rate=v=>v==null?'—':(v*100).toFixed(1)+'%'
export function growthEvidenceMarkup(ctx,m){
 const {esc}=ctx,q=m.quality||{}
 return `<aside class="a-card si-panel" aria-label="指标证据范围"><strong>指标证据范围</strong><p>统计窗：${esc(observedTime(m.start))} 至 ${esc(observedTime(m.end))}（UTC+7，截止不含） · 观测截至 ${esc(observedTime(m.as_of))}。</p><p>历史覆盖：${q.history_complete?'已声明完整':'未确认'} · 连续采集确认截至：${esc(q.events_complete_through||'未知')}。分析人数沿用筹码查看/下钻；不等于请求成功或用户理解。观察窗成熟不证明采集完整。</p></aside>`
}
export function growthCohortsMarkup(ctx,m){
 const {esc,fmt,table}=ctx,c=m.cohorts
 if(!c)return '<section class="a-card si-panel"><p>该历史结果未包含注册与复访口径，请用最新数据重新分析。</p></section>'
 const link=(n,k,title)=>`<button class="si-numberlink" data-gi-key="${esc(k)}" data-gi-title="${esc(title)}">${fmt(n)} ↗</button>`
 const activation=(label,r)=>[label,link(r.users,r.list_key+':users',label),link(r.activated,r.list_key+':activated',label+' · 激活'),link(r.eligible,r.list_key+':eligible',label+' · 成熟'),rate(r.rate),link(r.pending,r.list_key+':pending',label+' · 待观察')]
 return `<section class="a-card si-panel"><h2>首次观测与真实新注册</h2>${table(['入组依据','入组用户','24小时分析','成熟用户','激活比例','待观察'],[activation('首次观测时间',c.observed),...(c.registration.available?[activation('账号注册时间',c.registration.metrics)]:[])])}${!c.registration.available?`<p class="si-error">${esc(c.registration.error||'注册事实暂不可用，未将缺失解释为零')}</p>`:''}<p>真实新注册按账号创建时间入组，包含没有行为事件的账号；两组不能相加。激活按各自起点后24小时，窗口左闭右开，只有成熟用户进入分母。${c.registration.scope==='observed_source'?'当前按首次已记录来源筛选，无已知来源账号不归入其他来源；本结果不是全平台注册队列。':''}</p></section><section class="a-card si-panel"><h2>首次分析后的重复价值</h2>${table(['复访定义','首次分析入组','7天成熟人数','成熟复访人数','复访比例','待观察','含未成熟已观测复访'],c.repeats.map(r=>[esc(r.label),link(r.users,r.list_key+':users',r.label),link(r.eligible,r.list_key+':eligible',r.label+' · 成熟'),link(r.returned,r.list_key+':returned',r.label+' · 成熟复访'),rate(r.rate),link(r.pending,r.list_key+':pending',r.label+' · 待观察'),link(r.observed_returned,r.list_key+':observed_returned',r.label+' · 已观测复访')]))}<p>两项都从首次已观测分析起168小时内观察，满168小时才进入比例分母；截止时刻不含。另日按UTC+7，跨午夜几分钟也算；相隔至少24小时单列。含未成熟的已观测复访人数仅作进度，不进入成熟比例分子。这不是D7留存，也不证明用户理解或收入。</p><p class="a-muted">${esc(c.definition)}</p></section>`
}
