import {test,expect,vi,beforeEach,afterEach} from 'vitest'
vi.mock('../../api/userCrm.js',()=>({crmData:vi.fn(),crmWrite:vi.fn(),crmHistory:vi.fn()}))
import {crmData} from '../../api/userCrm.js'
import {mountUserCrm} from '../../pages/userCrm.js'
const base={addresses:[],entitlements:[],tasks:[],wallets:[],as_of:100,counts:{tasks:0,entitlements:0,addresses:0},totals:{tasks:0,entitlements:0,addresses:0}}
function setup(){const nodes=new Map();const host={isConnected:true,innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,{value:'',addEventListener:vi.fn()});return nodes.get(s)},querySelectorAll:()=>[]};const ctx={esc:s=>String(s??'').replaceAll('<','&lt;'),table:(_h,rows)=>rows.flat().join(' ')};return {host,nodes,ctx}}
beforeEach(()=>{vi.resetAllMocks();crmData.mockResolvedValue(base)})
afterEach(()=>vi.unstubAllGlobals())
test('manual task results without a source cutoff render and keep outcome separate from processing status',async()=>{
 crmData.mockResolvedValue({...base,counts:{...base.counts,tasks:1},totals:{...base.totals,tasks:1},tasks:[{id:'a',user_key:'user:132',title:'续费',goal:'renew',status:'done',deadline:1000,due_at:null,next_step:'核对凭证',result:{outcome:'manual_confirmed',checked_at:100,reference:'proof'},baseline:{}}]})
 const t=setup();mountUserCrm(t.host,t.ctx);await vi.waitFor(()=>expect(t.host.innerHTML).toContain('人工确认达成'));expect(t.host.innerHTML).toContain('已处理');expect(t.host.innerHTML).toContain('proof');expect(t.host.innerHTML).not.toContain('Invalid time')
})
test('late responses do not replace another user profile after disposal',async()=>{
 let finish;crmData.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),panel=mountUserCrm(t.host,t.ctx,{userKey:'user:132'});panel.dispose();t.host.innerHTML='new profile';finish(base);await Promise.resolve();await Promise.resolve();expect(t.host.innerHTML).toBe('new profile')
})
test('search is sent to server and pagination does not locally rank or filter a partial page',async()=>{
 const t=setup();mountUserCrm(t.host,t.ctx,{userKey:'user:132'});await vi.waitFor(()=>expect(t.host.innerHTML).toContain('转化任务'))
 t.host.querySelector('[data-crm-search]').value='proof-55';t.host.querySelector('[data-crm-filter]').value='due';t.host.querySelector('[data-crm-search-apply]').onclick();await vi.waitFor(()=>expect(crmData).toHaveBeenLastCalledWith('user:132',{tab:'tasks',filter:'due',q:'proof-55',offset:0}))
})
test('initial load failure gives a retry and does not invent empty source records',async()=>{
 crmData.mockRejectedValue(Error('source offline'));const t=setup();mountUserCrm(t.host,t.ctx);await vi.waitFor(()=>expect(t.host.querySelector('[data-crm-message]').textContent).toBe('source offline'));expect(t.host.innerHTML).toContain('重试运营资料');expect(t.host.innerHTML).not.toContain('暂无匹配')
})

test('embedded CRM exposes draft changes and clears the guard on disposal',async()=>{
 const form={
  dataset:{crmForm:'task'},
  elements:{namedItem:()=>null},
  addEventListener:vi.fn()
 }
 const t=setup()
 t.host.querySelectorAll=selector=>selector==='[data-crm-form]'?[form]:[]
 const panel=mountUserCrm(t.host,t.ctx)
 await vi.waitFor(()=>expect(form.oninput).toBeTypeOf('function'))
 expect(panel.hasPendingChanges()).toBe(false)
 vi.stubGlobal('FormData',class{
  *[Symbol.iterator](){yield ['note','unsaved follow-up']}
 })
 form.oninput()
 expect(panel.hasPendingChanges()).toBe(true)
 panel.dispose()
 expect(panel.hasPendingChanges()).toBe(false)
})
