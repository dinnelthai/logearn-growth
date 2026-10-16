export function performanceSummary(ctx,value,{title='使用与交易表现',note='',filters=false}={}) {
 const {esc,fmt}=ctx,t=value?.total,num=n=>n==null?'—':fmt(n),money=n=>n==null?'—':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2})
 const cards=[['分析用户',t?.analysis_users,'analysed','统计期内至少一次已观测分析'],['分析次数（观测）',t?.analysis_events,null,'筹码展示 / 下钻事件去重'],['分析活跃天数',t?.analysis_days,null,'每位用户的自然日数相加'],['交易用户',t?.trade_users,'traded','有有效交易记录的用户'],['已知成交额 USD',t?.volume_usd,null,'按链和交易哈希去重']]
 return `<section class="a-card si-panel"><div class="si-sectionhead"><h2>${esc(title)}</h2><span>${num(t?.users)} 人</span></div><p class="a-muted">${esc(note)}</p><div class="crm-kpis">${cards.map(([label,n,filter,desc])=>{const tag=filters&&filter?'button':'div';return `<${tag} class="si-kpi" ${tag==='button'?`data-activity-status="${filter}" ${n==null?'disabled':''}`:''}><span>${label}${tag==='button'?' ↗':''}</span><strong>${filter===null&&label.includes('USD')?money(n):num(n)}</strong><small>${desc}</small></${tag}>`}).join('')}</div>${t?.missing_values?`<p class="a-muted">${num(t.missing_values)} 笔交易缺金额，仅展示已知金额。</p>`:''}${value?.unmatched_users?`<p class="a-muted">${num(value.unmatched_users)} 名用户不在数据快照中，未计入本次表现。</p>`:''}</section>`
}
export function memberRows(ctx,rows,page=0,{binding=false}={}) {
 const {esc,fmt,table}=ctx,num=n=>n==null?'—':fmt(n),money=n=>n==null?'—':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2})
 const heads=['账号',...(binding?['绑定 · UTC+7']:[]),'分析次数（观测）','分析活跃天数','交易笔数','已知成交额 USD']
 return table(heads,rows.slice(page*20,(page+1)*20).map(r=>[`<button class="a-tablelink" data-user-profile="${esc(r.user_id)}">${esc(r.user_id)} ↗</button>`,...(binding?[r.bound_at==null?'—':new Date(r.bound_at+25200000).toISOString().slice(0,19).replace('T',' ')]:[]),num(r.analysis_events),num(r.analysis_days),num(r.transactions),money(r.volume_usd)]))
}
