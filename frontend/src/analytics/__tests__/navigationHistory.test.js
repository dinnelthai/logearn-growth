import {test,expect,vi} from 'vitest'
import {createViewHistory,INTERNAL_VIEWS} from '../../navigationHistory.js'

function setup(initial='https://growth.example/app?source=seo#detail'){
  let href=initial
  const listeners=new Map()
  const history={
    state:{existing:true},
    pushState:vi.fn((state,_,path)=>{href=new URL(path,href).href;history.state=state}),
    replaceState:vi.fn((state,_,path)=>{href=new URL(path,href).href;history.state=state}),
  }
  const location={get href(){return href}}
  const eventTarget={
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}
  }
  const onNavigate=vi.fn()
  const nav=createViewHistory({
    location,history,eventTarget,
    validModes:['home','funnel','ai-analysis',...INTERNAL_VIEWS],
    onNavigate
  })
  return {nav,history,listeners,onNavigate,get href(){return href}}
}

test('a page change preserves existing URL parameters, anchors and history state',()=>{
  const t=setup()
  t.nav.replace('home')
  t.nav.push('funnel')
  expect(t.href).toContain('source=seo')
  expect(t.href).toContain('view=funnel')
  expect(t.href).toContain('#detail')
  expect(t.history.state).toEqual({existing:true})
  expect(t.history.replaceState).toHaveBeenCalledTimes(1)
  expect(t.history.pushState).toHaveBeenCalledTimes(1)
  t.nav.push('funnel')
  expect(t.history.pushState).toHaveBeenCalledTimes(1)
})

test('a valid deep link initializes the matching page; invalid links fall back safely',()=>{
  const valid=setup('https://growth.example/?view=ai-analysis')
  expect(valid.nav.read()).toBe('ai-analysis')
  const invalid=setup('https://growth.example/?view=anything-else')
  expect(invalid.nav.read()).toBe('home')
  invalid.nav.push('anything-else')
  expect(invalid.href).toContain('view=home')
})

test('back and forward do not create an extra history entry',()=>{
  const t=setup('https://growth.example/?view=login-conversion')
  t.listeners.get('popstate')()
  expect(t.onNavigate).toHaveBeenCalledWith('login-conversion')
  expect(t.history.pushState).not.toHaveBeenCalled()
  t.nav.dispose()
  expect(t.listeners.has('popstate')).toBe(false)
})

test('history integration is harmless when the browser API is unavailable',()=>{
  const t=createViewHistory({validModes:['home'],location:undefined,history:undefined,eventTarget:undefined,onNavigate:()=>{}})
  expect(t.read()).toBe('home')
  expect(()=>t.push('home')).not.toThrow()
})
