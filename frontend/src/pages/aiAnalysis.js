import './aiAnalysis.css';
import {loadingState} from './loadingState.js';
import {createBusinessAnalysis,getAnalysisList,getAnalysisDetail,getJobStatus,updateSuggestionStatus,createRetrospective,getRetrospectives,getCostStats,retryAnalysis,getAgentHealth,getEvidence,getJobCheckpoint} from '../api/aiAnalysis.js';
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
      const [list,reviews,costs]=await Promise.all([getAnalysisList(),getRetrospectives(),getCostStats()]);
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
        <section class="a-card"><h2>历史分析</h2><button class="a-button" data-refresh>刷新</button>
        ${list.records.length?list.records.map(r=>`<p><button class="a-button" data-analysis="${esc(r.id)}">${esc(r.title)}</button> · ${esc(label(r.status))} · 建议 ${esc(r.suggestion_count)} 条</p>`).join(''):'<p>尚无分析，点击开始后才会调用模型。</p>'}</section>
        <section class="a-card" data-detail><p>选择一条分析查看证据和建议。</p></section>
        <section class="a-card"><h2>复盘记录</h2>${reviews.retrospectives.map(r=>`<article><h3>${esc(r.analysis_title)}</h3><p>${esc(r.conclusion)}</p><p>置信度：${esc(r.confidence)} · ${r.has_causality?'有因果证据':'观测变化，未证明因果'}</p><p>经验：${esc(r.lessons_learned||'尚无结论')}</p></article>`).join('')||'<p>记录行动后，可主动发起复盘。</p>'}</section></div>`;
      host.querySelector('[data-health]').onclick=async()=>{try{const state=await getAgentHealth();if(token===generation)host.querySelector('[data-health-result]').textContent=JSON.stringify(state,null,2);}catch(error){if(token===generation)message(error.message);}};
      host.querySelector('[data-refresh]').onclick=()=>draw();
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
      ${r.status==='failed'?'<button class="a-button" data-retry-analysis>重试分析</button>':''}
      <p>${esc(r.result?.summary||'任务已排队；请确认 AI Worker 正在运行。')}</p>
      ${(r.result?.keyFindings||[]).map(f=>`<p>${esc(f)}</p>`).join('')}
      ${r.result?.routing?`<p>调查方式：${esc(r.result.routing.reason)}</p>`:''}
      ${(r.result?.evidenceIds||[]).map(eid=>`<button class="a-button" data-evidence="${esc(eid)}">查看证据 ${esc(eid.slice(0,8))}</button>`).join('')}<pre data-evidence-result></pre>
      ${(r.suggestions||[]).map(s=>`<article class="ai-suggestion"><h3>${esc(s.priority)} · ${esc(s.business_problem)}</h3><p>${esc(s.action)}</p><p>排序依据：${esc(s.priority_reason)}</p><p>假设：${esc(s.hypothesis)}</p><p>不确定性：${esc((s.uncertainties||[]).join('；'))}</p>
        <details><summary>数据证据与验证条件</summary><pre>${json({evidence:s.data_evidence,scope:s.applicable_scope,validation:s.validation_metrics,review:s.review_conditions,impact:s.expected_impact,basis:s.impact_basis})}</pre></details>
        <p>状态：${esc(label(s.user_status))}</p><form data-suggestion="${esc(s.id)}">
        <label>实际行动 / 拒绝原因<textarea name="note" maxlength="5000">${esc(s.actual_action||s.rejection_reason||'')}</textarea></label>
        <label>实际执行时间（UTC+7）<input name="executedAt" type="datetime-local" value="${s.executed_at?new Date(Number(s.executed_at)+OFFSET).toISOString().slice(0,16):''}"></label>
        <button class="a-button" name="status" value="adopted">采纳</button><button class="a-button" name="status" value="executed">记录已执行</button><button class="a-button" name="status" value="rejected">拒绝</button></form>
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
