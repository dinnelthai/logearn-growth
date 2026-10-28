// Existing internal mode aliases remain mapped to their navigation entry.
export const navigationMode=mode=>({referral:'channels','my-monitor':'home','login-conversion':'funnel','invite-conversion':'funnel','ai-analysis':'ai-analysis'}[mode]||mode)

export function mountSectionNavigation(root,navigate){
  const sections=[...root.querySelectorAll('[data-navigation-section]')];
  const parents=[...root.querySelectorAll('[data-section]')];
  const buttons=[...root.querySelectorAll('[data-mode]')];
  const remembered=new Map();
  const toggle=root.querySelector('[data-sidebar-toggle]');
  const backdrop=root.querySelector('[data-sidebar-backdrop]');
  const sidebar=root.querySelector('#app-sidebar');
  const media=globalThis.matchMedia?.('(max-width: 900px)');
  const isMobile=()=>media?.matches??false;
  let activeKey=null;
  const preferenceKey='logearn.sidebar.collapsed';
  const groupsKey='logearn.sidebar.closed-groups';
  let closedGroups;try{const value=JSON.parse(globalThis.localStorage?.getItem(groupsKey)||'[]');closedGroups=new Set(Array.isArray(value)?value:[])}catch{closedGroups=new Set()}
  const saveGroups=()=>{try{globalThis.localStorage?.setItem(groupsKey,JSON.stringify([...closedGroups]))}catch{}};
  const desktopPreference=()=>{try{return globalThis.localStorage?.getItem(preferenceKey)==='true'}catch{return false}};
  const rememberDesktop=value=>{try{globalThis.localStorage?.setItem(preferenceKey,String(value))}catch{}};
  parents.forEach(button=>{const label=button.querySelector?.('.nav-label')?.textContent?.trim()||button.textContent?.trim();if(label){button.setAttribute('aria-label',label);button.setAttribute('title',label)}});

  const setCollapsed=(collapsed,{restoreFocus=false}={})=>{
    root.classList.toggle('sidebar-collapsed',collapsed);
    toggle?.setAttribute('aria-expanded',String(!collapsed));
    toggle?.setAttribute('aria-label',collapsed?'展开导航':'收起导航');
    if(backdrop){
      backdrop.setAttribute('aria-hidden',String(collapsed||!isMobile()));
      backdrop.tabIndex=collapsed||!isMobile()?-1:0;
    }
    // An off-canvas mobile sidebar must not remain in the keyboard tab order.
    if(sidebar){
      if(isMobile()){
        sidebar.setAttribute('role','dialog');
        sidebar.setAttribute('aria-modal','true');
        sidebar.setAttribute('aria-hidden',String(collapsed));
        if(collapsed)sidebar.setAttribute('inert','');
        else sidebar.removeAttribute('inert');
      }else{
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        sidebar.removeAttribute('aria-hidden');
        sidebar.removeAttribute('inert');
      }
    }
    if(restoreFocus)toggle?.focus();
    else if(isMobile()&&!collapsed){
      const active=sidebar?.querySelector?.('[data-section][aria-pressed="true"]')
        ||sidebar?.querySelector?.('[data-section]');
      active?.focus?.();
    }
  };
  setCollapsed(isMobile()||desktopPreference());
  toggle?.addEventListener('click',()=>{const next=!root.classList.contains('sidebar-collapsed');setCollapsed(next);if(!isMobile())rememberDesktop(next)});
  backdrop?.addEventListener('click',()=>setCollapsed(true,{restoreFocus:true}));
  root.addEventListener?.('keydown',event=>{
    if(!isMobile()||root.classList.contains('sidebar-collapsed'))return;
    if(event.key==='Escape'){
      event.preventDefault();setCollapsed(true,{restoreFocus:true});
      return;
    }
    if(event.key!=='Tab'||!sidebar)return;
    const focusables=[...sidebar.querySelectorAll('button:not([disabled]),a[href]')]
      .filter(el=>!el.hidden&&!el.closest('[hidden]')&&el.getClientRects().length);
    if(!focusables.length)return;
    const first=focusables[0],last=focusables[focusables.length-1];
    const current=globalThis.document?.activeElement;
    if(!sidebar.contains(current)){
      event.preventDefault();(event.shiftKey?last:first).focus();
    }else if(event.shiftKey&&current===first){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey&&current===last){
      event.preventDefault();first.focus();
    }
  });
  media?.addEventListener?.('change',()=>setCollapsed(isMobile()||desktopPreference()));

  const closeMobile=()=>{
    if(isMobile()){
      setCollapsed(true);
      // Move keyboard focus into the newly selected page, not the hidden drawer.
      root.querySelector('#as-main-content')?.focus?.();
    }
  };
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
    sections.forEach(group=>{group.hidden=isSingle(group)||group!==current||closedGroups.has(group.dataset.navigationSection)});
    buttons.forEach(button=>{
      const selected=button.dataset.mode===canonical;
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-current',selected?'page':'false');
    });
    parents.forEach(button=>{
      const selected=button.dataset.section===activeKey;
      button.setAttribute('aria-pressed',String(selected));
      if(isSingle(findGroup(button.dataset.section)))
        button.setAttribute('aria-current',selected?'page':'false');
      if(!isSingle(findGroup(button.dataset.section)))
        button.setAttribute('aria-expanded',String(selected&&!findGroup(button.dataset.section).hidden));
    });
    const sectionLabel=parents.find(button=>button.dataset.section===activeKey)
      ?.querySelector?.('.nav-label')?.textContent?.trim();
    const pageLabel=buttons.find(button=>button.dataset.mode===canonical)?.textContent?.trim();
    const locationLabel=root.querySelector('.toolbar-title');
    if(locationLabel&&sectionLabel)locationLabel.textContent=[sectionLabel,pageLabel].filter(Boolean).join(' / ');
  }

  parents.forEach(button=>{
    button.onclick=()=>{
      const key=button.dataset.section,group=findGroup(key);
      if(!group)return;
      if(!isMobile()&&root.classList.contains('sidebar-collapsed')){
        setCollapsed(false);rememberDesktop(false);
        if(key===activeKey&&!isSingle(group)){closedGroups.delete(key);saveGroups();group.hidden=false;button.setAttribute('aria-expanded','true');return}
      }
      if(key===activeKey&&!isSingle(group)){
        // Clicking an already-active parent toggles its nested page list.
        group.hidden=!group.hidden;
        if(group.hidden)closedGroups.add(key);else closedGroups.delete(key);saveGroups();
        button.setAttribute('aria-expanded',String(!group.hidden));
        return;
      }
      closedGroups.delete(key);saveGroups();
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
