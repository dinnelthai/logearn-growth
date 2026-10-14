// Page modes stay unchanged so existing analysis and drill-down links still work.
export function mountSectionNavigation(root, navigate) {
  const sections = [...root.querySelectorAll('[data-navigation-section]')];
  const parents = [...root.querySelectorAll('[data-section]')];
  const buttons = [...root.querySelectorAll('[data-mode]')];
  const remembered = new Map();
  const nav = root.querySelector('#as-section-nav');

  function update(mode) {
    const section = sections.find(group =>
      [...group.querySelectorAll('[data-mode]')].some(button => button.dataset.mode === mode));
    if (!section) return;
    const key = section.dataset.navigationSection;
    remembered.set(key, mode);
    sections.forEach(group => { group.hidden = group !== section; });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    parents.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === key)));
    const title = parents.find(button => button.dataset.section === key)?.textContent.trim();
    nav.setAttribute('aria-label', `${title}页面`);
  }

  parents.forEach(button => {
    button.onclick = () => {
      const group = sections.find(section => section.dataset.navigationSection === button.dataset.section);
      const available = [...group.querySelectorAll('[data-mode]')].filter(item => !item.hidden && !item.disabled);
      const selected = available.find(item => item.dataset.mode === remembered.get(button.dataset.section)) || available[0];
      if (selected) navigate(selected.dataset.mode);
    };
  });
  buttons.forEach(button => { button.onclick = () => navigate(button.dataset.mode); });
  return { update };
}
