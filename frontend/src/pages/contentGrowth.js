import * as echarts from 'echarts'
import {getToken,notifyExpiredSession} from '../auth/authClient.js'
import {viewState} from '../components/viewStates.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/content-growth'
const labels={x:'X 官方账号',blog:'博客',youtube:'YouTube'}
async function request(path='',method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok){notifyExpiredSession(r);throw Error(d.error||'内容渠道请求失败')};return d}
function renderXPanel(x,esc){
 if(!x)return '<section class="a-card a-details"><h2>X 官方账号监测</h2><p>内容渠道数据已加载，但后端尚未提供 X 监测接口。请更新并重启后端服务，然后刷新页面。</p></section>';
 const a=x?.account,metrics=x?.metrics||{},fmt=v=>v==null?'未知':Number(v).toLocaleString('zh-CN');
 let html='<section class="a-card a-details"><h2>X 官方账号监测</h2><p>只读公开数据，不授权账号、不发帖。手工内容登记与官方 X 数据分别统计。</p>';
 html+='<form data-x-account style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">'+
  '<label>官方账号 @<input name="username" maxlength="16" placeholder="例如 LogEarn" value="'+esc(a?.username||'')+'" required></label>'+
  '<label><input name="auto_sync" type="checkbox" '+(a?.autoSync?'checked':'')+'> 每日自动采集一次</label>'+
  '<button class="a-button" type="submit">保存账号</button>'+
  '<button class="a-button" type="button" data-x-sync '+(!a||!x.configured?'disabled':'')+'>立即同步</button>'+
  (a?'<button class="a-button" type="button" data-x-remove>移除监测</button>':'')+'</form>';
 html+='<p class="a-muted">每次最多读取 10 条原创推文及账号粉丝数；使用后端 TWITTER_BEARER_TOKEN，X API 可能按量计费。'+
  (x.configured?' API 密钥已配置。':' 尚未配置 X API Bearer Token，保存账号后仍不能同步。')+'</p>';
 if(a){
  html+='<p>监测 @'+esc(a.username)+' · '+(a.lastSynced?'最近同步：'+esc(new Date(a.lastSynced).toLocaleString('zh-CN',{timeZone:'Asia/Bangkok'})):'尚未完成首次同步')+'</p>';
  if(a.error)html+='<p role="alert">最近同步失败：'+esc(a.error)+'</p>';
  html+='<div style="display:flex;gap:12px;flex-wrap:wrap">'+
   '<div class="a-card a-details"><strong>粉丝数</strong><p>'+fmt(a.followers)+'</p><small>近7日已记录变化：'+(metrics.followerChange==null?'样本不足':(metrics.followerChange>0?'+':'')+fmt(metrics.followerChange))+'</small></div>'+
   '<div class="a-card a-details"><strong>已读取原创推文</strong><p>'+fmt(metrics.samplePosts)+'</p><small>最近30天、已采集样本</small></div>'+
   '<div class="a-card a-details"><strong>样本公开曝光</strong><p>'+fmt(metrics.impressions)+'</p><small>只含指标完整的推文</small></div>'+
   '<div class="a-card a-details"><strong>样本互动率</strong><p>'+(metrics.engagementRate==null?'未知':fmt(metrics.engagementRate)+'%')+'</p><small>赞＋回复＋转发＋引用 / 曝光</small></div></div>';
  html+='<h3>最近采集的内容</h3><div style="overflow:auto"><table class="a-table"><thead><tr><th>发布时间</th><th>推文</th><th>曝光</th><th>赞</th><th>回复</th><th>转发</th><th>引用</th></tr></thead><tbody>'+
   ((x.posts||[]).slice(0,10).map(p=>'<tr><td>'+esc((p.published_at||'').slice(0,10))+'</td><td><a href="https://x.com/'+encodeURIComponent(a.username)+'/status/'+encodeURIComponent(p.post_id)+'" target="_blank" rel="noopener noreferrer">'+esc((p.body||'').slice(0,110))+'</a></td><td>'+fmt(p.impressions)+'</td><td>'+fmt(p.likes)+'</td><td>'+fmt(p.replies)+'</td><td>'+fmt(p.reposts)+'</td><td>'+fmt(p.quotes)+'</td></tr>').join('')||'<tr><td colspan="7">尚无已采集的原创推文</td></tr>')+
   '</tbody></table></div>';
  if(metrics.bestPost)html+='<p>样本互动率最高的推文：<a href="https://x.com/'+encodeURIComponent(a.username)+'/status/'+encodeURIComponent(metrics.bestPost)+'" target="_blank" rel="noopener noreferrer">查看原文</a>。高互动不等于真实获客。</p>';
 }
 html+='<p data-x-notice role="status"></p><p class="a-muted">数据来源：X API v2 公开指标；粉丝变化从首次记录后才可计算。数据缺失记为未知，不等于零；平台表现不能单独证明注册或交易转化。</p></section>';
 return html;
}

