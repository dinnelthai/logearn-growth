import './aiAnalysis.css';
import {loadingState} from './loadingState.js';
import {createBusinessAnalysis,getAnalysisList,getAnalysisDetail,getJobStatus,updateSuggestionStatus,createRetrospective,getRetrospectives,getCostStats,retryAnalysis,getAgentHealth,getEvidence,getJobCheckpoint,cancelAnalysis,resumeAnalysis,getGrowthReviewQueue,getGrowthInbox,getGrowthAlerts,scanGrowthAlerts,changeGrowthAlert,getGrowthBudget,getGrowthInvestigations,decideGrowthInvestigation,getGrowthNotifications,markGrowthNotificationRead,getGrowthInvestigationTimeline} from '../api/aiAnalysis.js';
const DAY=86400000,OFFSET=7*3600000;
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);
const timestamp=d=>Date.parse(d+'T00:00:00+07:00');
export function createAIAnalysis(ctx){
  const {$,esc}=ctx;
  let generation=0,timer=null,selected=null,busy=false,polling=false;
  const defaults={start:day(Date.now()-7*DAY),end:day(Date.now()-DAY)};
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
      const [list,reviews,costs,reviewQueue,inbox,alertData,proposalData,noticeData,budgetData]=await Promise.all([getAnalysisList(),getRetrospectives(),getCostStats(),getGrowthReviewQueue().catch(error=>({entries:[],readyCount:null,error:error.message})),getGrowthInbox().catch(error=>({tasks:[],counts:{total:0},warnings:[error.message]})),getGrowthAlerts().catch(error=>({alerts:[],error:error.message})),getGrowthInvestigations().catch(error=>({proposals:[],error:error.message})),getGrowthNotifications().catch(error=>({notifications:[],error:error.message})),getGrowthBudget().catch(error=>({limit:0,reservedCalls:0,remainingCalls:0,error:error.message}))]);
      if(token!==generation)return;
      host.innerHTML=`<div class="si-page ai-analysis-page">
        <section class="a-card"><h1>AI 业务增长助手</h1><p>主动发起分析，按业务证据排优先级；记录行动后主动复盘。所有分析与复盘均使用同一 DeRouter 模型。</p>
        <p>累计调用 ${esc(costs.total_calls)} 次 · Token ${esc(costs.total_tokens??0)} · 估算费用 $${esc(costs.total_cost??0)}（${esc(costs.unknown_cost_calls??0)} 次调用费率未配置，金额不代表免费）</p>
        <form data-ai-form><label>分析标题<input name="title" required maxlength="200" value="业务增长分析"></label>
        <label>开始日期<input name="start" type="date" required value="${defaults.start}"></label>
        <label>结束日期（含当日）<input name="end" type="date" required value="${defaults.end}"></label>
        <label>来源<input name="source" value="all" maxlength="200" placeholder="all 或业务来源值"></label>
        <label>业务目标<select name="goal"><option value="activation">提升激活</option><option value="retention">提升留存</option><option value="conversion">提升转化</option><option value="revenue">收入策略</option></select></label>
        <label>分析方式<select name="modelMode"><option value="auto">自动调查（单模型）</option><option value="complex">深度调查（同一模型）</option></select></label>
        <label>业务背景与问题<textarea name="question" maxlength="5000" placeholder="当前目标、资源约束、近期活动、产品改动，以及你想解决的问题"></textarea></label>
        <button class="a-button" type="submit" ${busy?'disabled':''}>开始分析</button></form>
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
        <section class="a-card"><h2>历史分析</h2><button class="a-button" data-refresh>刷新</button>
        ${list.records.length?list.records.map(r=>`<p><button class="a-button" data-analysis="${esc(r.id)}">${esc(r.title)}</button> · ${esc(label(r.status))} · 建议 ${esc(r.suggestion_count)} 条</p>`).join(''):'<p>尚无分析，点击开始后才会调用模型。</p>'}</section>
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

      host.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>open(b.dataset.analysis));
      host.querySelector('[data-ai-form]').onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;
        const form=new FormData(e.target),requestKey=crypto.randomUUID();
        defaults.start=form.get('start');defaults.end=form.get('end');
        try{
          const result=await createBusinessAnalysis({requestKey,title:form.get('title'),dateRangeStart:timestamp(defaults.start),dateRangeEnd:timestamp(defaults.end)+DAY,
            businessScope:{source:form.get('source').trim()||'all'},focusGoal:form.get('goal'),userQuestion:form.get('question'),modelMode:form.get('modelMode')});
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
