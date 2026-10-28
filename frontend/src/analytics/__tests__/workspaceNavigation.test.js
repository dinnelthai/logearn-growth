import {test,expect,vi,afterEach} from 'vitest'
import {mountSectionNavigation} from '../../navigation.js'

afterEach(()=>vi.unstubAllGlobals())

function makeButton(dataset={}){
  const listeners={}
  const attrs={}
  return {
    dataset, attrs, listeners, hidden:false, disabled:false,
    setAttribute:(key,value)=>{attrs[key]=value},
    addEventListener:(key,listener)=>{listeners[key]=listener},
    focus:vi.fn(),
    click(){listeners.click?.();this.onclick?.()}
  }
}
function fixture(){
  const home=makeButton({mode:'home'})
  const analysis=makeButton({mode:'ai-analysis'})
  const overview=makeButton({section:'overview'})
  overview.textContent='总览'
  const agent=makeButton({section:'agent'})
  agent.textContent='AI Growth Agent'
  const groups=[
    {dataset:{navigationSection:'overview',single:'false'},hidden:false,querySelectorAll:()=>[home]},
    {dataset:{navigationSection:'agent',single:'false'},hidden:true,querySelectorAll:()=>[analysis]}
  ]
  const toggle=makeButton()
  const backdrop=makeButton()
  const nav=makeButton()
  const classes=new Set()
  const events={}
  const root={
    dataset:{},
    classList:{
      toggle(key,force){
        const active=force===undefined?!classes.has(key):force
        if(active)classes.add(key);else classes.delete(key)
        return active
      },
      contains:key=>classes.has(key)
    },
    querySelectorAll:selector=>({
      '[data-navigation-section]':groups,
      '[data-section]':[overview,agent],
      '[data-mode]':[home,analysis]
    })[selector]||[],
    querySelector:selector=>({
      '#as-section-nav':nav,
      '[data-sidebar-toggle]':toggle,
      '[data-sidebar-backdrop]':backdrop
    })[selector],
    addEventListener:(key,listener)=>{events[key]=listener}
  }
  const media={matches:true,addEventListener:vi.fn()}
  vi.stubGlobal('matchMedia',()=>media)
  return {root,media,events,classes,toggle,backdrop,home,analysis,agent,nav}
}

test('mobile navigation opens, closes on selection and supports Escape',()=>{
  const t=fixture()
  const navigate=vi.fn()
  const mounted=mountSectionNavigation(t.root,navigate)
  expect(t.classes.has('sidebar-collapsed')).toBe(true)
  expect(t.toggle.attrs['aria-expanded']).toBe('false')
  t.toggle.click()
  expect(t.classes.has('sidebar-collapsed')).toBe(false)
  expect(t.backdrop.tabIndex).toBe(0)
  mounted.update('ai-analysis')
  expect(t.agent.attrs['aria-pressed']).toBe('true')
  expect(t.agent.attrs['aria-expanded']).toBe('true')
  t.analysis.click()
  expect(navigate).toHaveBeenCalledWith('ai-analysis')
  expect(t.classes.has('sidebar-collapsed')).toBe(true)
  t.toggle.click()
  const preventDefault=vi.fn()
  t.events.keydown({key:'Escape',preventDefault})
  expect(preventDefault).toHaveBeenCalledTimes(1)
  expect(t.toggle.focus).toHaveBeenCalledTimes(1)
  expect(t.classes.has('sidebar-collapsed')).toBe(true)
})

test('desktop breakpoint restores sidebar, backdrop can close mobile drawer',()=>{
  const t=fixture()
  mountSectionNavigation(t.root,vi.fn())
  t.toggle.click()
  t.backdrop.click()
  expect(t.classes.has('sidebar-collapsed')).toBe(true)
  expect(t.toggle.focus).toHaveBeenCalledTimes(1)
  t.media.matches=false
  const change=t.media.addEventListener.mock.calls.find(([type])=>type==='change')?.[1]
  expect(change).toBeTypeOf('function')
  change()
  expect(t.classes.has('sidebar-collapsed')).toBe(false)
  expect(t.backdrop.tabIndex).toBe(-1)
})

test('nested navigation collapses the active group and remembers child selection',()=>{
  const t=fixture();
  const go=vi.fn(mode=>mounted.update(mode));
  const mounted=mountSectionNavigation(t.root,go);
  mounted.update('home');
  expect(t.agent.attrs['aria-expanded']).toBe('false');
  t.agent.click();
  expect(go).toHaveBeenCalledWith('ai-analysis');
  expect(t.agent.attrs['aria-expanded']).toBe('true');
  expect(t.root.classList.contains('sidebar-collapsed')).toBe(true);
  t.agent.click();
  expect(t.agent.attrs['aria-expanded']).toBe('false');
  t.agent.click();
  expect(t.agent.attrs['aria-expanded']).toBe('true');
  expect(t.analysis.attrs['aria-current']).toBe('page');
});

test('desktop sidebar preference survives remount without storing mobile drawer state',()=>{
  const values=new Map();vi.stubGlobal('localStorage',{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
  const first=fixture();first.media.matches=false;mountSectionNavigation(first.root,vi.fn());
  first.toggle.click();expect(first.classes.has('sidebar-collapsed')).toBe(true);
  const second=fixture();second.media.matches=false;mountSectionNavigation(second.root,vi.fn());
  expect(second.classes.has('sidebar-collapsed')).toBe(true);
  second.media.matches=true;second.toggle.click();
  const third=fixture();third.media.matches=false;mountSectionNavigation(third.root,vi.fn());
  expect(third.classes.has('sidebar-collapsed')).toBe(true);
});

test('desktop collapsed group opens the sidebar so child pages remain reachable',()=>{
 const t=fixture();t.media.matches=false;
 const mounted=mountSectionNavigation(t.root,vi.fn());mounted.update('home');
 t.toggle.click();t.root.querySelectorAll('[data-section]')[0].click();
 expect(t.classes.has('sidebar-collapsed')).toBe(false);
 expect(t.root.querySelectorAll('[data-navigation-section]')[0].hidden).toBe(false);
});

test('active group disclosure remains closed after a reload',()=>{
 const values=new Map();vi.stubGlobal('localStorage',{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
 const first=fixture();first.media.matches=false;const one=mountSectionNavigation(first.root,vi.fn());one.update('home');
 first.root.querySelectorAll('[data-section]')[0].click();
 const second=fixture();second.media.matches=false;const two=mountSectionNavigation(second.root,vi.fn());two.update('home');
 expect(second.root.querySelectorAll('[data-navigation-section]')[0].hidden).toBe(true);
});

test('desktop navigation keeps a readable current-location breadcrumb',()=>{
  const t=fixture()
  t.media.matches=false
  const title={textContent:'增长运营工作区'}
  const original=t.root.querySelector
  t.root.querySelector=selector=>selector==='.toolbar-title'?title:original(selector)
  t.agent.querySelector=selector=>selector==='.nav-label'?{textContent:'AI Growth Agent'}:null
  t.analysis.textContent='AI 增长分析'
  const mounted=mountSectionNavigation(t.root,vi.fn())
  mounted.update('ai-analysis')
  expect(title.textContent).toBe('AI Growth Agent / AI 增长分析')
  expect(t.agent.attrs['aria-current']).toBe('page')
})