export function createContentGrowth(ctx){const host=()=>ctx.$('#as-output');let generation=0,chart=null,xNotice='',xBusy=false
 function setXNotice(message){xNotice=message;const node=host()?.querySelector('[data-x-notice]');if(node)node.textContent=message}

 async function draw(){chart?.dispose();chart=null;ctx.clear();const stamp=++generation;host().innerHTML='<div class="a-card a-details">正在读取内容渠道…</div>';try{const data=await request();if(stamp!==generation)return;render(data)}catch(e){if(stamp!==generation)return;host().innerHTML=viewState({kind:'error',title:'内容渠道暂不可用',description:e.message,actionLabel:'重新读取',actionAttr:'data-view-retry'});host().querySelector('[data-view-retry]').onclick=draw}}
 function render(data){const esc=ctx.esc;host().innerHTML=`<section class="a-card a-details"><h2>内容渠道增长</h2><p>官方 X 提供独立的公开数据监测；博客、YouTube 与手工登记内容维持原有统计。</p><div style="display:flex;gap:16px;flex-wrap:wrap">${Object.entries(labels).map(([key,label])=>`<div class="a-card a-details"><strong>${label}</strong><p>内容 ${data.summary[key].count} · 曝光 / 浏览 ${data.summary[key].impressions==null?'未知':data.summary[key].impressions.toLocaleString()}</p><small>自动同步：${esc(data.connections[key])}</small></div>`).join('')}</div>${renderXPanel(data.x_monitor,esc)}<p class="a-muted">曝光为手工登记的累计值；缺失时汇总显示未知。各平台口径不同，不跨平台相加。</p></section><section class="a-card a-details"><h2>内容表现趋势</h2><p>按发布时间所在周比较单篇平均表现；同一平台内查看。数据为手工录入的累计值，较早内容积累时间更长，不能直接证明内容质量变化。</p><label>渠道 <select data-trend-platform>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label> <label>指标 <select data-trend-metric><option value="impressions">单篇平均曝光 / 浏览</option><option value="likes">单篇平均点赞</option><option value="comments">单篇平均评论 / 回复</option><option value="shares">单篇平均分享 / 转发</option></select></label><div data-trend-chart style="width:100%;height:300px" role="img" aria-label="按周内容表现折线图"></div><p data-trend-empty class="a-muted"></p><p class="a-muted">缺少任一内容指标的周显示为断点；没有发布日期的内容不计入。不同平台指标不可直接相加。</p></section><section class="a-card a-details"><h2>人工内容评价（可选）</h2><p>按发布时间所在周统计，满分 6 分；仅统计三项均已评价的内容，评价范围变化会影响比较。未填发布日期的内容不计入。</p>${data.review_trend.length?`<table class="a-table"><thead><tr><th>周起始</th><th>已评价 / 发布数</th><th>平均分</th></tr></thead><tbody>${data.review_trend.slice(0,12).map(w=>`<tr><td>${esc(w.week)}</td><td>${w.reviewed} / ${w.total}</td><td>${w.average==null?'未知':w.average+' / 6'}</td></tr>`).join('')}</tbody></table>`:'<p>暂无有发布日期的内容。</p>'}</section><section class="a-card a-details"><h2>登记内容</h2><form data-form style="display:flex;gap:12px;flex-wrap:wrap;align-items:end"><label>渠道<select name="platform">${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>标题<input name="title" required maxlength="200"></label><label>内容链接<input name="url" type="url" required></label><label>发布时间<input name="published_at" type="date"></label><label>主题<input name="topic" maxlength="100"></label><label>曝光 / 浏览（可留空）<input name="impressions" type="number" min="0" step="1"></label><label>点赞<input name="likes" type="number" min="0" step="1"></label><label>评论 / 回复<input name="comments" type="number" min="0" step="1"></label><label>分享 / 转发<input name="shares" type="number" min="0" step="1"></label><fieldset style="flex-basis:100%"><legend>人工内容价值评价（可稍后填写）</legend><p>按内容本身评价，和曝光、互动分开。0 不足 · 1 部分具备 · 2 明确具备；三项齐全才显示总分。</p><div style="display:flex;gap:12px;flex-wrap:wrap">${[['audience_fit','目标用户与问题：是否贴合链上研究或交易者的真实任务'],['actionability','可操作性：是否提供明确步骤、方法或示例'],['evidence','证据与边界：是否提供事实、案例或说明适用范围']].map(([key,label])=>`<label>${label}<select name="${key}"><option value="">未评价</option><option value="0">0 · 不足</option><option value="1">1 · 部分具备</option><option value="2">2 · 明确具备</option></select></label>`).join('')}<label>评价依据 / 改进建议<input name="review_note" maxlength="1000" placeholder="写明依据和下一篇如何改进"></label></div></fieldset><button class="a-button a-primary">保存</button><button type="button" data-cancel hidden>取消编辑</button></form><p data-message role="status"></p></section><section class="a-card a-details"><h2>内容记录</h2><p>人工评价反映内容本身，不能证明用户满意或获客效果；可结合互动和后续产品数据复盘。</p><p>追踪链接用于后续识别内容来源；产品端采集和归因尚未接入。</p><div style="overflow:auto"><table class="a-table"><thead><tr><th>渠道</th><th>内容</th><th>主题</th><th>发布时间</th><th>曝光 / 浏览</th><th>互动（赞 / 评论 / 分享）</th><th>人工内容评价</th><th>追踪链接</th><th>操作</th></tr></thead><tbody>${data.items.map(i=>`<tr><td>${esc(labels[i.platform])}</td><td><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a></td><td>${esc(i.topic||'—')}</td><td>${esc(i.published_at||'未知')}</td><td>${i.impressions==null?'未知':Number(i.impressions).toLocaleString()}</td><td>${[i.likes,i.comments,i.shares].map(v=>v==null?'未知':Number(v).toLocaleString()).join(' / ')}</td><td>${i.value_review.score==null?'待评价':esc(i.value_review.level)+' · '+i.value_review.score+'/6'}<br><small>${esc(i.review_note||'')}</small></td><td><input aria-label="追踪链接" readonly value="${esc(i.tracking_url)}" onclick="this.select()"></td><td><button type="button" data-edit="${esc(i.id)}">编辑</button></td></tr>`).join('')||'<tr><td colspan="9">暂无内容记录</td></tr>'}</tbody></table></div></section>`;const xForm=host().querySelector('[data-x-account]');if(xForm)xForm.onsubmit=async event=>{
  event.preventDefault();if(xBusy)return;
  xBusy=true;
  try{await request('/x/account','PUT',{username:xForm.elements.username.value,
    auto_sync:xForm.elements.auto_sync.checked});xNotice='监测账号已保存';await draw()}
  catch(error){setXNotice(error.message)}
  finally{xBusy=false}
 };
 const xSync=host().querySelector('[data-x-sync]');if(xSync)xSync.onclick=async()=>{
  if(xBusy)return;xBusy=true;xSync.disabled=true;setXNotice('正在从 X 读取最新数据…');
  try{await request('/x/sync','POST',{});xNotice='同步成功';await draw()}
  catch(error){setXNotice('同步失败：'+error.message)}
  finally{xBusy=false;if(xSync.isConnected)xSync.disabled=false}
 };
 const xRemove=host().querySelector('[data-x-remove]');if(xRemove)xRemove.onclick=async()=>{
  if(xBusy||!window.confirm('移除当前 X 监测账号及自动采集记录？手工登记内容会保留。'))return;
  xBusy=true;
  try{await request('/x/account','DELETE');xNotice='已停止 X 监测';await draw()}
  catch(error){setXNotice(error.message)}
  finally{xBusy=false}
 };
 const xNoticeNode=host().querySelector('[data-x-notice]');if(xNoticeNode)xNoticeNode.textContent=xNotice;
 const platformSelect=host().querySelector('[data-trend-platform]'),metricSelect=host().querySelector('[data-trend-metric]');chart=echarts.init(host().querySelector('[data-trend-chart]'));const drawTrend=()=>{const rows=data.performance_trend[platformSelect.value],metric=metricSelect.value;chart.setOption({tooltip:{trigger:'axis'},grid:{left:55,right:20,top:20,bottom:45},xAxis:{type:'category',data:rows.map(r=>r.week)},yAxis:{type:'value',min:0},series:[{type:'line',connectNulls:false,data:rows.map(r=>r[metric]==null?null:Math.round(r[metric]/r.count*100)/100)}]},true);host().querySelector('[data-trend-empty]').textContent=rows.some(r=>r[metric]!=null)?'':'当前渠道暂无完整的周度指标数据。'};platformSelect.onchange=drawTrend;metricSelect.onchange=drawTrend;drawTrend();const form=host().querySelector('[data-form]'),cancel=host().querySelector('[data-cancel]');let editing=null;host().querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{const item=data.items.find(i=>i.id===button.dataset.edit);editing=item.id;for(const key of ['platform','title','url','published_at','topic','impressions','likes','comments','shares','audience_fit','actionability','evidence','review_note'])form.elements[key].value=item[key]??'';form.elements.platform.disabled=true;cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'center'})});cancel.onclick=()=>{editing=null;form.reset();form.elements.platform.disabled=false;cancel.hidden=true};form.onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),msg=host().querySelector('[data-message]');button.disabled=true;try{const body=Object.fromEntries(new FormData(form));body.platform=form.elements.platform.value;await request(editing?'/items/'+encodeURIComponent(editing):'/items',editing?'PUT':'POST',body);await draw()}catch(err){msg.textContent=err.message;button.disabled=false}}}
 return {draw,dispose(){generation++;chart?.dispose();chart=null}}
}
