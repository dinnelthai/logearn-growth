import {test,expect,vi} from 'vitest'
import {createLazyPage} from '../../pages/lazyPage.js'
test('navigation cancels pending module activation and a later visit reuses the import',async()=>{
 let resolve;const load=vi.fn(()=>new Promise(r=>resolve=r)),host={innerHTML:''},instance={draw:vi.fn(),dispose:vi.fn()},create=vi.fn(()=>instance)
 const ctx={$:()=>host,esc:String,clear:()=>page.dispose()},page=createLazyPage(ctx,load)
 const first=page.draw({id:1});page.dispose();resolve(create);await first
 expect(create).not.toHaveBeenCalled();expect(instance.draw).not.toHaveBeenCalled()
 await page.draw({id:2});expect(load).toHaveBeenCalledOnce();expect(instance.draw).toHaveBeenCalledWith({id:2})
 page.dispose();expect(instance.dispose).toHaveBeenCalledOnce()
})
test('module loading failures allow retry with the original configuration',async()=>{
 const button={},host={innerHTML:'',querySelector:()=>button},instance={draw:vi.fn(),dispose:vi.fn()},load=vi.fn().mockRejectedValueOnce(Error('<network>')).mockResolvedValue(()=>instance)
 const ctx={$:()=>host,esc:s=>s.replace('<','&lt;'),clear:()=>page.dispose()},page=createLazyPage(ctx,load)
 await page.draw({source:'x'});expect(host.innerHTML).toContain('&lt;network&gt;')
 await button.onclick();expect(instance.draw).toHaveBeenCalledWith({source:'x'})
})
