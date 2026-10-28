/**
 * Shared analytics table shell.
 *
 * Headers and cells are pre-rendered HTML fragments produced by trusted page
 * renderers; pages must escape any user/database text before passing them in.
 * Keep interactive cells (drill buttons, user links) intact.
 */
export function renderDataTable(headers,rows,{emptyLabel='暂无可展示的明细记录；数据缺失不等于零'}={}){
  const cols=Math.max(1,headers.length);
  const body=rows.length
    ?rows.map(cells=>`<tr>${cells.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')
    :`<tr class="data-table-empty"><td colspan="${cols}">${emptyLabel}</td></tr>`;
  return `<div class="a-scroll data-table-scroll" role="region" aria-label="数据明细" tabindex="0">
    <table><thead><tr>${headers.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody></table>
  </div>`;
}
