import {it,expect,vi,afterEach} from 'vitest'
import {createChartLifecycle} from '../../pages/chartLifecycle.js'
afterEach(()=>vi.unstubAllGlobals())
it('page switching removes resize/theme subscriptions and disposes each chart once',()=>{
 const observers=[];vi.stubGlobal('ResizeObserver',class {constructor(callback){this.callback=callback;this.disconnect=vi.fn();this.observe=vi.fn();observers.push(this)}})
 const listeners=new Set(),media={addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)}
 const lifecycle=createChartLifecycle(media),first={resize:vi.fn(),dispose:vi.fn()},second={resize:vi.fn(),dispose:vi.fn()},paint=vi.fn()
 lifecycle.attach(first,{},paint);observers[0].callback();expect(first.resize).toHaveBeenCalledOnce();expect(listeners.size).toBe(1)
 lifecycle.attach(second,{},paint);expect(first.dispose).toHaveBeenCalledOnce();expect(observers[0].disconnect).toHaveBeenCalledOnce();expect(listeners.size).toBe(1)
 lifecycle.dispose();lifecycle.dispose();expect(second.dispose).toHaveBeenCalledOnce();expect(listeners.size).toBe(0)
})
