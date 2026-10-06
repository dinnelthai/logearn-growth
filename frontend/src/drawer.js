const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
/** One accessible modal drawer for all user drill-downs. */
export function createDrawer(dialog) {
  let origin=null
  const close=()=>{if(dialog.open)dialog.close();if(origin?.isConnected)origin.focus({preventScroll:true})}
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}},true)
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()})
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close()}})
  return {
    close,
    open({title,description,rows,columns,renderRow,onUser,note=''}) {
      origin=document.activeElement
      let page=0,query='',pageSize=12
      dialog.innerHTML=`<div class="a-drawerhead"><div><h2 id="as-drawer-title">${escapeHtml(title)}</h2><p class="a-muted">${escapeHtml(description)} · ${rows.length} 位用户</p></div><button class="a-button" data-close>关闭</button></div><label class="a-drawer-search">搜索用户或来源<input type="search" placeholder="输入用户ID或来源" aria-label="搜索下钻用户"></label><div data-list></div><div class="a-drawer-pagination"><span data-count role="status"></span><div><button class="a-button" data-prev>上一页</button><button class="a-button" data-next>下一页</button></div></div><p class="a-muted">${escapeHtml(note)}</p><div id="as-timeline" aria-live="polite"></div>`
      const select=s=>dialog.querySelector(s)
      const render=()=>{
        const filtered=rows.filter(row=>{const u=row.u??row;return `${u.id} ${row.displaySource??u.source??''}`.toLowerCase().includes(query.toLowerCase())})
        const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages-1)
        const shown=filtered.slice(page*pageSize,(page+1)*pageSize)
        select('[data-list]').innerHTML=shown.length?`<div class="a-scroll"><table><thead><tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${shown.map(row=>`<tr>${renderRow(row).map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="a-empty">没有匹配的用户。</p>'
        select('[data-count]').textContent=`共 ${filtered.length} 人 · 第 ${page+1} / ${pages} 页`
        select('[data-prev]').disabled=page===0;select('[data-next]').disabled=page>=pages-1
        select('#as-timeline').innerHTML=''
        dialog.querySelectorAll('[data-user]').forEach(button=>button.onclick=()=>onUser?.(button.dataset.user,select('#as-timeline')))
      }
      select('[data-close]').onclick=close
      select('input').oninput=event=>{query=event.target.value;page=0;render()}
      select('[data-prev]').onclick=()=>{page--;render()}
      select('[data-next]').onclick=()=>{page++;render()}
      render();if(!dialog.open)dialog.showModal();select('input').focus()
    },
  }
}
