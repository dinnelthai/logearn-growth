export function openPathDiagnostics(ctx,m,key,title){
 const d=m.path_diagnostics?.[key];if(!d)return
 let selected=null
 const update=ctx.drawer.openSummary({title:title||'路径页面诊断',description:`选中路径 ${d.sessions} 个会话 · ${d.users} 位去重用户。观测结束不等于确定退出。`,html:'',onAction:action=>{selected=action==='back'?null:d.pages[Number(action)];draw()}})
 function draw(){
  const max=Math.max(1,...d.pages.map(p=>p.users))
  if(!selected){update(`<h3>哪些页面结束观察最多</h3><p class="a-muted">按去重人数排序；点击页面查看设备与浏览器。只包含图中选中的具体会话，各页面用户可重叠。</p>${d.pages.map((p,i)=>`<div class="device-bar-row"><strong>${ctx.esc(p.url)}</strong><div><button class="device-bar device-loss" style="width:${Math.max(2,p.users/max*100)}%" data-summary-action="${i}" aria-label="页面 ${ctx.esc(p.url)} ${p.users}人">${p.users}人</button></div><span>${p.sessions}会话</span></div>`).join('')||'<p>没有可分析页面。</p>'}`);return}
  const chart=(dim,label)=>{const rows=selected.dimensions[dim],max=Math.max(1,...rows.map(r=>r.users));return `<section class="device-diagnostic"><h3>${label}</h3>${rows.map(r=>`<div class="device-bar-row"><strong>${ctx.esc(r.label)}</strong><div><div class="device-bar device-all" style="width:${Math.max(2,r.users/max*100)}%">${r.users}人</div></div><span>${(r.users/selected.users*100).toFixed(1)}%</span></div>`).join('')}</section>`}
  update(`<button class="a-button" data-summary-action="back">← 返回页面排行</button><h3>${ctx.esc(selected.url)} · ${selected.users}人 / ${selected.sessions}会话</h3>${chart('device','设备')}${chart('browser','浏览器及主版本')}${chart('os','操作系统')}${chart('environment','浏览器环境')}<p class="si-footnote">同一用户跨设备可进入多个分组，各组人数不相加。这里只展示分布，不是各设备的跳出率。</p>`)
 }
 draw()
}
