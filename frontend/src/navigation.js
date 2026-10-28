// Existing internal mode aliases remain mapped to their navigation entry.
export const navigationMode=mode=>({referral:'channels','my-monitor':'home','login-conversion':'funnel','invite-conversion':'funnel','ai-analysis':'ai-analysis'}[mode]||mode)

export function mountSectionNavigation(root,navigate){
  const sections=[...root.querySelectorAll('[data-navigation-section]')];
  const parents=[...root.querySelectorAll('[data-section]')];
  const buttons=[...root.querySelectorAll('[data-mode]')];
  const remembered=new Map();
  const toggle=root.querySelector('[data-sidebar-toggle]');
  const backdrop=root.querySelector('[data-sidebar-backdrop]');
  const media=globalThis.matchMedia?.('(max-width: 900px)');
  const isMobile=()=>media?.matches??false;
  let activeKey=null;

  const setCollapsed=(collapsed,{restoreFocus=false}={})=>{
    root.classList.toggle('sidebar-collapsed',collapsed);
    toggle?.setAttribute('aria-expanded',String(!collapsed));
    toggle?.setAttribute('aria-label',collapsed?'展开导航':'收起导航');
    if(backdrop){
      backdrop.setAttribute('aria-hidden',String(collapsed||!isMobile()));
      backdrop.tabIndex=collapsed||!isMobile()?-1:0;
    }
    if(restoreFocus)toggle?.focus();
  };
  setCollapsed(isMobile());
  toggle?.addEventListener('click',()=>setCollapsed(!root.classList.contains('sidebar-collapsed')));
  backdrop?.addEventListener('click',()=>setCollapsed(true,{restoreFocus:true}));
  root.addEventListener?.('keydown',event=>{
    if(event.key==='Escape'&&isMobile()&&!root.classList.contains('sidebar-collapsed')){
      event.preventDefault();setCollapsed(true,{restoreFocus:true});
    }
  });
  media?.addEventListener?.('change',()=>setCollapsed(isMobile()));

  const closeMobile=()=>{if(isMobile())setCollapsed(true)};
  const findGroup=key=>sections.find(group=>group.dataset.navigationSection===key);
  const isSingle=group=>group?.dataset.single==='true';
  const visibleButtons=group=>[...(group?.querySelectorAll('[data-mode]')||[])]
    .filter(button=>!button.hidden&&!button.disabled);

  function update(mode){
    const canonical=navigationMode(mode);
    const current=sections.find(group=>[...group.querySelectorAll('[data-mode]')]
      .some(button=>button.dataset.mode===canonical));
    if(!current)return;
    activeKey=current.dataset.navigationSection;
    remembered.set(activeKey,mode);
    sections.forEach(group=>{group.hidden=isSingle(group)||group!==current});
    buttons.forEach(button=>{
      const selected=button.dataset.mode===canonical;
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-current',selected?'page':'false');
    });
    parents.forEach(button=>{
      const selected=button.dataset.section===activeKey;
      button.setAttribute('aria-pressed',String(selected));
      if(!isSingle(findGroup(button.dataset.section)))
        button.setAttribute('aria-expanded',String(selected));
    });
  }

  parents.forEach(button=>{
    button.onclick=()=>{
      const key=button.dataset.section,group=findGroup(key);
      if(!group)return;
      if(key===activeKey&&!isSingle(group)){
        // Clicking an already-active parent toggles its nested page list.
        group.hidden=!group.hidden;
        button.setAttribute('aria-expanded',String(!group.hidden));
        return;
      }
      const choices=visibleButtons(group);
      const last=remembered.get(key);
      const selected=choices.find(item=>item.dataset.mode===last)
        ||choices.find(item=>item.dataset.mode===navigationMode(last))
        ||choices[0];
      if(!selected)return;
      navigate(last&&selected.dataset.mode===navigationMode(last)?last:selected.dataset.mode);
      closeMobile();
    };
  });
  buttons.forEach(button=>{
    button.onclick=()=>{
      navigate(button.dataset.mode);
      closeMobile();
    };
  });
  return {update};
}
