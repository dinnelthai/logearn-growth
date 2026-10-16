export function loginBreakdownMarkup(data,{esc,fmt,table}) {
 if(!data.login_breakdown)return ''
 const rows=data.login_breakdown
 return `<section class="a-card si-panel"><h2>登录方式</h2>${table(['登录方式','去重用户','事件次数'],rows.map(r=>[esc(r.label),fmt(r.users),fmt(r.events)]))}<p class="si-footnote">同一用户可能出现多种登录方式，各行用户数不可相加。主动登录转化仅采用 login_type=manual；自动恢复与历史未知类型单独展示，不补推为主动登录。</p><details><summary>每日登录方式</summary>${table(['日期',...rows.map(r=>esc(r.label)+' · 用户 / 次数')],data.days.map(d=>[esc(d.date),...rows.map(r=>{const v=d.login_breakdown?.find(x=>x.type===r.type);return v?fmt(v.users)+' / '+fmt(v.events):'—'})]))}</details></section>`
}
