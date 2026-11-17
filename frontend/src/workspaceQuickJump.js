/**
 * Desktop-only workspace page switcher. Navigation is limited to existing
 * sidebar destinations, and no report filters, account IDs or tokens are read.
 */
export function searchWorkspaceViews(views,query='',limit=9){
  const terms=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return views.map((view,index)=>{
    const name=String(view.label||'').toLocaleLowerCase();
    const section=String(view.section||'').toLocaleLowerCase();
    const haystack=name+' '+section;
    if(!terms.every(term=>haystack.includes(term)))return null;
    const phrase=terms.join(' ');
    const score=terms.length===0?0:name===phrase?6:name.startsWith(phrase)?5:
      name.includes(phrase)?4:section.startsWith(phrase)?3:2;
    return {view,index,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index)
    .slice(0,Math.max(0,limit)).map(x=>x.view);
}

export function collectWorkspaceViews(root){
  const out=[],seen=new Set();
  for(const button of root.querySelectorAll('.app-sidebar [data-mode]')){
    const mode=button.dataset.mode;
    if(!mode||button.disabled||seen.has(mode))continue;
    const group=button.closest('.nav-cluster');
    const section=group?.querySelector('.nav-label')?.textContent?.trim()||'工作区';
    const label=button.textContent?.trim()||button.getAttribute('aria-label')||mode;
    seen.add(mode);
    out.push({mode,label,section});
  }
  return out;
}

export function mountWorkspaceQuickJump(root,navigate,{doc=globalThis.document,keyTarget=globalThis}={}){
  const toolbar=root.querySelector('.a-top');
  if(!toolbar||!doc)return {dispose(){}};
  const views=collectWorkspaceViews(root);
  const trigger=doc.createElement('button');
  trigger.type='button';
  trigger.className='a-button workspace-jump-trigger';
  trigger.setAttribute('aria-keyshortcuts','Meta+K Control+K');
  trigger.setAttribute('aria-label','快速跳转页面，快捷键 Command K 或 Ctrl K');
  trigger.innerHTML='<span aria-hidden="true">⌕</span><span>跳转页面</span><kbd>⌘ K / Ctrl K</kbd>';
  toolbar.insertBefore(trigger,toolbar.querySelector('#as-filter-toggle'));

  const dialog=doc.createElement('dialog');
  dialog.className='workspace-jump-dialog';
  dialog.setAttribute('aria-label','快速跳转工作区页面');
  dialog.innerHTML=`<div class="workspace-jump-head">
    <label for="workspace-jump-query">跳转到页面</label>
    <button class="workspace-jump-close" type="button" aria-label="关闭快速跳转">×</button>
    <input id="workspace-jump-query" type="search" autocomplete="off" spellcheck="false" placeholder="搜索模块或页面…" aria-controls="workspace-jump-results">
  </div>
  <div id="workspace-jump-results" class="workspace-jump-results" aria-live="polite"></div>
  <p class="workspace-jump-hint">输入页面名称筛选 · ↑↓ 选择 · Enter 打开 · Esc 关闭</p>`;
  root.appendChild(dialog);
  const input=dialog.querySelector('input');
  const resultList=dialog.querySelector('#workspace-jump-results');
  const buttons=()=>[...resultList.querySelectorAll('button[data-target-view]')];
  const close=()=>{if(dialog.open)dialog.close()};
  const render=()=>{
    const matched=searchWorkspaceViews(views,input.value);
    resultList.replaceChildren();
    if(!matched.length){
      const empty=doc.createElement('p');empty.className='workspace-jump-empty';
      empty.textContent='没有找到对应页面，请尝试其他关键词。';
      resultList.appendChild(empty);
      return;
    }
    for(const view of matched){
      const item=doc.createElement('button');
      item.type='button';item.className='workspace-jump-item';
      item.dataset.targetView=view.mode;
      const detail=doc.createElement('span');detail.className='workspace-jump-item-main';
      const label=doc.createElement('strong');label.textContent=view.label;
      const section=doc.createElement('small');section.textContent=view.section;
      detail.append(label,section);
      const icon=doc.createElement('span');icon.className='workspace-jump-item-arrow';
      icon.textContent='↵';icon.setAttribute('aria-hidden','true');
      item.append(detail,icon);
      item.addEventListener('click',()=>{
        const mode=item.dataset.targetView;
        close();
        navigate(mode);
        trigger.focus();
      });
      resultList.appendChild(item);
    }
  };
  const open=()=>{
    if(dialog.open)return;
    input.value='';render();
    dialog.showModal();input.focus();
  };
  const onKeydown=event=>{
    if(event.isComposing||!(event.metaKey||event.ctrlKey)||event.key?.toLowerCase()!=='k')return;
    event.preventDefault();
    if(dialog.open)close();else open();
  };
  const onDialogKeydown=event=>{
    if(event.key==='Escape')return; // native dialog close
    if(event.key==='Enter'&&doc.activeElement===input){
      const first=buttons()[0];if(first){event.preventDefault();first.click();}
    }
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    const list=buttons();
    if(!list.length)return;
    const index=list.indexOf(doc.activeElement);
    const next=event.key==='ArrowDown'?(index+1)%list.length:
      index<0?list.length-1:(index-1+list.length)%list.length;
    event.preventDefault();list[next].focus();
  };
  trigger.addEventListener('click',open);
  dialog.querySelector('.workspace-jump-close').addEventListener('click',close);
  input.addEventListener('input',render);
  dialog.addEventListener('keydown',onDialogKeydown);
  keyTarget.addEventListener?.('keydown',onKeydown);
  return {dispose(){
    keyTarget.removeEventListener?.('keydown',onKeydown);
    close();dialog.remove();trigger.remove();
  }};
}
