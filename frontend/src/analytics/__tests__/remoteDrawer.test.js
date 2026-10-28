import {test,expect,vi,afterEach} from 'vitest'
import {createDrawer} from '../../drawer.js'

afterEach(()=>{
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function fixture(){
  const selectors=[
    '[data-desc]','[data-list]','[data-count]','[data-prev]',
    '[data-next]','[data-remote-actions]','[data-remote-retry]','#as-timeline',
    '[data-close]','input'
  ]
  const nodes=Object.fromEntries(selectors.map(x=>[x,{innerHTML:'',textContent:'',disabled:false}]))
  nodes['input'].focus=()=>{}
  nodes['[data-remote-retry]'].addEventListener=(_event,handler)=>{nodes['[data-remote-retry]'].click=handler}
  nodes['[data-remote-actions]'].querySelectorAll=()=>[]
  const dialog={
    open:false,innerHTML:'',
    addEventListener:()=>{},
    showModal(){this.open=true},
    close(){this.open=false},
    querySelector:s=>nodes[s]||null,
    querySelectorAll:()=>[]
  }
  vi.stubGlobal('document',{activeElement:{isConnected:false}})
  return {nodes,dialog,drawer:createDrawer(dialog)}
}

test('closing a remote drill cancels its debounced search before another API request',()=>{
  vi.useFakeTimers()
  const t=fixture(),fetchPage=vi.fn().mockResolvedValue({rows:[],total:0})
  t.drawer.openRemote({title:'用户列表',description:'真实用户',fetchPage})
  expect(fetchPage).toHaveBeenCalledTimes(1)
  t.nodes.input.oninput({target:{value:'user'}})
  t.drawer.close()
  vi.advanceTimersByTime(300)
  expect(fetchPage).toHaveBeenCalledTimes(1)
})


test('typing a new query immediately hides old rows and blocks stale group actions',async()=>{
  const t=fixture()
  const fetchPage=vi.fn().mockResolvedValue({total:2,rows:[{id:'user:1',source:'SEO'}]})
  // The initial server list has loaded; a new query must not retain those
  // visible rows or allow users to act on them during the 200ms debounce.
  t.drawer.openRemote({title:'用户列表',description:'真实用户',fetchPage})
  await vi.waitFor(()=>expect(t.nodes['[data-list]'].innerHTML).toContain('user:1'))
  t.nodes.input.oninput({target:{value:'different-user'}})
  expect(t.nodes['[data-list]'].innerHTML).toContain('加载中')
  expect(t.nodes['[data-list]'].innerHTML).not.toContain('user:1')
  expect(t.nodes['[data-count]'].textContent).toContain('加载中')
  // No network request is dispatched before the debounce timer completes.
  expect(fetchPage).toHaveBeenCalledTimes(1)
  t.drawer.close()
})

test('remote drill refetches the last real page after a list shrinks',async()=>{
  const t=fixture()
  let calls=0
  const fetchPage=vi.fn(async()=>{
    calls++
    if(calls<3)return {total:25,rows:[{id:'user:'+calls,source:'SEO'}]}
    if(calls===3)return {total:2,rows:[]}
    return {total:2,rows:[{id:'user:1',source:'SEO'}]}
  })
  t.drawer.openRemote({title:'用户列表',description:'真实用户',fetchPage})
  await vi.waitFor(()=>expect(t.nodes['[data-count]'].textContent).toContain('第 1 / 3 页'))
  t.nodes['[data-next]'].onclick()
  await vi.waitFor(()=>expect(t.nodes['[data-count]'].textContent).toContain('第 2 / 3 页'))
  t.nodes['[data-next]'].onclick()
  await vi.waitFor(()=>expect(t.nodes['[data-count]'].textContent).toContain('第 1 / 1 页'))
  expect(fetchPage.mock.calls.map(([c])=>c.offset)).toEqual([0,12,24,0])
  expect(t.nodes['[data-list]'].innerHTML).toContain('user:1')
  t.drawer.close()
})

test('server failure retains an explicit retry without silently reloading',async()=>{
  const t=fixture(),fetchPage=vi.fn()
    .mockRejectedValueOnce(Error('temporary network error'))
    .mockResolvedValueOnce({total:1,rows:[{id:'user:1',source:'SEO'}]})
  t.drawer.openRemote({title:'用户列表',description:'真实用户',fetchPage})
  await vi.waitFor(()=>expect(t.nodes['[data-list]'].innerHTML).toContain('temporary network error'))
  expect(t.nodes['[data-list]'].innerHTML).toContain('data-remote-retry')
  expect(fetchPage).toHaveBeenCalledTimes(1)
  t.nodes['[data-remote-retry]'].click()
  await vi.waitFor(()=>expect(t.nodes['[data-list]'].innerHTML).toContain('user:1'))
  expect(fetchPage).toHaveBeenCalledTimes(2)
  t.drawer.close()
})
