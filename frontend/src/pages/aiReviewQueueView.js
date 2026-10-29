/**
 * Review queue UI. "Ready" is backend-computed (three complete business
 * days + confirmed watermark), never inferred from the client clock.
 */
export function renderAIReviewQueue(queue,{esc}){
  if(queue?.error)return `<p class="ai-review-warning" role="alert">
    复盘排期暂不可用：${esc(queue.error)}。不能将读取失败视为没有待复盘行动。</p>`;
  const entries=Array.isArray(queue?.entries)?queue.entries:[];
  if(!entries.length)return `<div class="ai-review-empty" role="status">
    <div><strong>暂无待复盘行动</strong><p>建议记录实际执行后，满足观察期及数据水位要求才会进入此处。</p></div>
    <a class="a-button ai-review-jump" href="#ai-report">查看行动建议</a>
  </div>`;
  return `<div class="ai-review-queue" role="list">${entries.map(item=>{
    const ready=item.status==='ready'&&Boolean(item.suggestionId);
    const waiting=item.status==='waiting';
    const timestamp=Number(item.earliestReviewAt);
    const validTime=item.earliestReviewAt!=null&&Number.isSafeInteger(timestamp)&&timestamp>=0&&timestamp<8.64e15-7*3600000;
    const earliest=validTime?new Date(timestamp+7*3600000).toISOString().slice(0,10):'尚未确认';
    const status=ready?'已达到复盘条件':waiting?'等待观察期和数据水位':'资格待核查';
    return `<article class="ai-review-queue-item" role="listitem">
      <div class="ai-review-queue-body">
        <div class="ai-review-queue-primary">
          <strong>${esc(item.title||'未提供行动标题')}</strong>
          <span class="ai-review-queue-state ${ready?'is-ready':''}">${status}</span>
        </div>
        <p>${ready?'已达到复盘资格 · 结论仍须核对因果证据':
          waiting?'最早可复盘日期（UTC+7）：'+esc(earliest):
          '尚未确认复盘资格，需重新核查'}</p>
      </div>
      <div class="ai-review-queue-actions">
        ${item.analysisId?`<button class="a-button" type="button" data-analysis="${esc(item.analysisId)}">原始分析</button>`:''}
        ${ready?`<button class="a-button a-primary" type="button" data-ready-review="${esc(item.suggestionId)}">发起复盘 · 可能产生费用</button>`:''}
      </div>
    </article>`;
  }).join('')}</div>`;
}
