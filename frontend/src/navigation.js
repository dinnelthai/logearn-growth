// Existing deep links keep their modes while sharing one navigation entry.
export const navigationMode=mode=>({referral:'channels','my-monitor':'home','login-conversion':'funnel','invite-conversion':'funnel','ai-analysis':'ai-analysis'}[mode]||mode)
export function mountSectionNavigation(root, navigate) {
  const sections = [...root.querySelectorAll('[data-navigation-section]')];
  const parents = [...root.querySelectorAll('[data-section]')];
  const buttons = [...root.querySelectorAll('[data-mode]')];
  const remembered = new Map();
  const nav = root.querySelector('#as-section-nav');
  const toggle=root.querySelector('[data-sidebar-toggle]');
  if(toggle&&globalThis.matchMedia?.('(max-width: 900px)').matches){root.classList.add('sidebar-collapsed');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','展开导航')}
  if(toggle)toggle.onclick=()=>{const collapsed=root.classList.toggle('sidebar-collapsed');toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'展开导航':'收起导航')};

  function update(mode) {
    const canonical=navigationMode(mode);
    const section = sections.find(group =>
      [...group.querySelectorAll('[data-mode]')].some(button => button.dataset.mode === canonical));
    if (!section) return;
    const key = section.dataset.navigationSection;
    remembered.set(key, mode);
    sections.forEach(group => { group.hidden = group !== section; });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === canonical)));
    parents.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === key)));
    const title = parents.find(button => button.dataset.section === key)?.textContent.trim();
    nav.setAttribute('aria-label', `${title}页面`);
  }

  parents.forEach(button => {
    button.onclick = () => {
      const group = sections.find(section => section.dataset.navigationSection === button.dataset.section);
      const available = [...group.querySelectorAll('[data-mode]')].filter(item => !item.hidden && !item.disabled);
      const selected = available.find(item => item.dataset.mode === navigationMode(remembered.get(button.dataset.section))) || available[0];
      if (selected) navigate(remembered.get(button.dataset.section)||selected.dataset.mode);
    };
  });
  buttons.forEach(button => { button.onclick = () => {navigate(button.dataset.mode);if(toggle&&globalThis.matchMedia?.('(max-width: 900px)').matches){root.classList.add('sidebar-collapsed');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','展开导航')}}; });
  return { update };
}
