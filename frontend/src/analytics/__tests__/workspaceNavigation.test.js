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
    {dataset:{navigationSection:'overview'},hidden:false,querySelectorAll:()=>[home]},
    {dataset:{navigationSection:'agent'},hidden:true,querySelectorAll:()=>[analysis]}
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
  expect(t.nav.attrs['aria-label']).toBe('AI Growth Agent页面')
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
