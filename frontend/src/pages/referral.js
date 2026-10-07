import {computeReferral} from '../analytics/referral.js'
import {computeSharing,SHARE_TYPES} from '../analytics/sharing.js'
export function createReferralPage(ctx){
 const {$,$$,day,asof,date,esc,fmt,pct,table,stat,dataStore}=ctx
 const clearNative=ctx.clear
 let users=[]
function drawReferral(c){
clearNative();users=ctx.getUsers();const opts={startAt:c.start,endAt:c.end,asOf:asof,sourceFilter:c.source},r=computeReferral(users,dataStore.referrals??[],opts),sharing=computeSharing(users,dataStore.referrals,opts);
const trackingAvailable=users.some(u=>u.events.some(e=>['share_click','share_complete','invite_visit'].includes(e.type))),relationsAvailable=Array.isArray(dataStore.referrals);
const n=(value)=>trackingAvailable?fmt(value):'待采集',binding=value=>relationsAvailable?fmt(value):'待获取';
$('#as-output').innerHTML=`<div class="a-context"><span class="a-chip">分享与推荐增长</span><span>${date(c.start)}–${date(c.end-day)} · ${esc(c.source==='all'?'全部来源':c.source)}</span></div>
<div class="a-summary a-four">${stat('分享按钮点击',n(sharing.clicks),'主动邀请、信号、倍数入口')}${stat('完成分享操作',n(sharing.shares),'成功复制或调用分享功能，非送达证明')}${stat('分享用户',n(sharing.sharers),'统计期内去重分享者')}${stat('链接访问用户',n(sharing.visitors),'统计期内去重访问者')}</div>
<div class="a-card"><div class="a-cardhead"><h2>分享 → 邀请 → 激活</h2><span class="a-muted">活动次数与用户数分别统计</span></div>${table(['分享点击次数','完成分享次数','链接访问用户','绑定邀请用户','7天有效分析用户'],[[n(sharing.clicks),n(sharing.shares),n(sharing.visitors),binding(r.bound_invitees),binding(r.activated_invitees)]])}<p class="a-details">前三项按当期行为发生时间；绑定与激活按当期首次绑定入组。不同阶段可能跨期，不直接计算逐步转化率。</p></div>
<div class="a-summary a-four">${stat('参与推荐用户',binding(r.advocates),'至少绑定一位被邀请用户')}${stat('绑定邀请用户',binding(r.bound_invitees),'首次绑定关系，按被邀请人去重')}${stat('推荐激活率',relationsAvailable?pct(r.activated_invitees,r.bound_invitees):'—',relationsAvailable?r.activated_invitees+' 位完成有效分析':'需推荐关系接口')}${stat('有效推荐系数 K',relationsAvailable&&r.advocates?r.k_factor.toFixed(2):'—','激活邀请用户 ÷ 参与推荐用户')}</div>
<div class="a-card"><div class="a-cardhead"><h2>各分享功能表现</h2><span class="a-muted">主动按钮 / 信号 / 倍数</span></div>${table(['分享功能','按钮点击','完成分享','链接访问UV（逐链接累计）','绑定用户','激活用户'],sharing.types.map(row=>[SHARE_TYPES[row.type],n(row.clicks),n(row.shares),n(row.visitors),binding(row.bound),binding(row.active)]))}<p class="a-details">功能表访问数按链接UV累计，同一人访问多个链接会重复；顶部访问人数全局去重。无法归因的分享类型不计入功能行。</p></div>
<div class="a-card"><div class="a-cardhead"><h2>邀请链接排行</h2><label>排序<select id="as-link-sort"><option value="bound">绑定人数</option><option value="active">激活人数</option><option value="visitors">访问人数</option></select></label></div><div id="as-link-ranking"></div><p class="a-details">以 referral_link_id 关联，${sharing.unattributed} 位绑定用户缺少链接归因，单独列出。邀请人身份与链接归属须由后端校验。</p></div>
<div class="a-card a-details"><h2>计算口径与采集状态</h2><p>${trackingAvailable?'已取得分享行为记录。':'分享行为尚未采集，不能把未提供数据当成0。'}${relationsAvailable?'已取得推荐关系。':'推荐关系待获取，分享数据仍可独立展示。'}</p><p>绑定后7天内完成有效分析计为激活；尚有 ${r.pending_invitees??0} 位未激活用户观察窗口未结束。</p><p>来源筛选对分享者、访问者分别按各自首次来源过滤，对绑定用户按被邀请者首次来源过滤；这些阶段不是同一人群漏斗。</p><p>点击按钮不代表完成分享；复制链接、分享面板调用成功不代表对方收到。信号与倍数分享分别记录功能类型和内容ID。</p></div>`;
if(!relationsAvailable){$$('#as-output .a-summary').filter(el=>el.textContent.includes('参与推荐用户')).forEach(el=>el.remove());}
if(!trackingAvailable){$$('#as-output .a-summary').filter(el=>el.textContent.includes('分享按钮点击')).forEach(el=>el.remove());}
const renderLinks=()=>{const key=$('#as-link-sort').value,rows=[...sharing.links].sort((a,b)=>b[key]-a[key]||b.bound-a.bound);$('#as-link-ranking').innerHTML=rows.length?table(['链接ID','邀请人','分享功能','完成分享','访问UV','绑定人数','激活人数','激活率','待观察'],rows.map(row=>[esc(row.id==='unattributed'?'未归因链接':row.id),esc(row.inviter||'未知'),esc(SHARE_TYPES[row.type]||'未知'),n(row.shares),n(row.visitors),binding(row.bound),binding(row.active),relationsAvailable?pct(row.active,row.bound):'—',binding(row.pending)])):'<p class="a-empty">当前筛选暂无邀请链接记录。</p>'};$('#as-link-sort').onchange=renderLinks;renderLinks();
}

 return {draw:drawReferral,dispose(){}}
}
