import './aiAnalysis.css';
import {mountAIGrowthModulesPanel} from './aiGrowthModulesPanel.js';
import {consumeAnalysisLaunch} from '../analysisLaunchContext.js';
import {loadingState} from './loadingState.js';
import {TASK_LABELS,displayTaskStatus,canOfferTaskResume,canOfferTaskRetry,shouldPollTask} from './aiTaskStatus.js';
import {renderAISuggestion} from './aiSuggestionView.js';
import {renderAIReviewQueue} from './aiReviewQueueView.js';
import {viewState} from '../components/viewStates.js';
import {createBusinessAnalysis,getAnalysisList,deleteAnalysis,getAnalysisDetail,getJobStatus,updateSuggestionStatus,createRetrospective,getRetrospectives,getCostStats,retryAnalysis,getAgentHealth,getEvidence,getJobCheckpoint,cancelAnalysis,resumeAnalysis,getGrowthReviewQueue,getGrowthInbox,importAnalysisOpportunities} from '../api/aiAnalysis.js';
const DAY=86400000,OFFSET=7*3600000;
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);
const timestamp=d=>Date.parse(d+'T00:00:00+07:00');
export function createAIAnalysis(ctx){
  const {$,esc}=ctx;
  let contentPresetConsumed=false,generation=0,detailRequest=0,displayedDetailId=null,timer=null,reviewTimer=null,selected=null,busy=false,reviewPolling=false,historyFilter='all',historyPage=0,notice='',disposeGrowthModules=null;
  const HISTORY_PAGE_SIZE=5;
  const defaults={start:day(Date.now()-7*DAY),end:day(Date.now()-DAY)};
  const label=s=>TASK_LABELS[s]||s;
  const historyTime=v=>v==null?'时间待确认':new Date(Number(v)+OFFSET).toISOString().slice(0,16).replace('T',' ')+' UTC+7';
  const historyWindow=r=>r.date_range_start==null||r.date_range_end==null?'':` · 分析期 ${day(Number(r.date_range_start))} ~ ${day(Number(r.date_range_end)-1)}`;
  const historyCounts=r=>r.suggestion_count==null?'建议数量待确认':
    `建议 ${r.suggestion_count} · 已采纳 ${r.accepted_count??'—'} · 已执行 ${r.executed_count??'—'} · 已复盘 ${r.retrospective_count??'—'}`;
  const json=v=>esc(JSON.stringify(v,null,2));
  function dispose(){generation++;detailRequest++;displayedDetailId=null;clearTimeout(timer);clearTimeout(reviewTimer);timer=null;reviewTimer=null;reviewPolling=false;disposeGrowthModules?.();disposeGrowthModules=null;}
  function message(text){notice=String(text??'');const target=$('#as-output')?.querySelector('[data-ai-message]');if(target){target.textContent=notice;target.hidden=!notice;}}
  function applyHistoryFilter(){
    const host=$('#as-output');
    if(!host)return;
    const rows=[...host.querySelectorAll('[data-ai-history-row]')];
    const matches=rows.filter(row=>{
      const kind=row.dataset.aiHistoryStatus;
      return historyFilter==='all'||(historyFilter==='processing'
        ?['processing','pending'].includes(kind):historyFilter===kind);
    });
    const pages=Math.max(1,Math.ceil(matches.length/HISTORY_PAGE_SIZE));
    historyPage=Math.min(historyPage,pages-1);
    rows.forEach(row=>row.hidden=true);
    matches.slice(historyPage*HISTORY_PAGE_SIZE,(historyPage+1)*HISTORY_PAGE_SIZE)
      .forEach(row=>row.hidden=false);
    const empty=host.querySelector('[data-ai-history-empty]');
    if(empty)empty.hidden=matches.length!==0;
    const pager=host.querySelector('[data-ai-history-pagination]');
    if(pager)pager.hidden=matches.length===0;
    const count=host.querySelector('[data-ai-history-page-info]');
    if(count)count.textContent=`第 ${historyPage+1} / ${pages} 页 · 共 ${matches.length} 条`;
    const prev=host.querySelector('[data-ai-history-prev]');
    const next=host.querySelector('[data-ai-history-next]');
    if(prev)prev.disabled=historyPage===0;
    if(next)next.disabled=historyPage>=pages-1;
  }
  async function draw(){
    ctx.clear?.();
    disposeGrowthModules?.();disposeGrowthModules=null;
    const token=++generation;detailRequest++;displayedDetailId=null;clearTimeout(timer);clearTimeout(reviewTimer);reviewTimer=null;reviewPolling=false;
    const host=$('#as-output');host.innerHTML=loadingState('正在加载主动业务分析…');
    try{
      const [list,reviews,costs,reviewQueue,inbox]=await Promise.all([
        getAnalysisList(),getRetrospectives(),getCostStats(),
        getGrowthReviewQueue().catch(error=>({entries:[],readyCount:null,error:error.message})),
        getGrowthInbox().catch(error=>({tasks:[],counts:{total:0},warnings:[error.message]}))
      ]);
      if(token!==generation)return;
      const launch=consumeAnalysisLaunch();
      if(launch?.kind==='analysis'&&typeof launch.analysisId==='string')selected=launch.analysisId;
      else if(!list.records?.some(r=>r.id===selected))selected=list.records?.[0]?.id??null;
      host.innerHTML=`<div class="si-page ai-analysis-page">
        <section class="ai-decision-hero"><div><span class="ai-eyebrow">GROWTH INTELLIGENCE</span><h1>增长决策工作台</h1><p>发现问题 · 核查证据 · 制定行动 · 持续复盘</p></div><button type="button" class="a-button a-primary" data-open-analysis>＋ 新建分析</button></section>
        <p class="ai-workspace-notice" data-ai-message role="status" aria-live="polite" ${notice?'':'hidden'}>${esc(notice)}</p>
        <div class="ai-status-grid" aria-label="AI 分析与决策状态">
          <article><span>最新分析</span><strong>${list.records?.length?esc(label(list.records[0].status)):'暂无数据'}</strong><small>${list.records?.length?esc(list.records[0].title):'发起分析后显示结果'}</small></article>
          <article><span>待处理事项</span><strong>${inbox.warnings?.length?'状态待核查':esc(inbox.counts?.total??'暂无数据')}</strong><small>到运营待办统一处理</small></article>
          <article><span>待复盘行动</span><strong>${reviewQueue.error?'状态待核查':esc(reviewQueue.readyCount??'—')}</strong><small>符合成熟度条件后由人工发起</small></article>
        </div>
        <dialog class="a-card ai-new-analysis" id="ai-new-analysis" aria-labelledby="ai-new-title"><div class="ai-modal-heading"><h2 id="ai-new-title">新建分析</h2><button class="a-button" type="button" data-close-analysis aria-label="关闭新建分析">关闭</button></div><p>主动发起分析，按业务证据排优先级；记录行动后主动复盘。所有分析与复盘均使用同一 DeRouter 模型。</p>
        <p>累计调用 ${esc(costs.total_calls)} 次 · Token ${esc(costs.total_tokens??0)} · 估算费用 $${esc(costs.total_cost??0)}（${esc(costs.unknown_cost_calls??0)} 次调用费率未配置，金额不代表免费）</p>
        <form data-ai-form><label>分析标题<input name="title" required maxlength="200" value="业务增长分析"></label>
        <label>开始日期<input name="start" type="date" required value="${defaults.start}"></label>
        <label>结束日期（含当日）<input name="end" type="date" required value="${defaults.end}"></label>
        <label>来源<input name="source" value="all" maxlength="200" placeholder="all 或业务来源值"></label>
        <label>业务目标<select name="goal"><option value="activation">提升激活</option><option value="retention">提升留存</option><option value="conversion">提升转化</option><option value="revenue">收入策略</option></select></label>
        <label>专项增长技能<select name="skillId"><option value="">通用增长分析</option><option value="seo-organic">SEO · Search Console（激活/转化）</option><option value="kol-impact">KOL · 合作归组（转化/收入）</option><option value="content-growth">X 内容增长 · 只读统计与运营评价（转化）</option><option value="referral-and-invite">推荐 · 邀请绑定与转化</option><option value="login-conversion">登录 · 转化与事件覆盖</option></select></label>
        <p>专项技能只允许全来源分析；X 内容专项读取最近30天的公开内容观察与有限样本，不把互动量当作X推荐分或产品获客。模型调用只在点击「开始分析」后发生。</p>
        <label>分析方式<select name="modelMode"><option value="auto">自动调查（单模型）</option><option value="complex">深度调查（同一模型）</option></select></label>
        <label>业务背景与问题<textarea name="question" maxlength="5000" placeholder="当前目标、资源约束、近期活动、产品改动，以及你想解决的问题"></textarea></label>
        <button class="a-button" type="submit" ${busy?'disabled':''}>开始分析</button></form>
        <p>时间按 UTC+7，最多31天。当前支持来源范围；不会把活动或用户群当作已筛选。</p>
        <button class="a-button" type="button" data-health>检查运行状态</button><pre data-health-result></pre></dialog>
        <dialog class="a-card ai-delete-dialog" aria-labelledby="ai-delete-title" aria-describedby="ai-delete-description">
          <h2 id="ai-delete-title">删除历史分析？</h2>
          <p id="ai-delete-description">这条记录将从历史分析中移除，关联的证据、建议和费用记录会保留。</p>
          <div class="ai-delete-actions"><button type="button" class="a-button" data-delete-cancel>取消</button><button type="button" class="a-button ai-delete-confirm" data-delete-confirm>删除</button></div>
        </dialog>
        <section data-ai-growth-modules aria-label="增长模块调查与机会池"></section>
        <section class="a-card ai-history"><div class="ai-history-heading"><h2>历史分析</h2>
          <label>状态<select data-ai-history-filter aria-label="筛选历史分析">
          <option value="all" ${historyFilter==='all'?'selected':''}>全部</option>
          <option value="processing" ${historyFilter==='processing'?'selected':''}>处理中</option>
          <option value="attention" ${historyFilter==='attention'?'selected':''}>需人工处理</option>
          <option value="failed" ${historyFilter==='failed'?'selected':''}>失败</option>
          <option value="completed" ${historyFilter==='completed'?'selected':''}>已完成</option>
          </select></label><button class="a-button" data-refresh>刷新</button></div>
        ${list.records.length?`<div class="ai-history-list" role="list">${list.records.map(r=>`<div class="ai-history-row" data-ai-history-row data-analysis-id="${esc(r.id)}" data-ai-history-status="${esc(displayTaskStatus(r).kind)}" role="listitem">
          <div class="ai-history-main">
            <button type="button" class="ai-history-title" data-analysis="${esc(r.id)}" aria-pressed="${selected===r.id}">${esc(r.title)}</button>
            <span class="ai-history-time">创建 ${esc(historyTime(r.created_at))}${esc(historyWindow(r))}</span>
          </div>
          <span class="ai-history-progress">${esc(historyCounts(r))}</span>
          <span data-ai-history-badge class="ai-state ai-state-${esc(displayTaskStatus(r).kind)}">${esc(displayTaskStatus(r).text)}</span>
          <button type="button" class="a-button ai-history-delete" data-delete-analysis="${esc(r.id)}" aria-label="删除 ${esc(r.title)}">删除</button>
        </div>`).join('')}</div><p data-ai-history-empty hidden>当前筛选条件下没有历史分析。</p>`:'<p>尚无分析，点击开始后才会调用模型。</p>'}
          ${list.records.length?'<nav class="ai-history-pagination" data-ai-history-pagination aria-label="历史分析分页"><span data-ai-history-page-info aria-live="polite"></span><button class="a-button" type="button" data-ai-history-prev>上一页</button><button class="a-button" type="button" data-ai-history-next>下一页</button></nav>':''}</section>
        <section class="a-card ai-result" id="ai-report" data-detail><p>选择一条分析查看证据和建议。</p></section>
        <section class="a-card ai-review-workspace" id="ai-review" aria-labelledby="ai-review-title">
          <header class="ai-review-heading">
            <div><span class="ai-review-eyebrow">ACTION REVIEW</span><h2 id="ai-review-title">行动复盘</h2></div>
            <span>记录执行 → 观察效果 → 人工复盘</span>
          </header>
          <div class="ai-review-panel">
            <div class="ai-review-subheading"><h3>待复盘行动</h3><span>按完整观察期与数据水位判断资格；人工启动可能产生费用</span></div>
            ${renderAIReviewQueue(reviewQueue,{esc})}
          </div>
          <div class="ai-review-history">
            <div class="ai-review-subheading"><h3>复盘记录</h3><span>${reviews.retrospectives.length} 条</span></div>
            ${reviews.retrospectives.map(r=>`<article class="ai-review-history-item">
              <div class="ai-review-history-primary"><strong>${esc(r.analysis_title||'未命名分析')}</strong>${r.created_at?`<time>${esc(day(Number(r.created_at)))} · UTC+7</time>`:''}</div>
              <p class="ai-review-history-conclusion">${esc(r.conclusion||'暂无结论')}</p>
              <p class="ai-review-history-meta">置信度：${esc(r.confidence||'未提供')} · ${r.has_causality?'有因果证据':'观测变化，未证明因果'}</p>
              ${r.lessons_learned?`<p class="ai-review-history-lessons">经验：${esc(r.lessons_learned)}</p>`:''}
            </article>`).join('')||'<p class="ai-review-history-empty">暂无复盘记录。首次完成复盘后，这里将显示结果与经验。</p>'}
          </div>
        </section>
        </div>`;
      const moduleHost=host.querySelector('[data-ai-growth-modules]');
      if(moduleHost)disposeGrowthModules=mountAIGrowthModulesPanel(moduleHost,{esc});
      const analysisDialog=host.querySelector('#ai-new-analysis');
      const analysisForm=host.querySelector('[data-ai-form]');
      const selectedSkill=analysisForm.elements?.skillId;
      if(selectedSkill)selectedSkill.onchange=()=>{
        if(selectedSkill.value==='content-growth'){
          analysisForm.elements.goal.value='conversion';
          analysisForm.elements.source.value='all';
        }
      };
      if(launch?.kind==='seo'&&selectedSkill){
        selectedSkill.value='seo-organic';
        analysisForm.elements.goal.value='activation';
        analysisForm.elements.source.value='all';
        analysisForm.elements.title.value='SEO 自然搜索增长专项分析';
        const details=['请基于已授权的 Search Console 数据与站内激活漏斗调查搜索增长机会。',
          '资源：'+String(launch.site||'已选站点'),
          '已观察数据期：'+String(launch.start||'未知')+' 至 '+String(launch.end||'未知'),
          '必须核对 Google 数据是否已同步、日期覆盖、搜索查询匿名化及站内转化归因；不得把搜索点击直接视作注册或交易。'];
        analysisForm.elements.question.value=details.join('\n').slice(0,5000);
        analysisDialog.showModal();
      }
      if(!launch&&selectedSkill&&new URLSearchParams(window.location.search).get('skill')==='content-growth'&&!contentPresetConsumed){
        contentPresetConsumed=true;
        selectedSkill.value='content-growth';
        analysisForm.elements.goal.value='conversion';
        analysisForm.elements.source.value='all';
        analysisForm.elements.title.value='X 官方账号内容增长专项分析';
        analysisForm.elements.question.value='结合两个官方账号近30天已采集的浏览、回复/转发/点赞率、内容摘要及真实24/48小时快照，识别采集覆盖和发布节奏问题，提出2-3个可验证的选题或格式实验。明确数据量、时间差、缺失快照及站内转化归因限制，不计算X推荐算法分数。';
        analysisDialog.showModal();
      }
      host.querySelector('[data-open-analysis]')?.addEventListener('click',()=>analysisDialog.showModal());
      host.querySelector('[data-close-analysis]')?.addEventListener('click',()=>analysisDialog.close());
      host.querySelector('[data-health]').onclick=async()=>{try{const state=await getAgentHealth();if(token===generation)host.querySelector('[data-health-result]').textContent=JSON.stringify(state,null,2);}catch(error){if(token===generation)message(error.message);}};
      host.querySelector('[data-refresh]').onclick=()=>draw();
      host.querySelectorAll('[data-ready-review]').forEach(button=>button.onclick=()=>startReview(button.dataset.readyReview,button,token));
      host.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>open(b.dataset.analysis));
      const deleteDialog=host.querySelector('.ai-delete-dialog');
      const deleteConfirm=host.querySelector('[data-delete-confirm]');
      let deleteTarget=null;
      host.querySelectorAll('[data-delete-analysis]').forEach(button=>button.onclick=()=>{
        deleteTarget=button.dataset.deleteAnalysis;
        deleteDialog.showModal();
        host.querySelector('[data-delete-cancel]').focus();
      });
      host.querySelector('[data-delete-cancel]').onclick=()=>deleteDialog.close();
      deleteConfirm.onclick=async()=>{
        const id=deleteTarget;
        if(!id||deleteConfirm.disabled)return;
        deleteConfirm.disabled=true;
        try {
          await deleteAnalysis(id);
          if(token===generation){
            const scrollY=window.scrollY;
            deleteDialog.close();
            if(selected===id)selected=null;
            message('已从历史分析中删除');await draw();
            window.scrollTo({top:scrollY,behavior:'instant'});
          }
        } catch(error){if(token===generation){deleteDialog.close();message('删除失败：'+error.message);}}
        finally{if(deleteConfirm.isConnected)deleteConfirm.disabled=false;}
      };
      const historySelect=host.querySelector('[data-ai-history-filter]');
      if(historySelect){
        historySelect.addEventListener('change',()=>{
          historyFilter=historySelect.value;
          historyPage=0;
          applyHistoryFilter();
        });
        applyHistoryFilter();
      }
      const previousPage=host.querySelector('[data-ai-history-prev]');
      const nextPage=host.querySelector('[data-ai-history-next]');
      if(previousPage)previousPage.onclick=()=>{if(historyPage>0){historyPage--;applyHistoryFilter()}};
      if(nextPage)nextPage.onclick=()=>{historyPage++;applyHistoryFilter()};
      host.querySelector('[data-ai-form]').onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;
        const form=new FormData(e.target),requestKey=crypto.randomUUID();
        defaults.start=form.get('start');defaults.end=form.get('end');
        try{
          const result=await createBusinessAnalysis({requestKey,title:form.get('title'),dateRangeStart:timestamp(defaults.start),dateRangeEnd:timestamp(defaults.end)+DAY,
            businessScope:{source:form.get('source').trim()||'all'},focusGoal:form.get('goal'),userQuestion:form.get('question'),modelMode:form.get('modelMode'),skillId:form.get('skillId')||null});
          if(token!==generation)return;
          selected=result.analysisId;historyPage=0;await draw();
        }catch(error){if(token===generation)message(error.message);}
        finally{busy=false;if(button.isConnected)button.disabled=false;const current=$('#as-output')?.querySelector('[data-ai-form] button');if(current)current.disabled=false;}
      };
      if(selected){await open(selected);if(launch?.kind==='analysis')host.querySelector('#ai-report')?.scrollIntoView({block:'start'});}
    }catch(error){if(token===generation)host.innerHTML=`<section class="a-card"><p>${esc(error.message)}</p><button class="a-button" data-retry>重新加载</button></section>`;host.querySelector('[data-retry]')?.addEventListener('click',draw);}
  }
  async function open(id){
    selected=id;clearTimeout(timer);
    const token=generation,request=++detailRequest;
    const loadingPanel=$('#as-output')?.querySelector('[data-detail]');
    if(loadingPanel&&displayedDetailId!==id)loadingPanel.innerHTML=loadingState('正在读取分析详情…');
    $('#as-output')?.querySelectorAll('[data-ai-history-row]').forEach(row=>{
      row.querySelector('[data-analysis]')?.setAttribute('aria-pressed',String(row.dataset.analysisId===id));
    });
    try{
      const r=await getAnalysisDetail(id);
      if(token!==generation||request!==detailRequest||selected!==id)return;
      const panel=$('#as-output').querySelector('[data-detail]');if(!panel)return;
      displayedDetailId=id;
      panel.innerHTML=`<div class="ai-detail-heading"><h2 data-detail-title>${esc(r.title)} · ${esc(label(r.status))}</h2><span data-detail-badge class="ai-state ai-state-${esc(displayTaskStatus(r).kind)}">${esc(displayTaskStatus(r).text)}</span></div>
      ${r.error_message?`<p role="alert">${esc(r.error_message)}</p>`:''}
      <p data-checkpoint-result role="status">正在读取调查检查点…</p>
      ${r.status==='failed'&&!r.cancel_requested?'<button class="a-button" data-retry-analysis disabled title="正在核对调查检查点">检查后重试</button>':''}
      ${['pending','processing'].includes(r.status)&&!r.cancel_requested?'<button class="a-button" type="button" data-cancel-analysis>取消任务</button>':''}
      ${r.cancel_requested?'<p role="status">任务已取消，不会继续新的模型调用；先前发出的请求仍可能计费。</p>':''}
      <p class="ai-detail-lead" data-detail-summary>${esc(r.result?.summary||(r.status==='failed'?'分析未完成；请查看失败原因和检查点后再决定下一步。':r.status==='processing'?'分析正在进行。':r.status==='completed'?'已完成；暂无摘要。':'任务已排队；请确认 AI Worker 正在运行。'))}</p>
      ${(r.result?.keyFindings||[]).length?`<section class="ai-findings" aria-label="关键发现"><h3>关键发现</h3><ul>${r.result.keyFindings.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></section>`:''}
      ${r.result?.routing?`<p>调查方式：${esc(r.result.routing.reason)}</p>`:''}
      <section class="ai-action-list" aria-label="人工决策与执行">
        <div class="ai-action-list-heading"><h3>行动建议</h3><span>${(r.suggestions||[]).length} 条</span></div>
        ${(r.suggestions||[]).length?(r.suggestions||[]).map(item=>renderAISuggestion(item,{esc,json,label,offset:OFFSET})).join(''):'<p class="a-muted">尚无可执行行动建议；不代表业务没有问题。</p>'}
      </section>
      ${r.status==='completed'&&(r.suggestions||[]).length?'<button type="button" class="a-button" data-import-to-opportunities>将本次证据建议归入机会池（不调用模型）</button>':''}
      <details class="ai-evidence-index"><summary>原始业务证据 · ${(r.result?.evidenceIds||[]).length} 项</summary>
        <p class="a-muted">选择证据编号查看原始指标及数据覆盖说明。</p>
        <div class="ai-evidence-links">${(r.result?.evidenceIds||[]).map(eid=>`<button class="a-button" data-evidence="${esc(eid)}">证据 ${esc(eid.slice(0,8))}</button>`).join('')}</div>
        <pre data-evidence-result></pre>
      </details>
      <details class="ai-data-appendix"><summary>业务快照、目标优先级及模型调用记录</summary><pre>${json({snapshot:r.data_snapshot,calls:r.result?.calls})}</pre></details>`;
      panel.querySelector('[data-import-to-opportunities]')?.addEventListener('click',async event=>{
        const button=event.currentTarget;button.disabled=true;
        try{
          const outcome=await importAnalysisOpportunities(id);
          if(token===generation&&request===detailRequest&&selected===id){
            message('已归档 '+outcome.inserted.length+' 项建议，跳过 '+outcome.skipped.length+' 项证据不足的建议。');
            await draw();
          }
        }catch(error){if(token===generation)message('机会归档失败：'+error.message)}
        finally{if(button.isConnected)button.disabled=false;}
      });
      // Diagnostics are owner-scoped and intentionally do not expose model prompts.
      getJobCheckpoint(id).then(checkpoint=>{
        if(token!==generation||request!==detailRequest||selected!==id||!panel.isConnected)return;
        const target=panel.querySelector('[data-checkpoint-result]');
        if(!target)return;
        const reasons={
          'work-in-progress':'模型调用或调查工具正在执行，请稍候',
          'unresolved-paid-call':'模型调用状态未确认，必须人工核查，不能直接重试',
          'tool-execution-incomplete':'调查工具执行不完整，尚不允许自动续跑',
          'requires-validation-before-resume':'调查记录已保存，但尚未完成恢复验证',
          'noncontiguous-rounds':'调查步骤记录不连续，需人工核查'
        };
        const state=displayTaskStatus(r,checkpoint);
        const title=panel.querySelector('[data-detail-title]');
        if(title)title.textContent=r.title+' · '+state.text;
        const badge=panel.querySelector('[data-detail-badge]');
        if(badge){badge.textContent=state.text;badge.className='ai-state ai-state-'+state.kind;}
        const rows=[...$('#as-output').querySelectorAll('[data-ai-history-row]')];
        rows.forEach(row=>row.querySelector('[data-analysis]')?.setAttribute('aria-pressed',String(row.dataset.analysisId===id)));
        const historyRow=rows.find(el=>el.dataset.analysisId===id);
        if(historyRow){
          historyRow.dataset.aiHistoryStatus=state.kind;
          const rowBadge=historyRow.querySelector('[data-ai-history-badge]');
          if(rowBadge){rowBadge.textContent=state.text;rowBadge.className='ai-state ai-state-'+state.kind;}
        }
        applyHistoryFilter();
        if(checkpoint.requiresHumanReview){
          const summary=panel.querySelector('[data-detail-summary]');
          if(summary&&!r.result?.summary)summary.textContent='调查需要人工核查，尚未形成完整结论。请检查未完成工具和模型调用状态。';
        }
        if(!shouldPollTask(r,checkpoint)){clearTimeout(timer);timer=null;}
        const retry=panel.querySelector('[data-retry-analysis]');
        if(retry){
          const safe=canOfferTaskRetry(r,checkpoint);
          retry.disabled=!safe;
          retry.textContent=safe?'确认后重试（可能产生费用）':'暂不可安全重试';
          retry.title=safe?'请先确认已发起的模型调用和费用':'检查点状态未确认或存在未完成的模型调用';
        }
        if(canOfferTaskResume(r,checkpoint)){
          const existing=panel.querySelector('[data-resume-analysis]');
          if(!existing){
            const button=document.createElement('button');
            button.className='a-button';button.type='button';button.dataset.resumeAnalysis=id;
            button.textContent='人工确认后恢复（可能产生费用）';
            button.onclick=async()=>{
              if(busy)return;
              busy=true;button.disabled=true;
              try{
                const latest=await getJobCheckpoint(id);
                if(!canOfferTaskResume(r,latest)){
                  message('检查点已变化或无法确认恢复安全性，请先重新核查任务。');
                  return;
                }
                const confirmed=globalThis.confirm?.(
                  '这项调查有已保存的模型调用记录。恢复会再次验证已有检查点；如果后续需要新的模型轮次，可能产生费用。确定人工恢复吗？'
                );
                if(confirmed!==true)return;
                const task=await resumeAnalysis(id);
                message(task.notice||'已提交人工恢复请求；新模型调用仍可能计费。');
                if(token===generation&&selected===id)await open(id);
              }catch(error){message(error.message)}
              finally{busy=false;if(button.isConnected)button.disabled=false}
            };
            target.after(button);
          }
        }
        target.textContent=(state.kind==='attention'?'需要人工处理 · ':'调查检查点 · ')+
          (checkpoint.reason?(reasons[checkpoint.reason]||checkpoint.reason)+' · ':'')+
          '已保存模型轮次：'+(checkpoint.completedRounds??'未知')+
          ' · 工具结果：'+(checkpoint.completedTools??'未知')+
          ' · 待完成工具：'+(checkpoint.pendingTools??'未知')+
          (checkpoint.leaseExpired?' · 执行租约已过期':'')+
          (state.kind==='attention'?' · 不会自动续跑；需人工核查后操作':'');
      }).catch(error=>{
        if(token===generation&&request===detailRequest&&selected===id&&panel.isConnected){
          clearTimeout(timer);timer=null;
          const target=panel.querySelector('[data-checkpoint-result]');
          if(target)target.textContent='检查点暂不可用：'+error.message+'。已暂停自动状态刷新，请人工确认。';
          const retry=panel.querySelector('[data-retry-analysis]');
          if(retry){retry.disabled=true;retry.textContent='暂不可安全重试';}
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
      panel.querySelector('[data-retry-analysis]')?.addEventListener('click',async()=>{
        if(busy)return;
        busy=true;
        const button=panel.querySelector('[data-retry-analysis]');
        if(button)button.disabled=true;
        try{
          const latest=await getJobCheckpoint(id);
          if(!canOfferTaskRetry(r,latest)){
            message('检查点已变化或存在可能的付费调用，禁止直接重试。');
            return;
          }
          const confirmed=globalThis.confirm?.(
            '调查记录未显示已发起的模型调用；后端仍会检查共享付费账本。重试可能产生新的模型费用，确定继续吗？'
          );
          if(confirmed!==true)return;
          await retryAnalysis(id);
          if(token===generation&&selected===id)await open(id);
        }catch(error){message(error.message)}
        finally{busy=false;if(button?.isConnected)button.disabled=false}
      });
      panel.querySelectorAll('[data-suggestion]').forEach(form=>form.onsubmit=async e=>{
        e.preventDefault();
        if(busy)return;
        const state=e.submitter?.value;
        if(!['adopted','executing','executed','rejected'].includes(state))return;
        const data=new FormData(form);
        const note=String(data.get('note')||'').trim();
        const at=data.get('executedAt');
        if(state==='rejected'&&!note){
          message('请填写拒绝原因，便于之后追溯决策。');
          form.elements?.namedItem?.('note')?.focus?.();
          return;
        }
        if(state==='executed'&&!note){
          message('请记录实际执行的动作，不能只把建议标记为完成。');
          form.elements?.namedItem?.('note')?.focus?.();
          return;
        }
        const executedAt=state==='executed'&&at?Date.parse(at+':00+07:00'):undefined;
        if(at&&state==='executed'&&!Number.isFinite(executedAt)){
          message('执行时间格式无效，请核对后重试。');
          return;
        }
        busy=true;
        const buttons=[...(form.querySelectorAll?.('button')||[])];
        buttons.forEach(button=>button.disabled=true);
        try{
          await updateSuggestionStatus(form.dataset.suggestion,{
            userStatus:state,
            actualAction:state==='executed'?note:undefined,
            rejectionReason:state==='rejected'?note:undefined,
            executedAt
          });
          if(token===generation&&request===detailRequest)await draw();
        }catch(error){message(error.message)}
        finally{
          busy=false;
          buttons.forEach(button=>{if(button.isConnected)button.disabled=false});
        }
      });
      panel.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>startReview(button.dataset.review,button,token));
       if(shouldPollTask(r))timer=setTimeout(()=>open(id),3000);
    }catch(error){
      if(token!==generation||request!==detailRequest||selected!==id)return;
      displayedDetailId=null;
      const panel=$('#as-output')?.querySelector('[data-detail]');
      if(panel){
        panel.innerHTML=viewState({kind:'error',title:'分析详情加载失败',
          description:error.message||String(error),actionLabel:'重新读取详情',actionAttr:'data-ai-detail-retry'});
        panel.querySelector?.('[data-ai-detail-retry]')?.addEventListener?.('click',()=>open(id));
      }
      message(error.message);
    }
  }
  async function startReview(suggestionId,button,token){
    if(busy||reviewPolling||!suggestionId)return;
    const accepted=globalThis.confirm?.(
      '复盘仅检查已经执行并满足观察条件的行动，可能产生新的模型费用。后端会再次校验业务数据水位和任务幂等性。确定发起吗？'
    );
    if(accepted!==true)return;
    busy=true;
    if(button)button.disabled=true;
    try{
      const response=await createRetrospective(suggestionId,crypto.randomUUID());
      if(token!==generation)return;
      if(response.status==='completed'){
        message('该建议已有已保存的复盘结果，正在重新读取记录。');
        await draw();
        return;
      }
      if(!response.jobId){
        message('服务端未返回可查询的复盘任务编号，请检查运行记录。');
        return;
      }
      message('复盘请求已入队，正在检查执行进度。');
      reviewPolling=true;
      void pollReview(response.jobId,token);
    }catch(error){
      if(token===generation)message('复盘请求未完成：'+error.message);
    }finally{
      busy=false;
      if(button?.isConnected)button.disabled=false;
    }
  }
  async function pollReview(id,token){
    if(token!==generation)return;
    try{
      const job=await getJobStatus(id);
      if(token!==generation)return;
      if(job.state==='completed'){
        reviewPolling=false;
        reviewTimer=null;
        message('复盘已完成，正在更新复盘记录。');
        await draw();
        return;
      }
      if(job.state==='failed')throw Error(job.error||'复盘失败');
      const progress=Number(job.progress);
      message('复盘状态：'+(Number.isFinite(progress)?'进度 '+Math.max(0,Math.min(100,progress))+'%':'等待执行结果')+'。可能产生模型费用。');
      reviewTimer=setTimeout(()=>pollReview(id,token),3000);
    }catch(error){
      reviewPolling=false;
      reviewTimer=null;
      if(token===generation)message('复盘状态读取失败：'+error.message+'。不会自动重新发起复盘。');
    }
  }
    return {draw,dispose};
}
