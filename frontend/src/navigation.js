// Preserve existing mode aliases used by shared navigation and deep links.
export const navigationMode=mode=>({referral:'channels','my-monitor':'home','login-conversion':'funnel','invite-conversion':'funnel','ai-analysis':'ai-analysis'}[mode]||mode)

export function mountSectionNavigation(root, navigate) {
  const sections=[...root.querySelectorAll('[data-navigation-section]')];
  const parents=[...root.querySelectorAll('[data-section]')];
  const buttons=[...root.querySelectorAll('[data-mode]')];
  const remembered=new Map();
  const nav=root.querySelector('#as-section-nav');
  const toggle=root.querySelector('[data-sidebar-toggle]');
  const backdrop=root.querySelector('[data-sidebar-backdrop]');
  const media=globalThis.matchMedia?.('(max-width: 900px)');
  const isMobile=()=>media?.matches??false;

  const setCollapsed=(collapsed,{restoreFocus=false}={})=>{
    root.classList.toggle('sidebar-collapsed',collapsed);
    if(toggle){
      toggle.setAttribute('aria-expanded',String(!collapsed));
      toggle.setAttribute('aria-label',collapsed?'展开导航':'收起导航');
    }
    if(backdrop){
      backdrop.setAttribute('aria-hidden',String(collapsed||!isMobile()));
      backdrop.tabIndex=collapsed||!isMobile()?-1:0;
    }
    if(restoreFocus)toggle?.focus();
  };
  // The mobile drawer starts closed, while desktop navigation stays visible.
  setCollapsed(isMobile());
  toggle?.addEventListener('click',()=>setCollapsed(!root.classList.contains('sidebar-collapsed')));
  backdrop?.addEventListener('click',()=>setCollapsed(true,{restoreFocus:true}));
  root.addEventListener?.('keydown',event=>{
    if(event.key==='Escape'&&isMobile()&&!root.classList.contains('sidebar-collapsed')){
      event.preventDefault();
      setCollapsed(true,{restoreFocus:true});
    }
  });
  media?.addEventListener?.('change',()=>setCollapsed(isMobile()));

  const closeMobile=()=>{
    if(isMobile())setCollapsed(true);
  };
  function update(mode){
    const canonical=navigationMode(mode);
    const section=sections.find(group=>[...group.querySelectorAll('[data-mode]')]
      .some(button=>button.dataset.mode===canonical));
    if(!section)return;
    const key=section.dataset.navigationSection;
    remembered.set(key,mode);
    sections.forEach(group=>{group.hidden=group!==section});
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===canonical)));
    parents.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.section===key)));
    const title=parents.find(button=>button.dataset.section===key)?.textContent.trim();
    nav?.setAttribute('aria-label',title?`${title}页面`:'子导航');
  }
  parents.forEach(button=>{
    button.onclick=()=>{
      const group=sections.find(section=>section.dataset.navigationSection===button.dataset.section);
      if(!group)return;
      const available=[...group.querySelectorAll('[data-mode]')].filter(item=>!item.hidden&&!item.disabled);
      const selected=available.find(item=>item.dataset.mode===navigationMode(remembered.get(button.dataset.section)))||available[0];
      if(selected){
        navigate(selected.dataset.mode===navigationMode(remembered.get(button.dataset.section))?
          (remembered.get(button.dataset.section)||selected.dataset.mode):selected.dataset.mode);
        closeMobile();
      }
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
