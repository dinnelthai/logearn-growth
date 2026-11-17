import './contentGrowth.css'
import {getToken,notifyExpiredSession} from '../auth/authClient.js'
import {viewState} from '../components/viewStates.js'
import {beginPageLoad} from './pageLoading.js'
const base=(import.meta.env.VITE_BACKEND_BASE_URL??'http://localhost:3001')+'/api/content-growth'
const labels={x:'X 官方账号',blog:'博客',youtube:'YouTube'}
async function request(path='',method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok){notifyExpiredSession(r);throw Error(d.error||'内容渠道请求失败')};return d}
export function renderXPanel(x,esc,selected,sort){
 if(!x?.accounts)return '<section class="a-card a-details"><h2>X 内容表现</h2><p role="status">X 监测数据暂不可用，请更新并重启后端。下方历史手工记录仍可使用。</p></section>';
 const account=x.accounts.find(a=>a.id===selected)||x.accounts[0];
 if(!account)return '<section class="a-card a-details"><h2>X 内容表现</h2><p>暂无官方账号。</p></section>';
 const fmt=v=>v==null?'未知':Number(v).toLocaleString('zh-CN');
 const posts=Array.isArray(account.posts)?account.posts:[];
 const rate=p=>p.impressions>0&&[p.likes,p.replies,p.reposts].every(v=>Number.isFinite(v))?
  100*(p.likes+p.replies+p.reposts+(p.quotes||0))/p.impressions:null;
 const measured=posts.filter(p=>rate(p)!=null&&Date.parse(p.published_at)>=Date.now()-30*86400000);
 const byRate=[...measured].sort((a,b)=>rate(b)-rate(a));
 const byViews=[...measured].sort((a,b)=>b.impressions-a.impressions);
 const recent=posts.filter(p=>Date.parse(p.published_at)>=Date.now()-30*86400000);
 const m=account.metrics||{};
 const cooldown=account.lastAttempt!=null&&Date.now()-account.lastAttempt<3600000;
 const nextSync=cooldown?new Date(account.lastAttempt+3600000).toLocaleString('zh-CN',{timeZone:'Asia/Bangkok'}):null;
 const renderRate=p=>rate(p)==null?'不可计算':rate(p).toFixed(2)+'%';
 const actionRate=(p,key,count)=>{
  const value=p[key];
  if(Number.isFinite(value))return value.toFixed(2)+'%';
  return p.impressions>0&&Number.isFinite(count)?(count/p.impressions*100).toFixed(2)+'%':'不可计算';
 };
 const stamp=value=>Number.isFinite(value)?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Bangkok'}):'未记录';
 const ageWindow=(p,key,age)=>{
  const snap=p.milestones?.[key];
  return snap?age+'h附近：'+fmt(snap.impressions)+' 浏览（'+snap.ageHours+'h采集）':age+'h：未记录';
 };
 const href=p=>'https://x.com/'+encodeURIComponent(account.id)+'/status/'+encodeURIComponent(p.post_id);
 const short=p=>esc((p.body||'').replace(/\s+/g,' ').slice(0,90)||'无文字内容');
 let html='<section class="a-card a-details" style="margin-bottom:14px">'+
  '<div style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">'+
  '<div><h2 style="margin-bottom:4px">X 官方账号内容表现</h2><p class="a-muted">沿用「官方账号关注者」的账号和只读数据源，此处只做内容评价。</p></div>'+
  '<div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="选择官方 X 账号">'+
  x.accounts.map(a=>'<button type="button" class="a-button '+(a.id===account.id?'a-primary':'')+'" data-x-tab="'+esc(a.id)+'" aria-pressed="'+(a.id===account.id?'true':'false')+'">@'+esc(a.id)+'</button>').join('')+'</div></div>';
 html+='<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">'+
  '<p class="a-muted" style="margin:0">最近同步 '+(account.lastSynced?
   esc(new Date(account.lastSynced).toLocaleString('zh-CN',{timeZone:'Asia/Bangkok'})):'尚未同步')+
  ' · '+(x.configured?'数据源已连接':'数据源未配置')+'</p>'+
  '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><label style="display:flex;align-items:center;gap:6px">'+
  '<input type="checkbox" data-x-auto '+(account.autoSync?'checked':'')+(!x.configured?' disabled':'')+'>每日自动同步</label>'+
  '<button type="button" class="a-button" data-x-sync '+(!x.configured||cooldown?'disabled':'')+'>'+(cooldown?'同步冷却中':'同步最新数据')+'</button></div></div>';
 if(cooldown)html+='<p class="a-muted">为控制采集费用与频率，该账号约在 '+esc(nextSync)+' 后可再次手动同步。</p>';
 if(account.error)html+='<p role="alert">上次采集失败：'+esc(account.error)+'</p>';
 if(!x.configured)html+='<p role="status">请先配置已有 X 关注者采集使用的数据源。</p>';
 html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px">'+
  '<div class="a-card a-details"><div class="a-muted">当前粉丝</div><div class="a-statvalue">'+fmt(account.followers)+'</div><small>记录期内变化：'+(m.followerChange==null?'快照不足':(m.followerChange>0?'+':'')+fmt(m.followerChange))+'</small></div>'+
  '<div class="a-card a-details"><div class="a-muted">近30天样本帖子</div><div class="a-statvalue">'+fmt(recent.length)+'</div><small>已保存 '+fmt(posts.length)+' 条，不代表全部发布量</small></div>'+
  '<div class="a-card a-details"><div class="a-muted">近30天已知浏览</div><div class="a-statvalue">'+fmt(m.impressions)+'</div><small>只包含指标完整的样本</small></div>'+
  '<div class="a-card a-details"><div class="a-muted">近30天互动率</div><div class="a-statvalue">'+(m.engagementRate==null?'未知':fmt(m.engagementRate)+'%')+'</div><small>'+fmt(m.measuredPosts)+' 条有效样本 · 赞/回复/转发 ÷ 浏览</small></div></div></section>';
 html+='<section class="a-card a-details" style="margin-bottom:14px"><h2>近期内容对比线索（非 AI 结论）</h2>';
 if(measured.length<2){
  html+='<p>当前有 '+fmt(measured.length)+' 条具备浏览和互动指标的已采集内容，暂时不足以比较内容表现。</p>'+
   '<p class="a-muted">建议继续积累同类型帖子样本，再观察互动率和浏览差异；此处不会把单条内容判断为成功策略。</p>';
 }else{
  const best=byRate[0],reach=byViews[0];
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'+
   '<div class="a-card a-details"><strong>互动率较高</strong><p><a target="_blank" rel="noopener noreferrer" href="'+href(best)+'">'+short(best)+'</a></p>'+
   '<p>互动率 '+renderRate(best)+' · 浏览 '+fmt(best.impressions)+'</p><small>该帖子近期互动率相对突出，但仍需按相近发布时间与内容主题验证。</small></div>'+
   '<div class="a-card a-details"><strong>浏览量较高</strong><p><a target="_blank" rel="noopener noreferrer" href="'+href(reach)+'">'+short(reach)+'</a></p>'+
   '<p>浏览 '+fmt(reach.impressions)+' · 互动率 '+renderRate(reach)+'</p><small>浏览量高不等于有效获客；由 Growth Agent 结合内容与站内数据进一步判断。</small></div></div>';
  html+='<p class="a-muted">比较基于 '+fmt(measured.length)+' 条指标完整的累计样本；发布时间不同，不能当作同口径实验或因果证明。</p>';
 }
 html+=m.followerChange==null?'<p class="a-muted">粉丝增长趋势暂不可计算：至少需要两天的历史快照。</p>':
  '<p class="a-muted">粉丝记录期变化：'+(m.followerChange>0?'+':'')+fmt(m.followerChange)+'；不能归因于某条帖子。</p>';
 const baseline=account.benchmarks?.h24;
 if(baseline?.status==='available')
  html+='<p class="a-muted">发布后24小时附近的同账号样本浏览中位数：'+fmt(baseline.medianViews)+'（'+fmt(baseline.sampleSize)+'条，±6小时观测）。尚未按内容主题分组，不代表同类内容。</p>';
 else
  html+='<p class="a-muted">发布后24小时同龄对比：'+fmt(baseline?.sampleSize??0)+'条可用样本，需要至少4条才能形成账号基准；不会把今日累计值倒填到24小时。</p>';
 html+='<p class="a-muted">以上只是规则生成的样本观察，不是AI评价；不自动生成行动、分数或发帖。运营结论由Growth Agent使用有来源的证据生成。</p>'+
  '<p><a class="a-button" href="?view=ai-analysis&skill=content-growth">用 Growth Agent 分析内容（提交后才计费）</a></p>';
 html+='</section>';
 const sorted=[...posts].sort((a,b)=>sort==='views'?(b.impressions??-1)-(a.impressions??-1):
  sort==='engagement'?(rate(b)??-1)-(rate(a)??-1):
  Date.parse(b.published_at)-Date.parse(a.published_at));
 html+='<section class="a-card a-details"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'+
  '<div><h2 style="margin-bottom:4px">帖子表现与行为比率</h2><p class="a-muted">实际行为观察：公开浏览、回复、转发、点赞。不是 X 官方预测推荐分。</p></div>'+
  '<label>排序 <select data-x-sort>'+
  [['recent','最新发布'],['engagement','互动率最高'],['views','浏览量最高']].map(([key,label])=>
  '<option value="'+key+'" '+(sort===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div>';
 const metricCard=(label,value,percent)=>
  '<div class="x-content-post-metric"><span class="x-content-post-metric-label">'+label+'</span>'+
  '<strong>'+fmt(value)+'</strong>'+(percent==null?'':'<small>'+percent+'</small>')+'</div>';
 const rendered=sorted.map(p=>
  '<article class="x-content-post-row" role="listitem">'+
   '<div class="x-content-post-body">'+
    '<div class="x-content-post-date">'+esc((p.published_at||'').slice(0,10))+'</div>'+
    '<a class="x-content-post-link" target="_blank" rel="noopener noreferrer" href="'+href(p)+'" title="打开 X 原帖">'+short(p)+'</a>'+
   '</div>'+
   '<div class="x-content-post-metrics" aria-label="帖子公开指标">'+
    metricCard('公开浏览',p.impressions,null)+
    metricCard('回复',p.replies,'回复率 '+actionRate(p,'replyRate',p.replies))+
    metricCard('转发',p.reposts,'转发率 '+actionRate(p,'repostRate',p.reposts))+
    metricCard('点赞',p.likes,'点赞率 '+actionRate(p,'likeRate',p.likes))+
   '</div>'+
   '<div class="x-content-post-footer">'+
    '<div class="x-content-post-windows" aria-label="发布后时点快照">'+
     '<span>'+ageWindow(p,'h24',24)+'</span>'+
     '<span>'+ageWindow(p,'h48',48)+'</span>'+
    '</div>'+
    '<div class="x-content-post-captured">采集于 '+esc(stamp(p.observed_at))+' · twitterapi.io</div>'+
   '</div>'+
  '</article>').join('');
 html+='<div class="x-content-post-list" role="list">'+
  (rendered||'<p class="x-content-post-empty">尚未采集到帖子。可在上方执行同步。</p>')+
  '</div>'+
  '<p data-x-notice role="status"></p><details class="x-content-data-note"><summary>指标口径与采集限制</summary><p class="a-muted">浏览量来自第三方 viewCount，不能直接等同 X 内部曝光统计。比率＝各项实际互动 / 已知浏览；浏览缺失或为0时显示「不可计算」。24h/48h仅使用发布后目标时间±6小时内的真实快照；首次采集前的历史无法补回。每日同步不保证每篇都能取得24/48小时快照。算法预测是针对读者的个性化行为概率，不是上述实际比率。<a href="?view=growth-agent-control">前往 AI Growth Agent</a> 查看专项分析。</p></details></section>';
 return html;
}

export function createContentGrowth(ctx){const host=()=>ctx.$('#as-output');let generation=0,xNotice='',xBusy=false,selectedXAccount='logearn_cn',selectedSort='recent',manualOpen=false
 function setXNotice(message){xNotice=message;const node=host()?.querySelector('[data-x-notice]');if(node)node.textContent=message}

 async function draw(){ctx.clear();const stamp=++generation;const finishLoading=beginPageLoad(host(),{placeholder:'<div class="a-card a-details" role="status">正在读取内容渠道…</div>',selector:'.x-content-post-list',message:'正在同步内容数据，旧帖子表现暂时保留…'});try{const data=await request();if(stamp!==generation)return;render(data)}catch(e){if(stamp!==generation)return;host().innerHTML=viewState({kind:'error',title:'内容渠道暂不可用',description:e.message,actionLabel:'重新读取',actionAttr:'data-view-retry'});host().querySelector('[data-view-retry]').onclick=draw}finally{finishLoading()}}
 function render(data){const esc=ctx.esc;host().innerHTML=`${renderXPanel(data.x_monitor,esc,selectedXAccount,selectedSort)}<details data-manual ${manualOpen?'open':''} class="a-card a-details" style="margin-top:14px"><summary style="cursor:pointer;font-weight:600;padding:8px 0">博客 / YouTube 与历史手工记录 · ${data.items.length} 条（展开管理）</summary><p class="a-muted">X 官方内容已自动采集，不需要重复手工登记。其他渠道手工记录可在这里维护。</p><section class="a-card a-details"><h2>人工内容评价（可选）</h2><p>按发布时间所在周统计，满分 6 分；仅统计三项均已评价的内容，评价范围变化会影响比较。未填发布日期的内容不计入。</p>${data.review_trend.length?`<table class="a-table"><thead><tr><th>周起始</th><th>已评价 / 发布数</th><th>平均分</th></tr></thead><tbody>${data.review_trend.slice(0,12).map(w=>`<tr><td>${esc(w.week)}</td><td>${w.reviewed} / ${w.total}</td><td>${w.average==null?'未知':w.average+' / 6'}</td></tr>`).join('')}</tbody></table>`:'<p>暂无有发布日期的内容。</p>'}</section><section class="a-card a-details"><h2>登记内容</h2><form data-form style="display:flex;gap:12px;flex-wrap:wrap;align-items:end"><label>渠道<select name="platform">${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>标题<input name="title" required maxlength="200"></label><label>内容链接<input name="url" type="url" required></label><label>发布时间<input name="published_at" type="date"></label><label>主题<input name="topic" maxlength="100"></label><label>曝光 / 浏览（可留空）<input name="impressions" type="number" min="0" step="1"></label><label>点赞<input name="likes" type="number" min="0" step="1"></label><label>评论 / 回复<input name="comments" type="number" min="0" step="1"></label><label>分享 / 转发<input name="shares" type="number" min="0" step="1"></label><fieldset style="flex-basis:100%"><legend>人工内容价值评价（可稍后填写）</legend><p>按内容本身评价，和曝光、互动分开。0 不足 · 1 部分具备 · 2 明确具备；三项齐全才显示总分。</p><div style="display:flex;gap:12px;flex-wrap:wrap">${[['audience_fit','目标用户与问题：是否贴合链上研究或交易者的真实任务'],['actionability','可操作性：是否提供明确步骤、方法或示例'],['evidence','证据与边界：是否提供事实、案例或说明适用范围']].map(([key,label])=>`<label>${label}<select name="${key}"><option value="">未评价</option><option value="0">0 · 不足</option><option value="1">1 · 部分具备</option><option value="2">2 · 明确具备</option></select></label>`).join('')}<label>评价依据 / 改进建议<input name="review_note" maxlength="1000" placeholder="写明依据和下一篇如何改进"></label></div></fieldset><button class="a-button a-primary">保存</button><button type="button" data-cancel hidden>取消编辑</button></form><p data-message role="status"></p></section><section class="a-card a-details"><h2>内容记录</h2><p>人工评价反映内容本身，不能证明用户满意或获客效果；可结合互动和后续产品数据复盘。</p><p>追踪链接用于后续识别内容来源；产品端采集和归因尚未接入。</p><div style="overflow:auto"><table class="a-table"><thead><tr><th>渠道</th><th>内容</th><th>主题</th><th>发布时间</th><th>曝光 / 浏览</th><th>互动（赞 / 评论 / 分享）</th><th>人工内容评价</th><th>追踪链接</th><th>操作</th></tr></thead><tbody>${data.items.map(i=>`<tr><td>${esc(labels[i.platform])}</td><td><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a></td><td>${esc(i.topic||'—')}</td><td>${esc(i.published_at||'未知')}</td><td>${i.impressions==null?'未知':Number(i.impressions).toLocaleString()}</td><td>${[i.likes,i.comments,i.shares].map(v=>v==null?'未知':Number(v).toLocaleString()).join(' / ')}</td><td>${i.value_review.score==null?'待评价':esc(i.value_review.level)+' · '+i.value_review.score+'/6'}<br><small>${esc(i.review_note||'')}</small></td><td><input aria-label="追踪链接" readonly value="${esc(i.tracking_url)}" onclick="this.select()"></td><td><button type="button" data-edit="${esc(i.id)}">编辑</button></td></tr>`).join('')||'<tr><td colspan="9">暂无内容记录</td></tr>'}</tbody></table></div></section></details>`;const manual=host().querySelector('[data-manual]');if(manual)manual.ontoggle=()=>{manualOpen=manual.open};
 host().querySelectorAll('[data-x-tab]').forEach(button=>button.onclick=()=>{
  selectedXAccount=button.dataset.xTab;xNotice='';render(data);
  [...host().querySelectorAll('[data-x-tab]')].find(item=>item.dataset.xTab===selectedXAccount)?.focus?.({preventScroll:true});
 });
 const xSort=host().querySelector('[data-x-sort]');if(xSort)xSort.onchange=e=>{
  selectedSort=e.target.value;render(data);
  host().querySelector('[data-x-sort]')?.focus?.({preventScroll:true});
 };
 const xAuto=host().querySelector('[data-x-auto]');if(xAuto)xAuto.onchange=async e=>{
   if(xBusy)return;
   xBusy=true;xAuto.disabled=true;
   try{await request('/x/settings','PUT',{account:selectedXAccount,auto_sync:e.target.checked});xNotice='每日同步设置已保存';await draw()}
   catch(error){setXNotice('设置失败：'+error.message);xAuto.checked=!xAuto.checked}
   finally{xBusy=false;if(xAuto.isConnected)xAuto.disabled=false}
 };
 const xSync=host().querySelector('[data-x-sync]');if(xSync)xSync.onclick=async()=>{
   if(xBusy)return;
   xBusy=true;xSync.disabled=true;setXNotice('正在读取 @'+selectedXAccount+' 的公开数据…');
   try{await request('/x/sync','POST',{account:selectedXAccount});xNotice='采集成功';await draw()}
   catch(error){setXNotice('采集失败：'+error.message)}
   finally{xBusy=false;if(xSync.isConnected)xSync.disabled=false}
 };
 const xNoticeNode=host().querySelector('[data-x-notice]');if(xNoticeNode)xNoticeNode.textContent=xNotice;
 const form=host().querySelector('[data-form]'),cancel=host().querySelector('[data-cancel]');let editing=null;host().querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{const item=data.items.find(i=>i.id===button.dataset.edit);editing=item.id;for(const key of ['platform','title','url','published_at','topic','impressions','likes','comments','shares','audience_fit','actionability','evidence','review_note'])form.elements[key].value=item[key]??'';form.elements.platform.disabled=true;cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'center'})});cancel.onclick=()=>{editing=null;form.reset();form.elements.platform.disabled=false;cancel.hidden=true};form.onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),msg=host().querySelector('[data-message]');button.disabled=true;try{const body=Object.fromEntries(new FormData(form));body.platform=form.elements.platform.value;await request(editing?'/items/'+encodeURIComponent(editing):'/items',editing?'PUT':'POST',body);await draw()}catch(err){msg.textContent=err.message;button.disabled=false}}}
 return {draw,dispose(){generation++}}
}
