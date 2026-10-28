// Shared presentational states. These never fetch data or silently retry requests.
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

const KINDS=new Set(['error','empty','partial','unavailable']);
const ACTIONS=new Set(['data-view-retry','data-work-refresh','data-home-retry','data-funnel-retry','data-paths-retry','data-trade-retry','data-segments-retry','data-channels-retry','data-page-retry','data-ci-retry','data-op-retry','data-ot-retry']);

export function viewState({kind='empty',title,description='',actionLabel='',actionAttr=''}={}){
  const type=KINDS.has(kind)?kind:'empty';
  const button=actionLabel&&ACTIONS.has(actionAttr)
    ?`<button class="a-button ${type==='error'?'a-primary':''}" type="button" ${actionAttr}>${escapeHtml(actionLabel)}</button>`
    :'';
  return `<section class="a-card si-panel ui-view-state ui-view-state-${type}" role="${type==='error'?'alert':'status'}">
    <div class="ui-view-state-heading"><span class="ui-view-state-symbol" aria-hidden="true">${type==='error'?'!':type==='partial'?'~':'–'}</span>
    <h2>${escapeHtml(title||'当前暂无数据')}</h2></div>
    ${description?`<p>${escapeHtml(description)}</p>`:''}
    ${button}
  </section>`;
}
