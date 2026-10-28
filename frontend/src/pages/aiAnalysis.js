import './aiAnalysis.css';
import {loadingState} from './loadingState.js';
import {deriveAnalysisState,formatAnalysisTime,checkpointReason} from './aiTaskState.js';
import {createBusinessAnalysis,getAnalysisList,getAnalysisDetail,getJobStatus,updateSuggestionStatus,createRetrospective,getRetrospectives,getCostStats,retryAnalysis,getAgentHealth,getEvidence,getJobCheckpoint,cancelAnalysis,resumeAnalysis,getGrowthReviewQueue,getGrowthInbox,getGrowthAlerts,scanGrowthAlerts,changeGrowthAlert,getGrowthBudget,getGrowthInvestigations,decideGrowthInvestigation,getGrowthNotifications,markGrowthNotificationRead,getGrowthInvestigationTimeline,getSeoImports,importSeoSnapshot,previewSeoSnapshot,previewKolPerformance,getGscConnection,saveGscSite,syncGscPerformance,getGscPerformance,getGscSitemaps,inspectGscUrl,getAutonomyStatus,getAutonomyTargets,saveAutonomyTarget,getAutonomyBriefs,getAutonomyLearning,refreshAutonomyBrief} from '../api/aiAnalysis.js';
const DAY=86400000,OFFSET=7*3600000;
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);
const timestamp=d=>Date.parse(d+'T00:00:00+07:00');
export function createAIAnalysis(ctx){
  const {$,esc}=ctx;
  let generation=0,timer=null,selected=null,busy=false,polling=false;
  const defaults={start:day(Date.now()-7*DAY),end:day(Date.now()-DAY)};
  const gscDates={start:new Date(Date.now()-30*DAY).toISOString().slice(0,10),
    end:new Date(Date.now()-3*DAY).toISOString().slice(0,10)};
  const formatCount=v=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:0});
  const formatPercent=v=>v==null?'—':(100*Number(v)).toFixed(2)+'%';
  const formatPosition=v=>v==null?'—':Number(v).toFixed(1);
  const statusText={pending:'等待执行',processing:'分析中',completed:'已完成',failed:'失败',adopted:'已采纳',executed:'已执行',executing:'执行中',rejected:'已拒绝',invalid:'已失效'};
  const label=s=>statusText[s]||s;
  const json=v=>esc(JSON.stringify(v,null,2));
  function dispose(){generation++;clearTimeout(timer);timer=null;polling=false;}
  function message(text){const target=$('#as-output')?.querySelector('[data-ai-message]');if(target)target.textContent=text;}
  async function draw(){
    ctx.clear?.();
    const token=++generation;clearTimeout(timer);polling=false;
    const host=$('#as-output');host.innerHTML=loadingState('正在加载主动业务分析…');
    try{
      const [list,reviews,costs,reviewQueue,inbox,alertData,proposalData,noticeData,budgetData,seoData,gscConnection,gscSnapshot,agentStatus,agentTargets,agentBriefs,agentLearning]=await Promise.all([getAnalysisList(),getRetrospectives(),getCostStats(),getGrowthReviewQueue().catch(error=>({entries:[],readyCount:null,error:error.message})),getGrowthInbox().catch(error=>({tasks:[],counts:{total:0},warnings:[error.message]})),getGrowthAlerts().catch(error=>({alerts:[],error:error.message})),getGrowthInvestigations().catch(error=>({proposals:[],error:error.message})),getGrowthNotifications().catch(error=>({notifications:[],error:error.message})),getGrowthBudget().catch(error=>({limit:0,reservedCalls:0,remainingCalls:0,error:error.message})),getSeoImports().catch(error=>({imports:[],error:error.message})),getGscConnection().catch(error=>({configured:false,sites:[],error:error.message})),getGscPerformance().catch(error=>({available:false,error:error.message})),getAutonomyStatus().catch(error=>({schedulerConfigured:false,error:error.message})),getAutonomyTargets().catch(error=>({targets:[],supportedMetrics:[],error:error.message})),getAutonomyBriefs().catch(error=>({briefs:[],error:error.message})),getAutonomyLearning().catch(error=>({assessment:null,strategies:{},error:error.message}))]);
      if(token!==generation)return;
      // Read a single latest task and its checkpoint; don't infer task state from a list label.
      const latestId=list.records?.[0]?.id;
      const [latestDetail,latestCheckpoint]=latestId?await Promise.all([
        getAnalysisDetail(latestId).catch(()=>null),
        getJobCheckpoint(latestId).catch(()=>null)
      ]):[null,null];
      if(token!==generation)return;
      const latestState=latestId?deriveAnalysisState(latestDetail,latestCheckpoint):null;
      host.innerHTML=`<div class="si-page ai-analysis-page">
        <section class="a-card ai-quick-status" aria-labelledby="ai-overview-title">
          <div class="ai-quick-heading"><div><h1 id="ai-overview-title">AI Growth Agent · 运营概览</h1>
            <p>先查看当前任务与待处理事项，再决定是否创建新分析。自动调度与手动分析分别运行。</p></div>
            <button class="a-button a-primary" type="button" data-start-analysis>新建分析</button></div>
          <div class="ai-quick-grid">
            <div><strong>最新分析</strong><p>${latestId?esc(latestState.label):'暂无任务'}</p><small>${latestId?'ID '+esc(latestId):'尚未提交过分析'}</small></div>
            <div><strong>需处理事项</strong><p>${esc(inbox.error?'状态未知':inbox.counts?.total??'未知')}</p><small>查看下方真实运营待办</small></div>
            <div><strong>最近日报</strong><p>${agentBriefs.briefs?.[0]?esc(agentBriefs.briefs[0].day):'暂无数据'}</p><small>${agentBriefs.briefs?.[0]?esc(agentBriefs.briefs[0].status):'没有已保存日报'}</small></div>
            <div><strong>自动调度</strong><p>${agentStatus.error?'状态不可用':agentStatus.schedulerRunning?'运行中':agentStatus.schedulerConfigured?'未确认运行':'未启用'}</p><small>不影响允许的手动分析</small></div>
          </div>
          ${latestId?`<p role="${latestState.key==='blocked'||latestState.key==='failed'?'alert':'status'}"><strong>当前最新：</strong>${esc(latestDetail?.title||latestId)} · ${esc(latestState.label)} ${latestState.reason?'· '+esc(latestState.reason):''} ${latestState.stale?'· 状态可能未同步':''}
            <button class="a-button" data-analysis="${esc(latestId)}">查看该任务</button></p>
            <p class="a-muted">最近状态时间：${esc(formatAnalysisTime(latestState.lastUpdated))}</p>`:'<p>暂无分析任务。可手动创建分析；不必先启用自动调度。</p>'}
          <div class="ai-quick-next"><h2>需要你处理</h2>
            ${latestState?.key==='blocked'?`<p>${esc(latestState.reason)} <button class="a-button" data-analysis="${esc(latestId)}">查看阻塞详情</button></p>`:
              inbox.tasks?.length?`<p>${esc(inbox.tasks[0].title)} · ${esc(inbox.tasks[0].status)}。请在下方运营待办中核实。</p>`:
              '<p>当前没有已确认的待处理事项；数据不可用时不代表业务正常。</p>'}
          </div>
        </section>
        <section class="a-card ai-agent-autonomy">
          <h2>AI Growth Agent · 自主运营驾驶舱</h2>
          <p>每日指标评价 → AI 经营分析 → 行动建议 → 成熟复盘 → 下一轮调查策略。实际运营操作需人工批准。</p>
          <p role="status">定时调度配置：${agentStatus.schedulerConfigured?'已允许':'默认关闭'} ·
            自动付费日报：${agentStatus.paidDailyDispatchConfigured?'已由服务端显式配置':'关闭'} ·
            调度进程：${agentStatus.schedulerRunning?'正在运行':
              agentStatus.schedulerHealth?.status==='succeeded'&&!agentStatus.schedulerHealth?.stale?'上轮成功，等待下次调度':
              agentStatus.schedulerHealth?.status==='partial'?'上轮部分失败，请检查':
              agentStatus.schedulerHealth?.status==='failed'||agentStatus.schedulerHealth?.status==='stale-running'?'失败或心跳已过期':
              '没有最近的有效运行记录'}。网页刷新本身不调用模型。</p>
          ${agentStatus.schedulerHealth?.observed?`<p>调度上次开始：${esc(agentStatus.schedulerHealth.lastStartedAt?new Date(agentStatus.schedulerHealth.lastStartedAt).toLocaleString('zh-CN'):'未知')} ·
            上次结束：${esc(agentStatus.schedulerHealth.lastFinishedAt?new Date(agentStatus.schedulerHealth.lastFinishedAt).toLocaleString('zh-CN'):'未知')} ·
            执行次数：${esc(agentStatus.schedulerHealth.runCount)} ·
            上轮错误数：${esc(agentStatus.schedulerHealth.lastSummary?.errors??'未知')}</p>`:''}
          ${agentStatus.schedulerHealth?.lastError?'<p role="alert">调度异常：'+esc(agentStatus.schedulerHealth.lastError)+'</p>':''}
          ${agentStatus.error?'<p role="alert">Agent 状态不可用：'+esc(agentStatus.error)+'</p>':''}
          <button class="a-button" data-autonomy-refresh type="button">刷新既有日报与历史学习（零付费调用）</button>
          <h3>运营目标设置</h3>
          <p>目标必须由运营人员明确配置。分析人数不是注册人数；任何目标数据不成熟时不计算综合评分。</p>
          <form data-autonomy-target>
            <label>业务目标<select name="goal">
              <option value="activation">激活</option><option value="retention">留存</option>
              <option value="conversion">转化</option><option value="revenue">收入分析</option>
            </select></label>
            <label>指标<select name="metric">${(agentTargets.supportedMetrics||[]).map(m=>
              `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></label>
            <label>观察值目标<input name="target" type="number" min="0.000001" step="any" required placeholder="人数或比率（比率使用 0–1）"></label>
            <label>权重（1–10）<input name="weight" type="number" min="1" max="10" step="1" value="1" required></label>
            <button class="a-button" type="submit">保存目标</button>
          </form>
          ${agentTargets.error?'<p role="status">目标读取暂不可用：'+esc(agentTargets.error)+'</p>':''}
          ${(agentTargets.targets||[]).map(t=>`<p>
             ${esc(t.goal)} · ${esc(t.metric)} ≥ ${esc(t.target)} · 权重 ${esc(t.weight)}
             · v${esc(t.version)} ${t.active?'':'（未启用）'}</p>`).join('')||'<p>未配置运营目标，因此 Agent 不会给出虚假的经营评分。</p>'}
          <h3>最近自主运营日报</h3>
          ${agentBriefs.error?'<p role="status">日报列表暂不可用：'+esc(agentBriefs.error)+'</p>':''}
          ${(agentBriefs.briefs||[]).slice(0,5).map(b=>{
            const report=b.report||{},score=b.score||{},quality=b.quality||{};
            return `<article>
              <p><strong>${esc(b.day)}</strong> · ${esc(b.status==='ready'?'正式日报':b.status==='partial'?'证据不足日报':'尚未完成分析')} ·
                综合评分 ${esc(score.value??'未知')}</p>
              <p>已完成目标 ${esc(quality.completedGoals??0)} / ${esc(quality.requiredGoals??0)} ·
                策略版本 ${esc(b.strategy_version??'尚无')}</p>
              <p>${esc(report.overview||'无可确认的经营总结')}</p>
              ${(report.priorityActions||[]).slice(0,4).map(a=>`<p>建议复查：${esc(a.text||'未提供')} ·
                <button class="a-button" data-analysis="${esc(a.analysisId)}">原始证据与建议</button></p>`).join('')}
              ${(score.qualityWarnings||[]).slice(0,4).map(w=>`<p>质量限制：${esc(w)}</p>`).join('')}
            </article>`;
           }).join('')||'<p>暂无日报。启用后续调度或手动分析后，点击零付费刷新整理已有结果。</p>'}
          <h3>AI 自我评价与学习状态</h3>
          ${agentLearning.error?'<p role="status">学习状态读取暂不可用：'+esc(agentLearning.error)+'</p>':''}
          <p>已复盘建议：${esc(agentLearning.assessment?.reviewed??0)} ·
             观测符合：${esc(agentLearning.assessment?.observedSupported??0)} ·
             观测不符：${esc(agentLearning.assessment?.observedContradicted??0)} ·
             证据不足：${esc(agentLearning.assessment?.insufficient??0)}</p>
          <p>结构化预测：可比较 ${esc(agentLearning.assessment?.forecastComparable??0)} ·
             观察命中 ${esc(agentLearning.assessment?.forecastHits??0)} ·
             观察未命中 ${esc(agentLearning.assessment?.forecastMisses??0)} ·
             同周期观察命中率 ${agentLearning.assessment?.observedForecastHitRate==null?'证据不足':
                esc((agentLearning.assessment.observedForecastHitRate*100).toFixed(1)+'%')}。
             预测窗口或数据不匹配时不纳入统计；不是行动的因果效果。</p>
          <p>历史一致率 ${agentLearning.assessment?.observableAgreementRate==null?'证据不足':
            esc((agentLearning.assessment.observableAgreementRate*100).toFixed(1)+'%')}。
            这是已执行建议与成熟观察结果的符合情况，并非 AI 预测准确率或因果效果。</p>
          ${Object.entries(agentLearning.strategies||{}).filter(([,v])=>v).map(([goal,value])=>
            `<p>${esc(goal)} 策略 v${esc(value.version)} ·
              重点核查：${esc((value.policy?.focusMetrics||[]).join('、')||'保持原规则')}</p>`).join('')}
        </section>
        <section class="a-card"><h1>AI 业务增长助手</h1><p>主动发起分析，按业务证据排优先级；记录行动后主动复盘。所有分析与复盘均使用同一 DeRouter 模型。</p>
        <p>累计调用 ${esc(costs.total_calls)} 次 · Token ${esc(costs.total_tokens??0)} · 估算费用 $${esc(costs.total_cost??0)}（${esc(costs.unknown_cost_calls??0)} 次调用费率未配置，金额不代表免费）</p>
        <details class="ai-new-analysis" data-analysis-setup><summary>新建主动分析 · 配置任务（可能产生模型费用）</summary>
        <form data-ai-form><label>分析标题<input name="title" required maxlength="200" value="业务增长分析"></label>
        <label>开始日期<input name="start" type="date" required value="${defaults.start}"></label>
        <label>结束日期（含当日）<input name="end" type="date" required value="${defaults.end}"></label>
        <label>来源<input name="source" value="all" maxlength="200" placeholder="all 或业务来源值"></label>
        <label>业务目标<select name="goal"><option value="activation">提升激活</option><option value="retention">提升留存</option><option value="conversion">提升转化</option><option value="revenue">收入策略</option></select></label>
        <label>专项增长技能<select name="skillId"><option value="">通用增长分析</option><option value="seo-organic">SEO · Search Console（激活/转化）</option><option value="kol-impact">KOL · 合作归组（转化/收入）</option></select></label>
        <p>专项技能只允许全来源分析；SEO 不会把搜索点击假设成交易转化，KOL 不会把 CRM 归组等同于合作增量。</p>
        <label>分析方式<select name="modelMode"><option value="auto">自动调查（单模型）</option><option value="complex">深度调查（同一模型）</option></select></label>
        <label>业务背景与问题<textarea name="question" maxlength="5000" placeholder="当前目标、资源约束、近期活动、产品改动，以及你想解决的问题"></textarea></label>
        <button class="a-button" type="submit" ${busy?'disabled':''}>开始分析</button></form></details>
        <p>时间按 UTC+7，最多31天。当前支持来源范围；不会把活动或用户群当作已筛选。</p>
        <button class="a-button" type="button" data-health>检查运行状态</button><pre data-health-result></pre><p data-ai-message role="status"></p></section>
        <section class="a-card"><h2>Growth 运营待办</h2>
        <p>只读工作台：待审批、待执行、待复盘与失败调查。不会自动执行外部运营动作。</p>
        <p>当前待办 ${esc(inbox.counts?.total??0)} 条 · 等待审批 ${esc(inbox.counts?.approval??0)} · 待复盘 ${esc(inbox.counts?.review??0)}</p>
        ${(inbox.warnings||[]).map(w=>'<p>'+esc(w)+'</p>').join('')}
        ${(inbox.tasks||[]).slice(0,20).map(t=>`<p>${esc(t.priority)} · ${esc(t.title)} · ${esc(t.status)} ${t.analysisId?'<button class="a-button" data-analysis="'+esc(t.analysisId)+'">查看分析</button>':''}${t.proposalId?'<button class="a-button" data-case-timeline="'+esc(t.proposalId)+'">查看链路</button>':''}</p>`).join('')||'<p>目前没有需要处理的运营待办。</p>'}
        </section>
        <section class="a-card"><h2>跨日增长告警</h2>
        <p>基于相邻完整业务日、相同目标和采集范围的已保存结果；仅提示观测变化，不宣称因果。扫描不调用 AI。</p>
        <button class="a-button" type="button" data-scan-growth-alerts>扫描已完成的每日分析</button>
        ${alertData.error?'<p role="status">告警服务暂不可用：'+esc(alertData.error)+'</p>':''}
        ${(alertData.alerts||[]).slice(0,30).map(a=>`<article>
          <p>${esc(a.priority)} · ${esc(a.metric)} · ${esc(a.direction==='decline'?'减少':'增加')} ·
          ${esc(a.source)} · 已出现 ${esc(a.occurrences)} 次 · ${esc(a.status)}</p>
          <p>上一完整日 ${esc(a.evidence?.baseline??'未知')} → 当前完整日 ${esc(a.evidence?.observed??'未知')}</p>
          ${Number(a.snooze_until)>Date.now()?'<p>已延后至 '+esc(day(Number(a.snooze_until)))+'</p>':''}
          ${a.status==='open'?'<button class="a-button" data-alert-action="acknowledge" data-alert-id="'+esc(a.id)+'" data-alert-version="'+esc(a.version)+'">确认</button>':''}
          ${a.status!=='resolved'?'<button class="a-button" data-alert-action="snooze" data-alert-id="'+esc(a.id)+'" data-alert-version="'+esc(a.version)+'">延后24小时</button><button class="a-button" data-alert-action="resolve" data-alert-id="'+esc(a.id)+'" data-alert-version="'+esc(a.version)+'">标记解决</button>':''}
          </article>`).join('')||'<p>目前没有未解决的跨日告警。</p>'}
        </section>
        <section class="a-card"><h2>待审批异常调查</h2>
        <p>每日模型调用保守额度：已预留 ${esc(budgetData.reservedCalls??0)} / ${esc(budgetData.limit??0)} 轮。额度为零时无法批准付费调查；并非美元费用上限。</p>
        ${budgetData.error?'<p role="status">额度查询暂不可用：'+esc(budgetData.error)+'</p>':''}
        ${proposalData.error?'<p role="status">提案查询暂不可用：'+esc(proposalData.error)+'</p>':''}
        ${(proposalData.proposals||[]).slice(0,30).map(p=>`<article>
          <p>${esc(p.metric)} · ${esc(p.source)} · ${esc(p.status)} · ${esc(day(Number(p.period_end)))}</p>
          <p>异常观测需要核实采集覆盖，模型分析可能产生费用；批准不代表自动执行增长动作。</p>
          <button class="a-button" data-case-timeline="'+esc(p.id)+'">查看完整链路</button>
          ${p.analysis_id?'<button class="a-button" data-analysis="'+esc(p.analysis_id)+'">查看关联分析</button>':''}
          ${p.status==='proposed'?'<button class="a-button" data-growth-proposal="approve" data-proposal-id="'+esc(p.id)+'" data-proposal-version="'+esc(p.version)+'" '+(Number(budgetData.remainingCalls)<1?'disabled title="每日预算未开启或已耗尽"':'')+'>人工批准调查</button><button class="a-button" data-growth-proposal="dismiss" data-proposal-id="'+esc(p.id)+'" data-proposal-version="'+esc(p.version)+'">忽略提案</button>':''}
          </article>`).join('')||'<p>暂无待审批异常调查。</p>'}
        <section data-growth-timeline><p>选择提案后，可查看原始观测、调查、建议和复盘的完整关联。</p></section>
        </section>
        <section class="a-card"><h2>站内通知</h2>
        ${noticeData.error?'<p role="status">通知暂不可用：'+esc(noticeData.error)+'</p>':''}
        ${(noticeData.notifications||[]).slice(0,30).map(n=>`<p>
          ${esc(n.message)} · ${esc(day(Number(n.created_at)))}
          ${n.read_at?'（已读）':'<button class="a-button" data-notice-read="'+esc(n.id)+'">标记已读</button>'}
          </p>`).join('')||'<p>暂无站内通知。</p>'}
        <p>仅站内通知，尚未启用邮件等外部送达。</p></section>
        <section class="a-card ai-gsc-settings">
          <h2>Google Search Console · 网站与数据设置</h2>
          <p>只读 Search Console API。凭证保存在服务器环境，网页不会上传或显示 Google 私钥／Token。</p>
          <p role="status">
            ${gscConnection.configured?
              (gscConnection.selectedSite?'已连接 · 站点已选定':'API 已配置 · 请选择可访问站点'):
              '尚未完成此账号的 API 授权配置'}
            ${gscConnection.mode&&gscConnection.configured?' · '+esc(gscConnection.mode):''}
          </p>
          ${gscConnection.error?'<p role="alert">连接检查失败：'+esc(gscConnection.error)+'</p>':''}
          ${gscConnection.reason?'<p>'+esc(gscConnection.reason)+'</p>':''}
          ${gscConnection.selectionNeedsReview?'<p role="alert">此前站点已失去 API 权限，请重新选择。</p>':''}
          <div class="ai-gsc-controls">
            <label>Search Console 资源
              <select data-gsc-site ${!(gscConnection.sites||[]).length?'disabled':''}>
                ${(gscConnection.sites||[]).length?(gscConnection.sites||[]).map(site=>
                  `<option value="${esc(site.siteUrl)}" ${site.siteUrl===gscConnection.selectedSite?'selected':''}>${esc(site.siteUrl)} · ${esc(site.permissionLevel)}</option>`).join(''):
                  '<option value="">没有可访问的 Google 站点</option>'}
              </select>
            </label>
            <button class="a-button" type="button" data-gsc-save ${!(gscConnection.sites||[]).length?'disabled':''}>保存默认站点</button>
          </div>
          <form data-gsc-sync-form class="ai-gsc-controls">
            <label>数据开始日期（Search Console 太平洋时间）
              <input type="date" name="startDate" required value="${esc(gscDates.start)}"></label>
            <label>结束日期（仅最终数据，至少早于今天2天）
              <input type="date" name="endDate" required value="${esc(gscDates.end)}"></label>
            <button type="submit" class="a-button" ${!gscConnection.selectedSite?'disabled':''}>从 Google 同步数据</button>
          </form>
          <p>同步采用已最终确定的 Google 搜索数据；不会发起 AI 调查，也不会修改网站、索引或 Sitemap 设置。</p>
        </section>
        <section class="a-card ai-gsc-report">
          <h2>Search Console · SEO 数据面板</h2>
          ${gscSnapshot.error?'<p role="status">历史同步数据暂不可用：'+esc(gscSnapshot.error)+'</p>':''}
          ${gscSnapshot.available&&gscSnapshot.report?(()=>{
            const r=gscSnapshot.report,metric=r.metrics||{},coverage=r.coverage||{};
            return `<p>资源：${esc(r.siteUrl)} · 报告期 ${esc(r.startDate)} ~ ${esc(r.endDate)} · 上次同步 ${esc(r.syncedAt?new Date(r.syncedAt).toLocaleString('zh-CN'):'—')}</p>
              <div class="ai-stats-grid">
                <div class="ai-stat"><span>总点击</span><strong>${esc(formatCount(metric.clicks))}</strong></div>
                <div class="ai-stat"><span>总曝光</span><strong>${esc(formatCount(metric.impressions))}</strong></div>
                <div class="ai-stat"><span>站点 CTR</span><strong>${esc(formatPercent(metric.ctr))}</strong></div>
                <div class="ai-stat"><span>平均排名</span><strong>${esc(formatPosition(metric.position))}</strong></div>
              </div>
              <p>数据覆盖：${esc(coverage.reportedDays)} / ${esc(coverage.expectedDays)} 个日期；
                查询行 ${esc(coverage.queryRowsReturned)}；页面行 ${esc(coverage.pageRowsReturned)}。</p>
              <h3>按日走势</h3>
              <div class="ai-gsc-table"><table><thead><tr><th>日期</th><th>点击</th><th>曝光</th><th>CTR</th><th>排名</th></tr></thead>
                <tbody>${(r.daily||[]).map(d=>`<tr><td>${esc(d.date)}</td><td>${esc(formatCount(d.clicks))}</td><td>${esc(formatCount(d.impressions))}</td><td>${esc(formatPercent(d.ctr))}</td><td>${esc(formatPosition(d.position))}</td></tr>`).join('')||'<tr><td colspan="5">暂无按日数据，不能判定为零流量</td></tr>'}</tbody></table></div>
              <h3>热门关键词（前 30）</h3>
              <div class="ai-gsc-table"><table><thead><tr><th>查询词</th><th>点击</th><th>曝光</th><th>CTR</th><th>排名</th></tr></thead>
                <tbody>${(r.queries||[]).slice(0,30).map(q=>`<tr><td>${esc(q.query)}</td><td>${esc(formatCount(q.clicks))}</td><td>${esc(formatCount(q.impressions))}</td><td>${esc(formatPercent(q.ctr))}</td><td>${esc(formatPosition(q.position))}</td></tr>`).join('')||'<tr><td colspan="5">无可展示的查询词</td></tr>'}</tbody></table></div>
              <h3>潜在 SEO 机会（候选，非预测收益）</h3>
              ${(r.opportunities||[]).slice(0,12).map(q=>`<p>${esc(q.query)} · 曝光 ${esc(formatCount(q.impressions))} · CTR ${esc(formatPercent(q.ctr))} · 平均排名 ${esc(formatPosition(q.position))}</p>`).join('')||'<p>本次数据中没有达到候选阈值的查询词。</p>'}
              <h3>热门页面（前 20）</h3>
              <div class="ai-gsc-table"><table><thead><tr><th>页面</th><th>点击</th><th>曝光</th><th>CTR</th></tr></thead>
                <tbody>${(r.pages||[]).slice(0,20).map(p=>`<tr><td>${esc(p.page)}</td><td>${esc(formatCount(p.clicks))}</td><td>${esc(formatCount(p.impressions))}</td><td>${esc(formatPercent(p.ctr))}</td></tr>`).join('')||'<tr><td colspan="4">无可展示的页面</td></tr>'}</tbody></table></div>
              <p>${(r.warnings||[]).map(w=>esc(w)).join('；')}</p>`;
          })():'<p>尚无已同步的 Google API 数据。选择站点后点击同步，才能展示可核查的关键词及趋势。</p>'}
        </section>
        <section class="a-card ai-gsc-diagnostics">
          <h2>Sitemap 与 URL 收录检查</h2>
          <p>只读查看 Search Console 中已经提交的 Sitemap 和某个 URL 的 Google 索引版本；不提交 Sitemap，不请求收录，也不更改网站。</p>
          <button class="a-button" data-gsc-sitemaps ${!gscConnection.selectedSite?'disabled':''}>查看已提交 Sitemap</button>
          <form data-gsc-inspect-form class="ai-gsc-controls">
            <label>检查页面 URL（必须属于已选择资源的 HTTPS 页面）
              <input name="inspectionUrl" type="url" placeholder="https://example.com/holders" maxlength="1500" required></label>
            <button type="submit" class="a-button" ${!gscConnection.selectedSite?'disabled':''}>查看 Google 索引状态</button>
          </form>
          <div data-gsc-diagnostic-result role="status">尚未发起索引状态查询。</div>
        </section>
        <section class="a-card"><h2>SEO · 备用手动导入</h2>
          <p>优先使用上方 Google API 同步。只有服务器尚不能读取该资源时，才使用以下离线 GSC JSON 作为有限证据。</p>
          ${seoData.error?'<p role="status">SEO 数据暂不可用：'+esc(seoData.error)+'</p>':''}
          <form data-seo-import-form>
           <label>粘贴规范化的 GSC JSON（siteUrl、startDate、endDate、source、rows）
             <textarea name="json" rows="4" maxlength="95000" placeholder='{"siteUrl":"https://example.com/","startDate":"2026-10-18","endDate":"2026-10-18","source":"gsc-manual-export","rows":[{"date":"2026-10-18","query":"holder distribution","page":"https://example.com/holders","clicks":2,"impressions":80,"position":8.2}]}'
             required></textarea></label>
           <button class="a-button" type="submit">导入 GSC 快照（不调用 AI）</button>
          </form>
          ${(seoData.imports||[]).slice(0,10).map(r=>`<p>${esc(r.site_url)} ·
             ${esc(r.start_date)} ~ ${esc(r.end_date)} · ${esc(r.row_count)} 行
             <button class="a-button" data-seo-preview="${esc(r.id)}">查看 SEO 证据</button></p>`).join('')||'<p>暂无 Search Console 数据，关键词搜索量与排名不可用。</p>'}
        </section>
        <section class="a-card"><h2>KOL · CRM 归组效果</h2>
          <p>复用既有 KOL 排名计算，需连接真实 Hologres。指标是观察行为，不能说明由 KOL 导致；缺失值仍为未知。</p>
          <button class="a-button" data-kol-preview type="button">读取当前统计期 KOL 观察结果（不调用 AI）</button>
        </section>
        <section class="a-card" data-specialist-preview><p>选择一个 SEO 快照或读取 KOL 观察结果查看证据。</p></section>
        <section class="a-card"><h2>历史分析</h2><button class="a-button" data-refresh>刷新</button>
        <div class="ai-task-history"><table><thead><tr><th>任务</th><th>创建时间</th><th>后端状态</th><th>建议</th><th>操作</th></tr></thead><tbody>
        ${list.records.length?list.records.slice(0,20).map(r=>`<tr><td><strong>${esc(r.title)}</strong><small>${esc(r.id)}</small></td><td>${esc(formatAnalysisTime(r.created_at))}</td><td>${esc(r.status==='processing'?'执行状态待核查':label(r.status))}</td><td>${esc(r.suggestion_count??'未知')}</td><td><button class="a-button" data-analysis="${esc(r.id)}">详情</button></td></tr>`).join(''):'<tr><td colspan="5">暂无已保存分析</td></tr>'}
        </tbody></table></div></section>
        <section class="a-card" data-detail><p>选择一条分析查看证据和建议。</p></section>
        <section class="a-card"><h2>待复盘行动</h2>
        <p>依据完整的曼谷业务日和已采集数据水位判定，只有你已执行的行动可复盘。查看无需模型费用。</p>
        ${reviewQueue.error?'<p role="status">复盘排期暂不可用：'+esc(reviewQueue.error)+'</p>':''}
        ${reviewQueue.entries?.length?reviewQueue.entries.map(item=>`<p>${esc(item.title)} · ${esc(item.status==='ready'?'达到复盘条件':'等待观察期')} · ${item.status==='ready'?'<button class="a-button" data-ready-review="'+esc(item.suggestionId)+'">人工发起复盘</button>':'最早 '+esc(day(item.earliestReviewAt||Date.now()))}</p>`).join(''):'<p>暂无待复盘行动。</p>'}</section>
        <section class="a-card"><h2>复盘记录</h2>${reviews.retrospectives.map(r=>`<article><h3>${esc(r.analysis_title)}</h3><p>${esc(r.conclusion)}</p><p>置信度：${esc(r.confidence)} · ${r.has_causality?'有因果证据':'观测变化，未证明因果'}</p><p>经验：${esc(r.lessons_learned||'尚无结论')}</p></article>`).join('')||'<p>记录行动后，可主动发起复盘。</p>'}</section></div>`;
      host.querySelector('[data-health]').onclick=async()=>{try{const state=await getAgentHealth();if(token===generation)host.querySelector('[data-health-result]').textContent=JSON.stringify(state,null,2);}catch(error){if(token===generation)message(error.message);}};
      host.querySelector('[data-refresh]').onclick=()=>draw();
      const scanGrowthButton=host.querySelector('[data-scan-growth-alerts]');
      if(scanGrowthButton)scanGrowthButton.onclick=async e=>{
        if(busy)return;busy=true;const button=e.currentTarget;button.disabled=true;
        try{
          const result=await scanGrowthAlerts();
          if(token===generation){message('扫描完成，新观测 '+(result.newObservations||0)+' 条');await draw();}
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      };
      host.querySelectorAll('[data-alert-action]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        const action=button.dataset.alertAction;
        try{
          await changeGrowthAlert(button.dataset.alertId,Number(button.dataset.alertVersion),action,
            action==='snooze'?{snoozeUntil:Date.now()+DAY}:{});
          if(token===generation)await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });

      host.querySelectorAll('[data-case-timeline]').forEach(button=>button.onclick=async()=>{
        const panel=host.querySelector('[data-growth-timeline]');
        if(!panel)return;
        const openedAt=token;
        button.disabled=true;
        panel.textContent='正在读取调查链路…';
        try{
          const timeline=await getGrowthInvestigationTimeline(button.dataset.caseTimeline);
          if(openedAt!==generation)return;
          const stages={
            'awaiting-approval':'等待人工批准','dismissed':'提案已忽略',
            'approved-awaiting-dispatch':'已批准，等待派发','queued':'已入队',
            'investigating':'AI 正在调查','investigation-failed':'调查失败，需核查',
            'analysis-completed-no-action':'分析已完成，无待执行建议',
            'awaiting-action-approval':'等待建议审批',
            'action-in-progress':'行动执行中','awaiting-retrospective':'等待复盘',
            'retrospective-recorded':'已有复盘记录','action-closed':'行动已关闭'
          };
          const obs=timeline.originalObservation||{};
          panel.innerHTML=`<h3>完整调查链路 · ${esc(stages[timeline.stage]||timeline.stage)}</h3>
            <p>告警：${esc(timeline.alert.metric)} · ${esc(timeline.alert.direction)} ·
            来源 ${esc(timeline.alert.source)} · 优先级 ${esc(timeline.alert.priority)}</p>
            <p>原始观测（提案时冻结）：${esc(obs.baseline??'未知')} → ${esc(obs.observed??'未知')}
            · 变化 ${esc(obs.absolute??'未知')}；不构成因果证明。</p>
            <p>证据分析 ID：${esc(obs.evidence?.baselineAnalysisId||'未知')} →
            ${esc(obs.evidence?.currentAnalysisId||'未知')}</p>
            ${timeline.analysis?`<p>AI 调查：${esc(timeline.analysis.status)}
              ${timeline.analysis.error?' · '+esc(timeline.analysis.error):''}</p>
              <p>摘要：${esc(timeline.analysis.summary||'尚无分析结论')}</p>
              <p>验证证据 ID：${(timeline.analysis.evidenceIds||[]).map(esc).join('、')||'尚无'}</p>
              <button class="a-button" data-case-analysis="${esc(timeline.analysis.id)}">查看原分析与证据</button>`:
              '<p>尚未关联 AI 调查，可能还在等待审批或派发。</p>'}
            <h4>行动建议（${esc(timeline.counts.suggestions)}）</h4>
            ${(timeline.actions||[]).map(a=>`<article><p>${esc(a.priority)} · ${esc(a.problem)}
              · ${esc(label(a.status))}</p><p>建议：${esc(a.action||'无')}</p>
              ${a.actualAction?'<p>实际执行：'+esc(a.actualAction)+'</p>':''}
              </article>`).join('')||'<p>没有已保存的行动建议。</p>'}
            <h4>复盘（${esc(timeline.counts.retrospectives)}）</h4>
            ${(timeline.retrospectives||[]).map(r=>`<p>${esc(r.conclusion)} ·
              ${esc(r.confidence)} · ${r.hasCausality?'包含因果证据':'观察相关，未证明因果'}</p>`).join('')||
              '<p>尚无完成的复盘。</p>'}
            <p>本页只读取既有记录，不调用模型，也不执行运营动作。</p>`;
          panel.querySelector('[data-case-analysis]')?.addEventListener('click',()=>{
            if(timeline.analysis?.id)open(timeline.analysis.id);
          });
        }catch(error){if(openedAt===generation)panel.textContent='无法读取调查链路：'+error.message;}
        finally{if(button.isConnected)button.disabled=false;}
      });
      host.querySelectorAll('[data-growth-proposal]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{
          const response=await decideGrowthInvestigation(button.dataset.proposalId,
            Number(button.dataset.proposalVersion),button.dataset.growthProposal);
          if(token===generation){
            message(response.note||'提案状态已更新');
            await draw();
          }
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });
      host.querySelectorAll('[data-notice-read]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{
          await markGrowthNotificationRead(button.dataset.noticeRead);
          if(token===generation)await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });
      host.querySelectorAll('[data-ready-review]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{
          const response=await createRetrospective(button.dataset.readyReview,crypto.randomUUID());
          if(token===generation){message('复盘已入队：'+response.jobId);await draw();}
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;}
      });

      const gscSave=host.querySelector('[data-gsc-save]');
      if(gscSave)gscSave.onclick=async()=>{
        const value=host.querySelector('[data-gsc-site]')?.value;
        if(busy||!value)return;busy=true;gscSave.disabled=true;
        try{
          await saveGscSite(value);
          if(token===generation){message('Search Console 默认站点已保存');await draw()}
        }catch(error){if(token===generation)message('保存站点失败：'+error.message)}
        finally{busy=false;if(gscSave.isConnected)gscSave.disabled=false}
      };
      const gscSyncForm=host.querySelector('[data-gsc-sync-form]');
      if(gscSyncForm)gscSyncForm.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        const form=new FormData(e.target),startDate=String(form.get('startDate')||''),
          endDate=String(form.get('endDate')||'');
        try{
          const synced=await syncGscPerformance(startDate,endDate);
          gscDates.start=startDate;gscDates.end=endDate;
          if(token===generation){
            message(synced.cached?'已读取最近同步的 Search Console 快照':'Google Search Console 已同步最终数据');
            await draw();
          }
        }catch(error){if(token===generation)message('Search Console 同步失败：'+error.message)}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      const gscDiagnostics=host.querySelector('[data-gsc-diagnostic-result]');
      const sitemapButton=host.querySelector('[data-gsc-sitemaps]');
      if(sitemapButton)sitemapButton.onclick=async()=>{
        if(busy||!gscDiagnostics)return;busy=true;sitemapButton.disabled=true;
        gscDiagnostics.textContent='正在读取 Google Sitemap 状态…';
        try{
          const result=await getGscSitemaps();
          if(token!==generation)return;
          gscDiagnostics.innerHTML='<h3>已提交 Sitemap（最多50条）</h3>'+
            ((result.rows||[]).map(r=>`<p>${esc(r.path)} ·
              错误 ${esc(r.errors??'未知')} · 警告 ${esc(r.warnings??'未知')} ·
              最近下载 ${esc(r.lastDownloaded||'未知')}${r.isPending?' · 待处理':''}</p>`).join('')||
             '<p>该 Search Console 资源没有返回已提交的 Sitemap。</p>')+
            '<p>提交和索引计数不等于整站页面覆盖率。</p>';
        }catch(error){if(token===generation)gscDiagnostics.textContent='Sitemap 查询失败：'+error.message}
        finally{busy=false;if(sitemapButton.isConnected)sitemapButton.disabled=false}
      };
      const inspectForm=host.querySelector('[data-gsc-inspect-form]');
      if(inspectForm)inspectForm.onsubmit=async e=>{
        e.preventDefault();if(busy||!gscDiagnostics)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        const url=String(new FormData(e.target).get('inspectionUrl')||'');
        gscDiagnostics.textContent='正在查询 Google 已索引版本…';
        try{
          const response=await inspectGscUrl(url);
          if(token!==generation)return;
          const r=response.result||{};
          gscDiagnostics.innerHTML=`<h3>Google URL 索引信息</h3>
             <p>页面：${esc(r.inspectionUrl||url)}</p>
             <p>索引覆盖：${esc(r.coverageState||'未知')} · 结果：${esc(r.verdict||'未知')}</p>
             <p>抓取状态：${esc(r.pageFetchState||'未知')} · 最近抓取：${esc(r.lastCrawlTime||'未知')}</p>
             <p>robots.txt：${esc(r.robotsTxtState||'未知')} · 索引允许：${esc(r.indexingState||'未知')}</p>
             <p>Google 规范页面：${esc(r.googleCanonical||'未知')}</p>
             <p>网站声明的规范页面：${esc(r.userCanonical||'未知')}</p>
             <p>${esc(r.warning||'仅查询 Google 索引中的已有状态')}</p>`;
        }catch(error){if(token===generation)gscDiagnostics.textContent='网址检查失败：'+error.message}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      const specialist=host.querySelector('[data-specialist-preview]');
      host.querySelectorAll('[data-seo-preview]').forEach(button=>button.onclick=async()=>{
        if(!specialist)return;
        button.disabled=true;specialist.textContent='正在查询 Search Console 快照…';
        try{
          const result=await previewSeoSnapshot(button.dataset.seoPreview);
          if(token!==generation)return;
          specialist.innerHTML='<h3>SEO 已导入观察数据</h3><pre>'+esc(JSON.stringify(result.report,null,2))+'</pre>';
        }catch(error){if(token===generation)specialist.textContent=error.message}
        finally{if(button.isConnected)button.disabled=false}
      });
      const kolButton=host.querySelector('[data-kol-preview]');
      if(kolButton)kolButton.onclick=async()=>{
        if(!specialist)return;
        kolButton.disabled=true;specialist.textContent='正在查询已归组 KOL 观察数据…';
        try{
          const result=await previewKolPerformance(timestamp(defaults.start),
            timestamp(defaults.end)+DAY);
          if(token!==generation)return;
          specialist.innerHTML='<h3>KOL 观察数据（非因果）</h3><pre>'+esc(JSON.stringify(result.report,null,2))+'</pre>';
        }catch(error){if(token===generation)specialist.textContent=error.message}
        finally{if(kolButton.isConnected)kolButton.disabled=false}
      };
      const importForm=host.querySelector('[data-seo-import-form]');
      if(importForm)importForm.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        try{
          const raw=new FormData(e.target).get('json');
          const result=await importSeoSnapshot(JSON.parse(raw));
          if(token===generation){message(result.created?'SEO 快照导入成功':'相同快照已存在，未重复写入');await draw();}
        }catch(error){if(token===generation)message('导入失败：'+error.message)}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      const autonomyRefresh=host.querySelector('[data-autonomy-refresh]');
      if(autonomyRefresh)autonomyRefresh.onclick=async()=>{
        if(busy)return;busy=true;autonomyRefresh.disabled=true;
        try{
          const value=await refreshAutonomyBrief();
          if(token===generation){message('已整合历史分析和成熟复盘：'+value.status+'；本次没有付费模型请求');await draw()}
        }catch(error){if(token===generation)message('整理日报失败：'+error.message)}
        finally{busy=false;if(autonomyRefresh.isConnected)autonomyRefresh.disabled=false}
      };
      const targetForm=host.querySelector('[data-autonomy-target]');
      if(targetForm)targetForm.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const button=e.target.querySelector('button');button.disabled=true;
        try{
          const fd=new FormData(e.target),goal=String(fd.get('goal')),
            metric=String(fd.get('metric')),value=Number(fd.get('target')),
            weight=Number(fd.get('weight'));
          const old=(agentTargets.targets||[]).find(x=>x.goal===goal&&x.metric===metric&&x.source==='all');
          await saveAutonomyTarget({goal,metric,source:'all',target:value,weight,
            expectedVersion:old?.version??null});
          if(token===generation){message('运营目标已保存；历史日报数据与目标变动需重新核对');await draw()}
        }catch(error){if(token===generation)message('保存目标失败：'+error.message)}
        finally{busy=false;if(button.isConnected)button.disabled=false}
      };
      host.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>open(b.dataset.analysis));
      host.querySelector('[data-start-analysis]')?.addEventListener('click',()=>{
        const setup=host.querySelector('[data-analysis-setup]');
        if(setup)setup.open=true;
        host.querySelector('[data-ai-form] [name="title"]')?.focus();
      });
      host.querySelector('[data-ai-form]').onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;
        const form=new FormData(e.target),requestKey=crypto.randomUUID();
        defaults.start=form.get('start');defaults.end=form.get('end');
        try{
          const result=await createBusinessAnalysis({requestKey,title:form.get('title'),dateRangeStart:timestamp(defaults.start),dateRangeEnd:timestamp(defaults.end)+DAY,
            businessScope:{source:form.get('source').trim()||'all'},focusGoal:form.get('goal'),userQuestion:form.get('question'),modelMode:form.get('modelMode'),skillId:form.get('skillId')||null});
          if(token!==generation)return;
          selected=result.analysisId;await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;const current=$('#as-output')?.querySelector('[data-ai-form] button');if(current)current.disabled=false;}
      };
      if(selected)await open(selected);
    }catch(error){if(token===generation)host.innerHTML=`<section class="a-card"><p>${esc(error.message)}</p><button class="a-button" data-retry>重新加载</button></section>`;host.querySelector('[data-retry]')?.addEventListener('click',draw);}
  }
  async function open(id){
    selected=id;clearTimeout(timer);const token=generation;
    try{
      const r=await getAnalysisDetail(id);if(token!==generation||selected!==id)return;
      const panel=$('#as-output').querySelector('[data-detail]');if(!panel)return;
      panel.innerHTML=`<h2>${esc(r.title)} · ${esc(label(r.status))}</h2>
      ${r.error_message?`<p role="alert">${esc(r.error_message)}</p>`:''}
      <p data-checkpoint-result role="status">正在读取调查检查点…</p>
      ${r.status==='failed'&&!r.cancel_requested?'<button class="a-button" data-retry-analysis>重试分析</button>':''}
      ${['pending','processing'].includes(r.status)&&!r.cancel_requested?'<button class="a-button" type="button" data-cancel-analysis>取消任务</button>':''}
      ${r.cancel_requested?'<p role="status">任务已取消，不会继续新的模型调用；先前发出的请求仍可能计费。</p>':''}
      <p>${esc(r.result?.summary||'任务已排队；请确认 AI Worker 正在运行。')}</p>
      ${(r.result?.keyFindings||[]).map(f=>`<p>${esc(f)}</p>`).join('')}
      ${r.result?.routing?`<p>调查方式：${esc(r.result.routing.reason)}</p>`:''}
      ${(r.result?.evidenceIds||[]).map(eid=>`<button class="a-button" data-evidence="${esc(eid)}">查看证据 ${esc(eid.slice(0,8))}</button>`).join('')}<pre data-evidence-result></pre>
      ${(r.suggestions||[]).map(s=>`<article class="ai-suggestion"><h3>${esc(s.priority)} · ${esc(s.business_problem)}</h3><p>${esc(s.action)}</p><p>排序依据：${esc(s.priority_reason)}</p><p>假设：${esc(s.hypothesis)}</p><p>不确定性：${esc((s.uncertainties||[]).join('；'))}</p>
        <details><summary>数据证据与验证条件</summary><pre>${json({evidence:s.data_evidence,scope:s.applicable_scope,validation:s.validation_metrics,review:s.review_conditions,impact:s.expected_impact,basis:s.impact_basis})}</pre></details>
        <p>状态：${esc(label(s.user_status))}</p><form data-suggestion="${esc(s.id)}">
        <label>实际行动 / 拒绝原因<textarea name="note" maxlength="5000">${esc(s.actual_action||s.rejection_reason||'')}</textarea></label>
        <label>实际执行时间（UTC+7）<input name="executedAt" type="datetime-local" value="${s.executed_at?new Date(Number(s.executed_at)+OFFSET).toISOString().slice(0,16):''}"></label>
        ${s.user_status==='pending'?'<button class="a-button" name="status" value="adopted">人工批准采纳</button>':''}
        ${s.user_status==='adopted'?'<button class="a-button" name="status" value="executing">开始执行</button>':''}
        ${s.user_status==='executing'?'<button class="a-button" name="status" value="executed">记录已执行</button>':''}
        ${['pending','adopted','executing'].includes(s.user_status)?'<button class="a-button" name="status" value="rejected">拒绝</button>':''}
        </form>
        ${s.user_status==='executed'?`<button class="a-button" data-review="${esc(s.id)}">复盘执行效果</button>`:''}</article>`).join('')}
      <details><summary>业务快照、目标优先级及模型调用记录</summary><pre>${json({snapshot:r.data_snapshot,calls:r.result?.calls})}</pre></details>`;
      // Diagnostics are owner-scoped and intentionally do not expose model prompts.
      getJobCheckpoint(id).then(checkpoint=>{
        if(token!==generation||selected!==id||!panel.isConnected)return;
        const target=panel.querySelector('[data-checkpoint-result]');
        if(!target)return;
        const reasons={
          'unresolved-paid-call':'模型调用状态未确认，必须人工核查，不能直接重试',
          'tool-execution-incomplete':'调查工具执行不完整，尚不允许自动续跑',
          'requires-validation-before-resume':'调查记录已保存，但尚未完成恢复验证',
          'noncontiguous-rounds':'调查步骤记录不连续，需人工核查'
        };
        if(checkpoint.leaseExpired&&checkpoint.recordStatus==='processing'){
          const existing=panel.querySelector('[data-resume-analysis]');
          if(!existing){
            const button=document.createElement('button');
            button.className='a-button';button.type='button';button.dataset.resumeAnalysis=id;
            button.textContent='尝试安全续跑';
            button.onclick=async()=>{
              if(busy)return;busy=true;button.disabled=true;
              try{
                const task=await resumeAnalysis(id);
                message(task.notice||'恢复任务已进入队列');
                if(token===generation&&selected===id)await open(id);
              }catch(error){message(error.message)}
              finally{busy=false;if(button.isConnected)button.disabled=false}
            };
            target.after(button);
          }
        }
        target.textContent='已保存模型轮次：'+checkpoint.completedRounds+
          ' · 工具结果：'+checkpoint.completedTools+
          ' · 待完成工具：'+checkpoint.pendingTools+
          (checkpoint.leaseExpired?' · 执行租约已过期':'')+
          (checkpoint.reason?' · '+(reasons[checkpoint.reason]||checkpoint.reason):'')+
          (checkpoint.requiresHumanReview?' · 需要人工处理':'');
      }).catch(error=>{
        if(token===generation&&selected===id&&panel.isConnected){
          const target=panel.querySelector('[data-checkpoint-result]');
          if(target)target.textContent='检查点暂不可用：'+error.message;
        }
      });
      panel.querySelectorAll('[data-evidence]').forEach(button=>button.onclick=async()=>{try{const evidence=await getEvidence(button.dataset.evidence);if(token===generation&&selected===id)panel.querySelector('[data-evidence-result]').textContent=JSON.stringify(evidence,null,2);}catch(error){message(error.message);}});
      panel.querySelector('[data-cancel-analysis]')?.addEventListener('click',async e=>{
        if(busy)return;
        busy=true;const button=e.currentTarget;button.disabled=true;
        try{
          await cancelAnalysis(id);
          if(token===generation&&selected===id)await open(id);
        }catch(error){message(error.message);if(button.isConnected)button.disabled=false;}
        finally{busy=false;}
      });
      panel.querySelector('[data-retry-analysis]')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await retryAnalysis(id);if(token===generation)await open(id);}catch(error){message(error.message);}finally{busy=false;}});
      panel.querySelectorAll('[data-suggestion]').forEach(form=>form.onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;
        const data=new FormData(form),state=e.submitter.value,note=data.get('note'),at=data.get('executedAt');
        try{await updateSuggestionStatus(form.dataset.suggestion,{userStatus:state,actualAction:state==='executed'?note:undefined,rejectionReason:state==='rejected'?note:undefined,executedAt:state==='executed'&&at?Date.parse(at+':00+07:00'):undefined});if(token===generation)await open(id);}
        catch(error){message(error.message);}finally{busy=false;}
      });
      panel.querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{const result=await createRetrospective(button.dataset.review,crypto.randomUUID());if(token!==generation)return;message('复盘已启动，任务完成后刷新记录。');pollReview(result.jobId,token);}
        catch(error){message(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
      });
      if(['pending','processing'].includes(r.status)&&!polling)timer=setTimeout(()=>open(id),3000);
    }catch(error){if(token===generation)message(error.message);}
  }
  async function pollReview(id,token){
    polling=true;
    try{const job=await getJobStatus(id);if(token!==generation)return;
      if(job.state==='completed'){polling=false;await draw();return;}
      if(job.state==='failed')throw Error(job.error||'复盘失败');
      message(`复盘进度 ${job.progress||0}%`);timer=setTimeout(()=>pollReview(id,token),3000);
    }catch(error){polling=false;if(token===generation)message(error.message);}
  }
  return {draw,dispose};
}
