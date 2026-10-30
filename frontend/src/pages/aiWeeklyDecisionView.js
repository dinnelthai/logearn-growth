import {renderWeeklyCoverage,weeklyCoverageSummary} from './aiWeeklyCoverageView.js';
// Decision-first weekly report view. Read-only; all numbers come from the
// saved business snapshot or an already-validated weekly report.
const knownMetrics=[
 ['new_users','首次分析用户','人'],
 ['active_users','分析活跃用户','人'],
 ['returning_users','回访分析用户','人']
];
const numeric=value=>typeof value==='number'&&Number.isFinite(value);
function persistedContext(data){
 const raw=data?.context_payload||data?.data_snapshot;
 if(!raw)return null;
 if(typeof raw==='object')return raw;
 try{return JSON.parse(raw)}catch{return null}
}
function trustedMetrics(data){
 const ctx=persistedContext(data),current=ctx?.current?.totals,previous=ctx?.previous?.totals;
 if(!current||!previous)return [];
 const ev=Array.isArray(ctx.evidence)?ctx.evidence:[];
 const period=ctx.period||{};
 return knownMetrics.map(([id,label,unit])=>{
  const now=current[id],before=previous[id];
  if(!numeric(now)&&!numeric(before))return null;
  const ids=ev.filter(x=>x?.metricId===id&&numeric(x.value)&&(
   (numeric(now)&&x.value===now&&x.period?.start===period.start&&x.period?.end===period.end)||
   (numeric(before)&&x.value===before&&x.period?.start===period.previousStart&&x.period?.end===period.previousEnd)
  )).map(x=>x.id).filter(Boolean).slice(0,4);
  return {metricId:id,label,unit,current:numeric(now)?now:null,
   previous:numeric(before)?before:null,
   changePct:numeric(now)&&numeric(before)&&before!==0?
    (now-before)/before*100:null,evidenceIds:ids,source:'trusted-snapshot'};
 }).filter(Boolean);
}
const riskPriority=id=>id==='new_users'?'P0':'P1';
export function renderWeeklyDecisionReport({data,record,safe,fmt,date,links,canCreateProblem=false}){
 const result=data?.result||{},w=result.weeklyReport;
 if(!w)return '<p role="alert">未形成通过证据校验的周报正文，不能视作生成成功。</p>';
 const coverage=weeklyCoverageSummary(data);
 const snapshotKpis=trustedMetrics(data);
 const generatedKpis=Array.isArray(w.metrics)?w.metrics:[];
 const metrics=[...snapshotKpis,
  ...generatedKpis.filter(x=>!snapshotKpis.some(y=>y.label===x.label||y.metricId===x.metricId))].slice(0,7);
 const trend=value=>value==null?'缺少可比数据':
  (value>0?'+':'')+fmt(value)+'%';
 const indicator=row=>row.changePct==null?'unknown':row.changePct<0?'down':row.changePct>0?'up':'flat';
 const evidence=ids=>(Array.isArray(ids)&&ids.length?
  '<details class="ai-weekly-ref ai-weekly-evidence-toggle"><summary>查看证据（'+ids.length+'）</summary><div>'+links(ids.slice(0,2))+
   (ids.length>2?'<span>另有 '+(ids.length-2)+' 条证据</span>':'')+'</div></details>':
  '<span class="ai-weekly-caveat">无可点开的证据编号 · 请核查归档</span>');
 const kpi=metric=>'<div class="ai-weekly-kpi" data-trend="'+indicator(metric)+'">'+
  '<div class="ai-weekly-kpi-top"><span class="ai-weekly-kpi-label">'+safe(metric.label)+'</span>'+
  '<span class="ai-weekly-kpi-context">业务指标</span></div>'+
  '<div class="ai-weekly-kpi-value">'+(numeric(metric.current)?fmt(metric.current):'—')+
   '<span>'+safe(metric.unit||'')+'</span></div>'+
  '<div class="ai-weekly-kpi-foot"><strong>'+(numeric(metric.changePct)?
    (metric.changePct<0?'↓ ':metric.changePct>0?'↑ ':''):'')+
    safe(numeric(metric.changePct)&&metric.changePct!==0?
     fmt(Math.abs(metric.changePct))+'%':trend(metric.changePct))+'</strong>'+
   '<span>较上周 · '+(numeric(metric.previous)?fmt(metric.previous):'未知')+'</span></div>'+
  '</div>';
 const risks=snapshotKpis.filter(x=>numeric(x.changePct)&&x.changePct<=-10)
  .sort((a,b)=>a.changePct-b.changePct).slice(0,3)
  .map(x=>({priority:riskPriority(x.metricId),title:x.label+'下降 '+fmt(Math.abs(x.changePct))+'%',
   changePct:x.changePct,
   detail:'本周 '+fmt(x.current)+'，上周 '+fmt(x.previous)+
    '。这是已观测变化，不代表原因已确认；先核查来源、指标定义和转化路径。',
   evidenceIds:x.evidenceIds}));
 const modelRisks=(Array.isArray(w.issues)?w.issues:[]).slice(0,3)
  .map(x=>({priority:'待验证',title:x.text,changePct:null,
   detail:'AI 假设；不能当成已证实原因。',
   evidenceIds:x.evidenceIds||[]}));
 const allRisks=[...risks,...modelRisks].slice(0,4);
 const seoMeta=result.weeklySources?.seo||persistedContext(data)?.weeklySources?.seo;
 const seoEvidence=(persistedContext(data)?.evidence||[]).find(e=>e.metricId==='seo_search');
 const seoNumbers=seoEvidence?.value?.metrics||seoEvidence?.value?.totals||seoEvidence?.value||{};
 const matched=seoMeta?.periodMatched===true;
 const seoStatus=!seoMeta?'本次历史周报未采集 SEO 数据':
  seoMeta.status==='not-synced'?'Search Console 尚未同步匹配的数据':
  seoMeta.status==='unavailable'?'Search Console 本期数据不可用':
  matched?'已获取匹配期间的 GSC 证据':
  '已获取 GSC 参考快照，但日期与业务周不完全匹配';
 const seoValues=seoMeta&&['period-matched','reference-only'].includes(seoMeta.status)?
  [['搜索点击',seoNumbers.clicks],['搜索曝光',seoNumbers.impressions],
   ['CTR',numeric(seoNumbers.ctr)?(seoNumbers.ctr*100).toFixed(2)+'%':null],
   ['平均排名',seoNumbers.position]].filter(([,v])=>numeric(v)||typeof v==='string'):[];
 const observations=Array.isArray(w.channelFindings)?w.channelFindings:[];
 const actions=Array.isArray(w.nextWeek)?w.nextWeek.slice(0,5):[];
 const gaps=Array.isArray(w.dataGaps)?w.dataGaps:[];
 const operations=result.weeklyOperations||persistedContext(data)?.weeklyOperations||null;
 const calls=Array.isArray(result.calls)?result.calls:[];
 const callsTable=calls.length?
  '<div class="ai-weekly-table"><table><thead><tr><th>轮次</th><th>总 Token</th><th>输入实测/预估</th><th>上下文</th></tr></thead><tbody>'+
  calls.map((c,i)=>'<tr><td>'+(i+1)+'</td><td>'+fmt(c.tokens)+'</td><td>'+
   fmt(c.reportedInputTokens)+' / '+fmt(c.estimatedInputTokens)+'</td><td>'+
   safe(c.modelTransportVersion||'旧版本')+'</td></tr>').join('')+'</tbody></table></div>':
  '<p>没有逐轮模型费用记录。</p>';
 const list=(items,render)=>items.length?'<div class="ai-weekly-stack">'+items.map(render).join('')+'</div>':
  '<p class="ai-weekly-empty">本期没有可验证的记录；不代表业务表现正常。</p>';
 return '<article class="ai-weekly-report ai-weekly-decision">'+
  '<header class="ai-weekly-report-head"><div><span class="ai-eyebrow">GROWTH OPERATIONS / WEEKLY</span>'+
  '<h3>运营决策周报</h3><p>'+safe(date(record.date_range_start))+' — '+
  safe(date(Number(record.date_range_end)-86400000))+' · Asia/Bangkok · 已保存分析</p></div>'+
  '<span class="ai-weekly-quality" data-quality="'+(w.partial?'partial':'validated')+'">'+
   (w.partial?'部分校验 · 业务结论待核实':'结构校验通过 · 业务结论待核实')+'</span></header>'+
  '<section class="ai-weekly-coverage-alert" data-complete="'+(coverage.analyzed===coverage.total?'true':'false')+'" role="status">'+
   '<div><strong>业务分析覆盖：'+coverage.analyzed+' / '+coverage.total+' 个模块有数值结论</strong>'+
   '<p>已取数待分析 '+coverage.collected+' 项；数据不足、未连接或未调查 '+coverage.missing+
   ' 项。生成成功不等于所有业务模块已完成分析。</p></div>'+
   '<button class="a-button" type="button" data-weekly-section="weekly-coverage">查看模块覆盖</button></section>'+
  '<nav class="ai-weekly-jump" aria-label="周报快速定位">'+
   '<button type="button" data-weekly-section="weekly-priorities">核心问题</button>'+
   '<button type="button" data-weekly-section="weekly-metrics">关键指标</button>'+
   '<button type="button" data-weekly-section="weekly-actions">下周行动</button></nav>'+
  (w.partial?'<p class="ai-weekly-partial" role="status">这是部分周报：AI 的结构化结果未全部通过校验。可信的业务数字从本次归档快照补充，缺失的 SEO 与归因不会虚构。</p>':'')+
  '<div class="ai-weekly-focus"><div class="ai-weekly-focus-label"><span>本周经营判断</span>'+
   '<span>EXECUTIVE BRIEF</span></div><p>'+safe(w.executiveSummary||'没有经过验证的摘要')+'</p></div>'+
  '<section class="ai-weekly-section ai-weekly-panel ai-weekly-priority-panel" id="weekly-priorities">'+
  '<div class="ai-weekly-section-heading"><div><span class="ai-weekly-section-index">01 / PRIORITIES</span>'+
   '<h4>最需要处理的问题</h4></div><span>先明确变化，再验证原因</span></div>'+
  list(allRisks,(x,i)=>'<div class="ai-weekly-problem" data-priority="'+
   (x.priority==='P0'?'p0':x.priority==='P1'?'p1':'hypothesis')+'">'+
   '<span class="ai-weekly-rank">'+String(i+1).padStart(2,'0')+'</span>'+
   '<div class="ai-weekly-problem-content">'+
   '<div class="ai-weekly-problem-title"><strong>'+safe(x.title)+'</strong>'+
   '<span class="ai-weekly-priority-chip">'+safe(x.priority)+'</span></div>'+
   '<p>'+safe(x.detail)+'</p>'+evidence(x.evidenceIds)+
   (canCreateProblem?'<button type="button" class="a-button ai-weekly-create-problem" data-weekly-create-problem>加入问题池</button>':'')+'</div>'+
   (numeric(x.changePct)?'<div class="ai-weekly-problem-change" aria-label="相较上周下降">'+
    '<strong>↓ '+fmt(Math.abs(x.changePct))+'%</strong><span>较上周</span></div>':'')+
   '</div>')+'</section>'+
  '<p role="status" class="ai-weekly-action-note" data-weekly-action-note></p>'+
  '<section class="ai-weekly-section ai-weekly-kpi-section" id="weekly-metrics"><div class="ai-weekly-section-heading">'+
   '<div><span class="ai-weekly-section-index">02 / METRICS</span><h4>关键指标 · 环比</h4></div>'+
  '<span>同口径业务快照；历史覆盖限制详见底部</span></div>'+
  (metrics.length?'<div class="ai-weekly-kpis">'+metrics.map(kpi).join('')+'</div>':
   '<p class="ai-weekly-empty">暂无可信的本周/上周指标对照，不能替代为估算值。</p>')+'</section>'+
  renderWeeklyCoverage(data,{safe,fmt,links})+
  '<section class="ai-weekly-section ai-weekly-channel-section"><div class="ai-weekly-section-heading">'+
   '<div><span class="ai-weekly-section-index">04 / ACQUISITION</span><h4>渠道、SEO 与获客</h4></div>'+
  '<span>来源和时间窗分开判断</span></div>'+
  '<div class="ai-weekly-source-grid">'+
  '<div class="ai-weekly-source-card ai-weekly-source-seo" data-available="'+
   (seoMeta?.status==='period-matched'?'observed':'unknown')+
   '"><div class="ai-weekly-source-label"><strong>Google Search Console / SEO</strong>'+
  '<button type="button" class="a-button" data-weekly-navigate="seo">打开 SEO 分析</button></div>'+
  '<p class="ai-weekly-source-state"><span class="ai-weekly-state-dot" aria-hidden="true"></span>'+
   safe(seoStatus)+'</p>'+
  (seoValues.length?'<div class="ai-weekly-source-kpis">'+seoValues.map(([k,v])=>
    '<div><span>'+safe(k)+'</span><strong>'+safe(typeof v==='number'?fmt(v):v)+'</strong></div>').join('')+'</div>':'')+
  (seoMeta?.evidenceIds?.length?evidence(seoMeta.evidenceIds):'')+
  '<small>'+(matched?'GSC 与请求日期标签匹配；仍不能直接归因至注册、交易。':
   'GSC 使用 PT 日期，业务周使用曼谷日期；缺少完全匹配快照时不得计算该周 SEO 增长。')+
  '</small>'+
  (!seoMeta||['not-synced','unavailable'].includes(seoMeta.status)?'<div data-weekly-gsc-live class="ai-weekly-gsc-live" role="status">正在查看是否有已同步的 GSC 数据（只读，不调用模型）…</div>':'')+
  '</div>'+
  '<div class="ai-weekly-source-card"><div class="ai-weekly-source-label"><strong>渠道与获客</strong></div>'+
  list(observations.slice(0,4),x=>'<div class="ai-weekly-observation"><p>'+safe(x.text)+'</p>'+evidence(x.evidenceIds)+'</div>')+
  '</div></div></section>'+
  '<section class="ai-weekly-section ai-weekly-panel ai-weekly-actions-panel" id="weekly-actions">'+
   '<div class="ai-weekly-section-heading"><div><span class="ai-weekly-section-index">05 / NEXT STEPS</span>'+
   '<h4>下周行动清单</h4></div><span>优先级、动作与验证标准</span></div>'+
  list(actions,(a,i)=>'<div class="ai-weekly-action" data-priority="'+
   (a.priority==='P0'?'p0':a.priority==='P1'?'p1':'normal')+'">'+
   '<span class="ai-weekly-action-priority">'+safe(a.priority||'待定')+'</span>'+
   '<div><strong>'+safe(a.action)+'</strong>'+
   '<p>验证：'+safe(a.metric||'待定义')+'</p>'+
   '<p>复查：'+safe(a.reviewCondition||'待定义')+'</p>'+
   evidence(a.evidenceIds)+'</div></div>')+'</section>'+
  '<details class="ai-weekly-details"><summary>其他事实与数据完整性'+
   ' · '+gaps.length+' 项待核对</summary>'+
   '<div class="ai-weekly-details-body">'+
   '<h4>本周有证据支持的事实</h4>'+
   list(Array.isArray(w.highlights)?w.highlights:[],x=>'<p>'+safe(x.text)+evidence(x.evidenceIds)+'</p>')+
   '<h4>指标覆盖、归因与限制</h4>'+
   (gaps.length?'<ul>'+gaps.map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul>':
     '<p>暂无明确列出的限制；不意味着数据完整。</p>')+
   (operations?'<h4>运营执行记录</h4><p>已登记目标 '+fmt(operations.goalsCount)+
    '、未解决问题 '+fmt(operations.unresolvedCount)+'、已执行行动 '+fmt(operations.executedActionCount)+
    '、完成复盘 '+fmt(operations.reviewedActionCount)+
    '。这些仅为已保存工作台记录，不代表完整运营工作量。</p>':'')+
   '</div></details>'+
  '<details class="ai-weekly-details ai-weekly-technical"><summary>审计与原始证据 · 技术详情</summary>'+
   '<div class="ai-weekly-details-body"><p>可核对证据 ID 数量：'+
    fmt((result.evidenceIds||[]).length)+'；模型：'+safe(record.model_name||'未提供')+
    '；已登记费用：'+(record.cost_usd==null?'未知':'$'+fmt(Number(record.cost_usd)))+'</p>'+
   '<p>Token 分段估计并非中转站实际计费；完整调用日志和检查点保留在后端。</p>'+
   callsTable+'</div></details>'+
  '<div data-weekly-evidence-detail class="gws-detail" hidden role="status"></div></article>';
}
export function readOnlyGscMarkup(data,{safe,fmt,startDate,endDate}){
 const r=data?.available===true?data.report:null;
 if(!r||r.startDate!==startDate||r.endDate!==endDate)
  return '<p>此业务周没有已同步的同日期标签 GSC 快照。请先到 SEO 分析同步；未观测不能解释为零点击。</p>';
 const m=r.metrics||{},numbers=[
  ['搜索点击',m.clicks],['搜索曝光',m.impressions],
  ['CTR',numeric(m.ctr)?(m.ctr*100).toFixed(2)+'%':null],
  ['平均排名',m.position]
 ].filter(([,value])=>numeric(value)||typeof value==='string');
 return '<div class="ai-weekly-gsc-supplement">'+
  '<p>补充只读 GSC 快照 · '+safe(startDate)+' — '+safe(endDate)+
  '。这是另行读取的已保存 Search Console 数据，未参与这份历史 AI 周报的分析或归因。</p>'+
  (numbers.length?'<div class="ai-weekly-source-kpis">'+numbers.map(([label,value])=>
   '<div><span>'+safe(label)+'</span><strong>'+
   safe(typeof value==='number'?fmt(value):value)+'</strong></div>').join('')+'</div>':
   '<p>该快照没有可展示的指标；不能理解为零。</p>')+
  '<small>GSC 按 PT 日期标签汇总，业务按曼谷周统计，不能直接推导站内激活或交易。</small></div>';
}
export {trustedMetrics};
