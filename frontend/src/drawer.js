import {remotePageCorrection,normalizeRemoteTotal,lastRemotePage} from './components/remotePaging.js'

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
/** One accessible modal drawer for all user drill-downs. */
export function createDrawer(dialog, {onAnalyze,onAnalyzeRemote,getContext,onUserProfile,titleId='as-drawer-title'} = {}) {
  let origin=null,epoch=0,cancelPendingSearch=()=>{}
  const close=()=>{cancelPendingSearch();epoch++;if(dialog.open)dialog.close();if(origin?.isConnected)origin.focus({preventScroll:true})}
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}},true)
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()})
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close()}})
  return {
    close,
    openSummary({title,description,html,onAction}) {
      const session=++epoch;origin=document.activeElement
      dialog.innerHTML=`<div class="a-drawerhead"><div><h2 id="${titleId}">${escapeHtml(title)}</h2><p class="a-muted">${escapeHtml(description)}</p></div><button class="a-button" data-close>关闭</button></div><div data-summary-body>${html}</div>`
      dialog.querySelector('[data-close]').onclick=close
      const update=body=>{if(session!==epoch)return;const host=dialog.querySelector('[data-summary-body]');host.innerHTML=body;host.querySelectorAll('[data-summary-action]').forEach(b=>b.onclick=()=>onAction?.(b.dataset.summaryAction))}
      update(html);if(!dialog.open)dialog.showModal();dialog.querySelector('[data-close]').focus()
      return update
    },
    open({title,description,rows,columns,renderRow,onUser,note='',context}) {
      epoch++;const analysisContext=context??getContext?.()
      rows=[...new Map(rows.map(row=>[(row.u??row).id,row])).values()]
      origin=document.activeElement
      let page=0,query='',pageSize=12
      dialog.innerHTML=`<div class="a-drawerhead"><div><h2 id="${titleId}">${escapeHtml(title)}</h2><p class="a-muted">${escapeHtml(description)} · ${rows.length} 位用户</p></div><button class="a-button" data-close>关闭</button></div><label class="a-drawer-search">搜索用户或来源<input type="search" placeholder="输入用户ID或来源" aria-label="搜索下钻用户"></label><div class="a-audience-actions" data-audience-actions></div><div data-remote-actions></div><div data-list></div><div class="a-drawer-pagination"><span data-count role="status"></span><div><button class="a-button" data-prev>上一页</button><button class="a-button" data-next>下一页</button></div></div><p class="a-muted">${escapeHtml(note)}</p><div id="as-timeline" aria-live="polite"></div>`
      const select=s=>dialog.querySelector(s)
      const render=()=>{
        const filtered=rows.filter(row=>{const u=row.u??row;return `${u.id} ${row.displaySource??u.source??''}`.toLowerCase().includes(query.toLowerCase())})
        const actions=select('[data-audience-actions]')
        actions.innerHTML=onAnalyze?`<span>分析筛选出的 ${filtered.length} 位用户</span><button class="a-button" data-analyze="funnel" ${filtered.length?'':'disabled'}>查看漏斗</button><button class="a-button" data-analyze="paths" ${filtered.length?'':'disabled'}>查看行为路径</button><button class="a-button" data-analyze="retention" ${filtered.length?'':'disabled'}>查看留存</button>`:''
        actions.querySelectorAll('[data-analyze]').forEach(button=>button.onclick=()=>{close();onAnalyze({title,description,rows:filtered,context:analysisContext,query,mode:button.dataset.analyze})})
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
    /**
     * Server-paginated drill for aggregated backend mode.
     * fetchPage({offset,limit,q}) → {total,rows:[{id,source,...}]}
     * fetchTimeline(userId, hostEl) optional.
     */
    openRemote({title,description,note='',columns=['用户','来源','首次事件'],fetchPage,fetchTimeline,renderRow,onRowAction,pageSize=12,entity='用户',selection,profileContext}) {
      cancelPendingSearch();
      const session=++epoch;origin=document.activeElement
      let page=0,query='',total=0,rows=[],loading=false,error=null,request=0
      dialog.innerHTML=`<div class="a-drawerhead"><div><h2 id="${titleId}">${escapeHtml(title)}</h2><p class="a-muted" data-desc>${escapeHtml(description)}</p></div><button class="a-button" data-close>关闭</button></div><label class="a-drawer-search">${entity==='用户'?'搜索用户或来源':entity==='关系'?'搜索关系ID或原因':'搜索用户、尝试ID或订单ID'}<input type="search" placeholder="${entity==='用户'?'输入用户ID或来源':entity==='关系'?'输入关系ID或原因':'输入用户ID、尝试ID或订单ID'}" aria-label="搜索下钻用户"></label><div data-remote-actions></div><div data-list></div><div class="a-drawer-pagination"><span data-count role="status"></span><div><button class="a-button" data-prev>上一页</button><button class="a-button" data-next>下一页</button></div></div><p class="a-muted">${escapeHtml(note||'名单由服务端分页返回，与汇总指标同口径。')}</p><div id="as-timeline" aria-live="polite"></div>`
      const select=s=>dialog.querySelector(s)
      const renderRows=()=>{
        const pages=lastRemotePage(total,pageSize)+1
        select('[data-desc]').textContent=loading?`${description} · 加载中…`:`${description} · ${total} ${entity==='用户'?'位用户':'条'+entity}`
        select('[data-list]').innerHTML=loading?'<p class="a-muted si-loading" role="status">加载中…</p>':error?`<div class="a-empty" role="alert"><p>名单加载失败：${escapeHtml(error)}</p><button class="a-button" type="button" data-remote-retry>重新加载当前页</button></div>`:rows.length?`<div class="a-scroll"><table><thead><tr>${columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>{
          const id=r.id||r.user_id
          const src=r.source||'未知'
          const first=r.first_event_at?new Date(r.first_event_at+7*3600000).toISOString().slice(5,16).replace('T',' '):'—'
          if(renderRow)return `<tr>${renderRow(r).map(cell=>`<td>${cell}</td>`).join('')}</tr>`
          return `<tr><td><button class="a-tablelink cursor-interaction" data-user="${escapeHtml(id)}">${escapeHtml(id)}</button></td><td>${escapeHtml(src)}</td><td>${escapeHtml(first)}</td></tr>`
        }).join('')}</tbody></table></div>`:`<p class="a-empty">没有匹配的${escapeHtml(entity)}。</p>`
        select('[data-count]').textContent=loading?`加载中…`:`共 ${total} ${entity==='用户'?'人':'条'+entity} · 第 ${page+1} / ${pages} 页`
        select('[data-prev]').disabled=loading||!!error||page===0
        select('[data-next]').disabled=loading||!!error||page>=pages-1
        select('[data-remote-retry]')?.addEventListener?.('click',()=>load())
        const actions=select('[data-remote-actions]')
        actions.innerHTML=selection&&entity==='用户'&&onAnalyzeRemote?`<p class="a-muted">使用当前搜索匹配的全部 ${total} 位用户，包含所有分页</p><div class="a-audience-actions">${[['segments','用户分群'],['paths','行为路径'],['funnel','漏斗'],['trade-monitor','交易问题'],['retention','留存'],['referral','推荐贡献']].map(([m,l])=>`<button class="a-button" data-remote-go="${m}" ${loading||error||!total?'disabled':''}>${l}</button>`).join('')}<button class="a-button" data-remote-go="save" ${loading||error||!total?'disabled':''}>保存为用户群组</button></div><p data-remote-status role="status"></p>`:''
        actions.querySelectorAll('[data-remote-go]').forEach(b=>b.onclick=async()=>{const status=actions.querySelector('[data-remote-status]');actions.querySelectorAll('button').forEach(x=>x.disabled=true);try{await onAnalyzeRemote({selection,title,description,query,mode:b.dataset.remoteGo});if(b.dataset.remoteGo==='save'){status.textContent='已保存用户群组，可在用户分群侧栏使用';actions.querySelectorAll('button').forEach(x=>x.disabled=false)}else close()}catch(e){status.textContent=e.message;actions.querySelectorAll('button').forEach(x=>x.disabled=false)}})
        select('#as-timeline').innerHTML=''
        dialog.querySelectorAll('[data-row-action]').forEach(button=>button.onclick=()=>onRowAction?.(button.dataset.rowAction))
        dialog.querySelectorAll('[data-user]').forEach(button=>button.onclick=()=>{
          if(onUserProfile&&/^(?:user:)?[1-9]\d{0,19}$/.test(button.dataset.user)){onUserProfile(button.dataset.user,{...getContext?.(),...(selection?.cache_id?{cache_id:selection.cache_id}:{}),...Object.fromEntries(Object.entries(profileContext||{}).filter(([,v])=>v!=null))});return}
          if(fetchTimeline){const parent=select('#as-timeline'),host=document.createElement('div');parent.replaceChildren(host);fetchTimeline(button.dataset.user,host)}
        })
      }
      const load=async()=>{
        // Debounced searches must not fetch after the dialog closes or is replaced.
        if(session!==epoch)return
        const currentRequest=++request;loading=true;error=null;renderRows()
        try{
          const result=await fetchPage({offset:page*pageSize,limit:pageSize,q:query})
          if(currentRequest!==request||session!==epoch)return
          total=normalizeRemoteTotal(result.total)
          const correction=remotePageCorrection({page,total,pageSize})
          if(correction.refetch){
            // The current page disappeared (e.g. after a record was removed).
            // Request the final real page instead of displaying a false empty list.
            page=correction.page
            return await load()
          }
          page=correction.page
          rows=Array.isArray(result.rows)?result.rows:[]
        }catch(err){
          if(currentRequest!==request||session!==epoch)return
          total=0;rows=[];error=err.message||String(err)
        }finally{
          if(currentRequest===request&&session===epoch){loading=false;renderRows()}
        }
      }
      select('[data-close]').onclick=close
      let searchTimer=null
      cancelPendingSearch=()=>{clearTimeout(searchTimer);searchTimer=null}
      select('input').oninput=event=>{
        if(session!==epoch)return
        query=event.target.value;page=0
        // Invalidate the old result immediately, before the debounce runs:
        // stale rows must not be actionable under a newly typed query.
        ++request;loading=true;error=null;rows=[];renderRows()
        cancelPendingSearch()
        searchTimer=setTimeout(()=>{searchTimer=null;load()},200)
      }
      select('[data-prev]').onclick=()=>{if(page>0){page--;load()}}
      select('[data-next]').onclick=()=>{page++;load()}
      if(!dialog.open)dialog.showModal()
      select('input').focus()
      load()
    },
  }
}
