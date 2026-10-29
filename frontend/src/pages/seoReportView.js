// Presentation-only helpers. The saved GSC snapshot and its reporting totals stay unchanged.
const number=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:0});
const pct=v=>v==null||!Number.isFinite(Number(v))?'—':(Number(v)*100).toFixed(2)+'%';
const rank=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(1);

export function safeSeoUrl(value){
 try{
  const url=new URL(String(value));
  if(!['https:','http:'].includes(url.protocol))return {label:'无效 URL',kind:'invalid',hasParams:false,sensitive:false};
  const keys=[...new Set([...url.searchParams.keys()])];
  const sensitive=keys.some(key=>/token|secret|auth|password|credential|api.?key|session|jwt/i.test(key));
  const params=keys.length?'?'+keys.map(key=>key+'=[已隐藏]').join('&'):'';
  const dev=url.hostname.startsWith('dev.')||url.hostname.startsWith('staging.');
  return {label:url.hostname+(url.pathname==='/'?'/':url.pathname)+params,host:url.hostname,
   path:url.pathname,kind:dev?'development':'production',hasParams:keys.length>0,sensitive};
 }catch{return {label:'无效 URL',kind:'invalid',hasParams:false,sensitive:false}}
}
export function queryGroup(value){
 const query=String(value||'').trim().toLowerCase();
 if(/(^|[^a-z])logearn([^a-z]|$)/.test(query))return 'brand';
 if(/^[a-z0-9 _-]+$/.test(query)&&query.length>1)return 'candidate';
 return 'review';
}
const labels={brand:'品牌词',candidate:'非品牌候选',review:'待归类'};
function svgTrend(daily,h){
 if(!daily.length)return '<p class="seo-muted">暂无逐日数据，不能当作零流量。</p>';
 const days=[...daily].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const width=920,top=20,bottom=133,left=38,right=896;
 const x=i=>left+(days.length===1?0:i*(right-left)/(days.length-1));
 const plot=(key,title,color)=>{
  const max=Math.max(1,...days.map(d=>Math.max(0,Number(d[key])||0)));
  const y=n=>bottom-(Math.max(0,Number(n)||0)/max)*(bottom-top);
  const path=days.map((d,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(d[key]).toFixed(1)).join(' ');
  const circles=days.map((d,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(d[key]).toFixed(1)+'" r="3.5" fill="'+color+'"><title>'+
   h(d.date)+' · '+title+' '+h(number(d[key]))+'</title></circle>').join('');
  return '<div class="seo-trend-panel"><div class="seo-trend-heading"><strong>'+title+'趋势</strong>'+
   '<span>独立刻度 · 最高日 '+number(max)+'</span></div>'+
   '<svg class="seo-trend" viewBox="0 0 '+width+' 156" role="img" aria-label="'+title+'逐日趋势，完整数据见逐日明细表">'+
   '<line x1="'+left+'" y1="'+bottom+'" x2="'+right+'" y2="'+bottom+'" class="seo-axis"/>'+
   '<text x="'+left+'" y="13" class="seo-chart-label">'+number(max)+'</text>'+
   '<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.6" stroke-linejoin="round"/>'+circles+
   '<text x="'+left+'" y="152" class="seo-chart-label">'+h(days[0].date)+'</text>'+
   '<text x="'+right+'" y="152" text-anchor="end" class="seo-chart-label">'+h(days[days.length-1].date)+'</text></svg></div>';
 };
 return '<div class="seo-trend-grid">'+plot('clicks','点击','#3b82f6')+plot('impressions','曝光','#77859f')+'</div>';
}
function weekComparison(daily){
 const ordered=[...daily].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 if(ordered.length<14)return '不足 14 个日期，暂不比较周趋势';
 const last=ordered.slice(-14),consecutive=last.every((d,i)=>i===0||Date.parse(d.date)-Date.parse(last[i-1].date)===86400000);
 if(!consecutive)return '日期覆盖不连续，暂不比较周趋势';
 const total=rows=>rows.reduce((sum,d)=>sum+(Number(d.clicks)||0),0);
 const prior=total(last.slice(0,7)),current=total(last.slice(7));
 return '最近 7 天点击 '+number(current)+' · 上一个 7 天 '+number(prior)+'（仅描述，不推断原因）';
}
function tableDaily(rows,h){
 return '<details class="seo-raw-data"><summary>查看完整逐日明细（'+rows.length+' 行）</summary><div class="ai-gsc-table"><table><thead><tr><th>日期</th><th>点击</th><th>曝光</th><th>CTR</th><th>排名</th></tr></thead><tbody>'+
 rows.map(d=>'<tr><td>'+h(d.date)+'</td><td>'+number(d.clicks)+'</td><td>'+number(d.impressions)+'</td><td>'+pct(d.ctr)+'</td><td>'+rank(d.position)+'</td></tr>').join('')+
 '</tbody></table></div></details>';
}
function problemList(pages,h){
 const flags=pages.map(p=>safeSeoUrl(p.page));
 const token=flags.filter(p=>p.sensitive).length,dev=flags.filter(p=>p.kind==='development').length,params=flags.filter(p=>p.hasParams&&!p.sensitive).length;
 const observations=[];
 if(token)observations.push('<li><strong class="seo-urgent">敏感参数 URL · '+token+' 条</strong><span>搜索页面数据出现凭据类参数。页面已隐藏其值，需要检查生成与抓取来源。</span></li>');
 if(dev)observations.push('<li><strong>开发环境页面 · '+dev+' 条</strong><span>存在 dev/staging 搜索曝光记录，需检查该站点是否应允许收录。</span></li>');
 if(params)observations.push('<li><strong>带普通参数的 URL · '+params+' 条</strong><span>检查规范 URL 和可索引页面策略，不能仅据此断言重复收录。</span></li>');
 if(!observations.length)return '<p class="seo-muted">返回的页面行中未发现上述类型；这不等于整站无技术问题。</p>';
 return '<ul class="seo-issues">'+observations.join('')+'</ul><p class="seo-muted">仅检测已返回的前 '+pages.length+' 条页面行，非整站爬虫审计。</p>';
}
function pageName(safe){
 if(safe.path==='/')return '首页';
 const path=safe.path.replace(/^\/(cn|en)(\/|$)/,'/').replace(/\/$/,'');
 const names={'/agents':'AI Agents','/smart_money':'Smart Money','/trenches':'Trenches','/monitors':'Monitors','/portfolio':'Portfolio','/rewards':'Rewards','/trending':'Trending'};
 const title=names[path]||safe.path;
 return title+(safe.kind==='development'?' · 开发环境':'');
}

export function renderSeoReport(report,h){
 const r=report,metrics=r.metrics||{},coverage=r.coverage||{},daily=r.daily||[],queries=(r.queries||[]).slice(0,30),pages=(r.pages||[]).slice(0,20);
 const brandClicks=queries.filter(q=>queryGroup(q.query)==='brand').reduce((sum,q)=>sum+(Number(q.clicks)||0),0);
 const siteClicks=Number(metrics.clicks);
 const brandShare=siteClicks>0?number(brandClicks)+' / '+number(siteClicks)+'（已显示品牌词点击 / 站点总点击）':'暂无可用点击基数';
 return '<div class="seo-report-meta"><span>资源：'+h(r.siteUrl)+'</span><span>数据期：'+h(r.startDate)+' — '+h(r.endDate)+'</span><span>上次同步：'+h(r.syncedAt?new Date(r.syncedAt).toLocaleString('zh-CN'):'—')+'</span></div>'+
 '<div class="seo-kpi-grid">'+
 [['搜索点击',number(metrics.clicks)],['搜索曝光',number(metrics.impressions)],['点击率',pct(metrics.ctr)],['平均排名',rank(metrics.position)]].map(item=>
  '<div class="seo-kpi"><span>'+item[0]+'</span><strong>'+item[1]+'</strong></div>').join('')+'</div>'+
 '<p class="seo-muted">完整日期 '+h(coverage.reportedDays??'—')+' / '+h(coverage.expectedDays??'—')+
 ' · 返回查询 '+h(coverage.queryRowsReturned??queries.length)+' 行 · 页面 '+h(coverage.pageRowsReturned??pages.length)+' 行。查询行经过 Google 匿名化/截断，不能与站点总量直接相加。</p>'+
 '<section class="seo-panel"><header><div><h3>搜索趋势</h3><p>'+weekComparison(daily)+'</p></div></header>'+
 svgTrend(daily,h)+tableDaily(daily,h)+'</section>'+
 '<section class="seo-panel"><header><div><h3>关键词表现</h3><p>已显示品牌词点击：'+h(brandShare)+'。非品牌分类仅供筛选，需人工复核。</p></div></header>'+
 '<div class="seo-segments" role="group" aria-label="关键词类型筛选">'+
 '<button type="button" data-seo-filter="all" aria-pressed="true">全部</button>'+
 '<button type="button" data-seo-filter="brand" aria-pressed="false">品牌词</button>'+
 '<button type="button" data-seo-filter="candidate" aria-pressed="false">非品牌候选</button>'+
 '<button type="button" data-seo-filter="review" aria-pressed="false">待归类</button></div>'+
 '<div class="ai-gsc-table"><table class="seo-keyword-table"><thead><tr><th>查询词</th><th>类别</th><th>点击</th><th>曝光</th><th>CTR</th><th>排名</th></tr></thead><tbody>'+
 (queries.length?queries.map(q=>'<tr data-seo-kind="'+queryGroup(q.query)+'"><td>'+h(q.query)+'</td><td><span class="seo-kind">'+labels[queryGroup(q.query)]+'</span></td><td>'+number(q.clicks)+'</td><td>'+number(q.impressions)+'</td><td>'+pct(q.ctr)+'</td><td>'+rank(q.position)+'</td></tr>').join(''):'<tr><td colspan="6">Google 未返回可显示的搜索查询行。</td></tr>')+
 '</tbody></table></div><p class="seo-muted">当前候选阈值发现 '+(r.opportunities||[]).length+' 个线索；样本量不足时，不能据此认为没有优化空间。</p></section>'+
 '<section class="seo-panel" aria-label="值得核查的 SEO 机会"><header><div><h3>值得核查的搜索机会</h3><p>以下仅是已同步样本中的候选线索，需要结合覆盖、排名及页面目标人工确认，不代表已带来转化。</p></div></header>'+
 ((r.opportunities||[]).length?'<ol class="seo-opportunities">'+(r.opportunities||[]).slice(0,8).map(o=>'<li><strong>'+h(o.query||o.page||o.title||o.kind||o.type||'未命名机会')+'</strong>'+
 '<span>'+h(o.reason||o.description||o.label||'需核对搜索意图、查询和落地页数据')+'</span>'+
 '<small>曝光 '+number(o.impressions)+' · 点击 '+number(o.clicks)+' · 排名 '+rank(o.position)+'</small></li>').join('')+'</ol>':
 '<p class="seo-muted">当前没有符合候选规则的线索。可检查关键词表、数据覆盖与网站页面，不代表没有 SEO 机会。</p>')+'</section>'+
 '<section class="seo-panel"><header><div><h3>落地页表现与技术提示</h3><p>名称优先，完整路径和查询参数键作为次要信息展示；参数值始终遮蔽。</p></div></header>'+
 problemList(r.pages||[],h)+
 '<div class="ai-gsc-table"><table class="seo-pages-table"><thead><tr><th>页面</th><th>点击</th><th>曝光</th><th>CTR</th></tr></thead><tbody>'+
 (pages.length?pages.map(p=>{const safe=safeSeoUrl(p.page);return '<tr><td><strong>'+h(pageName(safe))+'</strong><small>'+h(safe.label)+'</small></td><td>'+number(p.clicks)+'</td><td>'+number(p.impressions)+'</td><td>'+pct(p.ctr)+'</td></tr>'}).join(''):'<tr><td colspan="4">Google 未返回可显示的页面行。</td></tr>')+
 '</tbody></table></div></section>'+
 '<details class="seo-raw-data"><summary>数据口径与限制</summary><ul>'+(r.warnings||[]).map(w=>'<li>'+h(w)+'</li>').join('')+'</ul></details>';
}

export function applySeoQueryFilter(host){
 const buttons=[...host.querySelectorAll('[data-seo-filter]')];
 buttons.forEach(button=>button.addEventListener('click',()=>{
  const kind=button.dataset.seoFilter;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  host.querySelectorAll('[data-seo-kind]').forEach(row=>{row.hidden=kind!=='all'&&row.dataset.seoKind!==kind});
 }));
}
