import {fetchDrillUsers} from '../api/drill.js'
import {openObservedDrill,deviceProfile} from './observedDrill.js'
export function deviceMarkup(ctx,v){
 if(!v.entries.length)return ''
 return `<section class="a-card device-diagnostic"><h2>入口用户设备诊断</h2><p>对比访问人数和未继续线索，点击条形下钻</p><div class="device-filters"><label>入口页面<select data-device-entry>${v.entries.map((r,i)=>`<option value="${i}">${ctx.esc(r.url)} · ${r.users}人</option>`).join('')}</select></label><label>诊断人群<select data-device-mode><option value="context">页面上下文的单页未继续线索</option><option value="idle">明确页面浏览的单页未操作</option></select></label><label>分组<select data-device-dim><option value="device">设备</option><option value="browser">浏览器</option><option value="os">操作系统</option><option value="environment">浏览器环境</option></select></label></div><div data-device-chart></div><p class="si-footnote">页面上下文线索不能确认单页访问或退出。观察不足不进入成熟分母。同用户跨设备可进入多组，各组不相加；UA不能判断视口宽窄。</p></section>`
}
export function bindDevices(ctx,m){
 const host=ctx.$('[data-device-chart]'),entry=ctx.$('[data-device-entry]'),mode=ctx.$('[data-device-mode]'),dim=ctx.$('[data-device-dim]');if(!host)return
 const home=m.page_visits.entries.findIndex(r=>r.url==='/');if(home>=0)entry.value=String(home)
 if(m.page_visits.sessions>m.page_visits.context_sessions)mode.value='idle'
 function draw(){
  const r=m.page_visits.entries[Number(entry.value)],rows=r.device_breakdown?.[dim.value]||[],field=mode.value==='idle'?'idle_users':'context_users',rateField=mode.value==='idle'?'idle_rate':'context_rate',max=Math.max(1,...rows.map(r=>r.users)),label=mode.value==='idle'?'单页未操作':'页面上下文未继续线索'
  host.innerHTML=`<p class="a-muted">${ctx.esc(r.url)} · 蓝条：访问用户 · 橙条：${label} · 右侧：成熟人群内比例</p>${rows.map(g=>`<div class="device-bar-row"><strong>${ctx.esc(g.label)}</strong><div><button class="device-bar device-all" style="width:${Math.max(2,g.users/max*100)}%" data-device-key="${ctx.esc(g.list_key+':all')}" aria-label="${ctx.esc(g.label)}访问用户 ${g.users}人">${g.users}人</button><button class="device-bar device-loss" style="width:${Math.max(2,g[field]/max*100)}%" data-device-key="${ctx.esc(g.list_key+':'+mode.value)}" aria-label="${ctx.esc(g.label)}${label} ${g[field]}人">${g[field]}人</button></div><span>${g[rateField]==null?'—':(g[rateField]*100).toFixed(1)+'%'}<small>成熟分母 ${mode.value==='idle'?g.eligible_users:g.context_eligible_users}人${g.users<10?' · 小样本':''}</small></span></div>`).join('')||'<p>当前无设备数据。</p>'}`
  host.querySelectorAll('[data-device-key]').forEach(b=>b.onclick=()=>openDeviceSummary(ctx,m,r.url,b.dataset.deviceKey))
 }
 for(const el of [entry,mode,dim])el.onchange=draw;draw()
}
export function browserGroups(rows){
 const dimensions={device:r=>r.device||'未知',browser:r=>`${r.browser||'未知'} ${r.version?.split('.')[0]||''}`.trim(),os:r=>r.os||'未知'}
 return Object.fromEntries(Object.entries(dimensions).map(([dim,label])=>{
  const groups=new Map();for(const row of rows){const key=label(row);if(!groups.has(key))groups.set(key,new Map());groups.get(key).set(row.id,row)}
  return [dim,[...groups].map(([label,users])=>({label,rows:[...users.values()]})).sort((a,b)=>b.rows.length-a.rows.length)]
 }))
}
export async function openDeviceSummary(ctx,m,entry,key){
 let rows=[],groups={}
 const update=ctx.drawer.openSummary({title:'浏览器与系统分布 · '+entry,description:'当前选中条形的人群，按用户去重；先看分布，再点击分组查看用户',html:'<p>正在加载完整人群…</p>',onAction:action=>{
  if(action==='all')return openObservedDrill(ctx,m,'全部选中用户 · '+entry,key,rows)
  const [dim,index]=action.split(':');const group=groups[dim]?.[Number(index)];if(group)openObservedDrill(ctx,m,group.label+' · '+group.rows.length+'位用户',key,group.rows)
 }})
 try{
  let offset=0,total=Infinity
  while(offset<total){const data=await fetchDrillUsers({kind:'cached_list',params:{cache_id:m.drill.cache_id,list_key:key},offset,limit:200});total=data.total;if(total>5000)throw Error('人群超过5000人，请缩小入口或统计日期');if(!data.rows.length)break;rows.push(...data.rows.map(r=>deviceProfile(m,key,r)));offset+=data.rows.length}
  rows=[...new Map(rows.map(r=>[r.id,r])).values()];if(rows.length!==total)throw Error('名单未完整加载，请重试')
  groups=browserGroups(rows)
  const chart=(dim,title)=>`<section class="device-diagnostic"><h3>${title}</h3>${groups[dim].map((g,i)=>`<div class="device-bar-row"><strong>${ctx.esc(g.label)}</strong><div><button class="device-bar device-all" style="width:${Math.max(2,g.rows.length/Math.max(1,...groups[dim].map(g=>g.rows.length))*100)}%" data-summary-action="${dim}:${i}" aria-label="${ctx.esc(g.label)} ${g.rows.length}人">${g.rows.length}人</button></div><span>${(g.rows.length/rows.length*100).toFixed(1)}%</span></div>`).join('')}</section>`
  update(`<p><strong>${rows.length} 位去重用户</strong> · 浏览器按主版本分组</p>${rows.length?chart('device','设备')+chart('browser','浏览器及版本')+chart('os','操作系统'):'<p>当前人群为空。</p>'}<p class="si-footnote">同用户多会话采用所选入口与设备组内最早匹配会话的UA，每位用户在每张图只计一次。版本来自UA上报标识。</p><button class="a-button" data-summary-action="all">查看全部用户</button>`)
 }catch(e){update(`<p class="a-empty">${ctx.esc(e.message)}</p>`)}
}
