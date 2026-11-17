/**
 * Decision-first action cards for saved AI findings. Never invent metrics,
 * verified evidence, impact scores or execution status.
 */
export function renderAISuggestion(s,{esc,json,label,offset=7*3600000}){
  const status=s.user_status||'unknown';
  const editable=Boolean(s.id)&&['pending','adopted','executing'].includes(status);
  const statuses={pending:'待审批',adopted:'已采纳',executing:'执行中',executed:'已记录执行',rejected:'已拒绝'};
  const rawAt=Number(s.executed_at);
  const executedAt=s.executed_at!=null&&Number.isFinite(rawAt)&&rawAt>0&&rawAt<8.64e15
    ?new Date(rawAt+offset).toISOString().slice(0,16):'';
  const evidence={evidence:s.data_evidence,scope:s.applicable_scope,
    validation:s.validation_metrics,review:s.review_conditions,
    impact:s.expected_impact,basis:s.impact_basis};
  const uncertainties=Array.isArray(s.uncertainties)?s.uncertainties.filter(Boolean):[];
  const note=s.actual_action||s.rejection_reason||'';
  return `<article class="ai-suggestion" data-ai-suggestion-card="${esc(s.id||'')}">
    <header class="ai-suggestion-heading">
      <div><span class="ai-suggestion-eyebrow">行动建议</span>
        <h3>${esc(s.business_problem||'未提供明确业务问题')}</h3></div>
      <div class="ai-suggestion-tags"><span class="ai-suggestion-priority">${esc(s.priority||'优先级未定义')}</span>
        <span class="ai-suggestion-status">${esc(statuses[status]||label(status))}</span></div>
    </header>
    <section class="ai-suggestion-action" aria-label="建议采取的行动">
      <strong>建议行动</strong><p>${esc(s.action||'未提供可执行建议')}</p>
    </section>
    <dl class="ai-suggestion-reasoning">
      <div><dt>为什么优先处理</dt><dd>${esc(s.priority_reason||'暂无明确排序依据')}</dd></div>
      <div><dt>需要验证的假设</dt><dd>${esc(s.hypothesis||'尚未提供可验证的假设')}</dd></div>
      <div><dt>当前不确定性</dt><dd>${esc(uncertainties.length?uncertainties.map(v=>String(v).replace(/[。；\s]+$/u,'')).join('；'):'尚未列明不确定性；不能据此认定无风险')}</dd></div>
    </dl>
    <details class="ai-suggestion-evidence">
      <summary>查看数据证据、适用范围与验证标准</summary>
      <p>以下为已保存分析记录，不代表结论已被验证。</p>
      <pre>${json(evidence)}</pre>
    </details>
    ${editable?`<form data-suggestion="${esc(s.id)}" class="ai-suggestion-decision">
      <label>${status==='executing'?'实际执行内容 / 拒绝原因':'拒绝原因（仅拒绝时填写）'}
        <textarea name="note" maxlength="5000" placeholder="拒绝时说明理由；记录完成时填写实际执行的动作">${esc(note)}</textarea>
      </label>
      ${status==='executing'?`<label>实际执行时间（UTC+7）
        <input name="executedAt" type="datetime-local" value="${esc(executedAt)}">
      </label>`:''}
      <div class="ai-suggestion-choices">
        ${status==='pending'?'<button class="a-button a-primary" name="status" value="adopted">批准采纳</button>':''}
        ${status==='adopted'?'<button class="a-button a-primary" name="status" value="executing">开始执行</button>':''}
        ${status==='executing'?'<button class="a-button a-primary" name="status" value="executed">记录已执行</button>':''}
        <button class="a-button" name="status" value="rejected">拒绝</button>
      </div></form>`:`<div class="ai-suggestion-record" role="status">
      <strong>${status==='executed'?'已记录实际执行':'当前行动状态'}</strong>
      <p>${esc(note||(status==='rejected'?'尚无拒绝原因记录':'未提供执行记录'))}</p>
      ${executedAt?`<small>执行时间（UTC+7）：${esc(executedAt.replace('T',' '))}</small>`:''}
    </div>
    ${status==='executed'?`<button class="a-button" data-review="${esc(s.id)}">复盘执行效果</button>`:''}`}
  </article>`;
}
