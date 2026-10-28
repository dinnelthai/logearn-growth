vi.mock('../../api/aiAnalysis.js',()=>({getGrowthInbox:vi.fn().mockResolvedValue({tasks:[]})}))
import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/userOperations.js',()=>({fetchWorkbench:vi.fn(),setFollowupStatus:vi.fn()}))
import {fetchWorkbench,setFollowupStatus} from '../../api/userOperations.js'
import {getGrowthInbox} from '../../api/aiAnalysis.js'
import {createWorkbench} from '../../pages/workbench.js'
const data={as_of:100,summary:{due:1,kol_due:0,activity_pending:0,activities_active:0,user_due:1,completed:0},tasks:[{id:'u1',type:'user',target:'user:1',title:'到期用户',description:'回看',status:'open',due_at:50},{id:'u2',type:'user',target:'user:2',title:'未来用户',description:'继续',status:'open',due_at:200}]}
function setup(){const nodes={'[data-work-refresh]':{},'[data-work-prev]':{},'[data-work-next]':{},'[data-work-error]':{}},open={dataset:{workOpen:'u1'}},status={dataset:{workStatus:'u1'},isConnected:true};const host={innerHTML:'',querySelector:s=>nodes[s],querySelectorAll:s=>s==='[data-work-open]'?[open]:s==='[data-work-status]'?[status]:[]};const ctx={$:()=>host,esc:String,fmt:String,table:(_heads,rows)=>JSON.stringify(rows),clear:vi.fn(),openUserProfile:vi.fn()};return {page:createWorkbench(ctx),host,ctx,open,status}}
beforeEach(()=>{vi.resetAllMocks();fetchWorkbench.mockResolvedValue(data);getGrowthInbox.mockResolvedValue({tasks:[]})})
test('due view excludes future work and user action opens the unified profile',async()=>{const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('到期用户');expect(t.host.innerHTML).not.toContain('未来用户');t.open.onclick();expect(t.ctx.openUserProfile).toHaveBeenCalledWith('user:1')})
test('a completed status refreshes workbench only while the page remains active',async()=>{let finish;setFollowupStatus.mockImplementation(()=>new Promise(r=>finish=r));const t=setup();await t.page.draw();const pending=t.status.onclick();t.page.dispose();t.host.innerHTML='different page';finish({});await pending;expect(fetchWorkbench).toHaveBeenCalledTimes(1);expect(t.host.innerHTML).toBe('different page')})
test('late workbench responses cannot overwrite another page',async()=>{let finish;fetchWorkbench.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw();t.page.dispose();t.host.innerHTML='new page';finish(data);await pending;expect(t.host.innerHTML).toBe('new page')})
test('an in-progress group task stays due and opens its persistent detail, while unscheduled work is not overdue',async()=>{
 fetchWorkbench.mockResolvedValue({...data,summary:{...data.summary,group_due:1,groups_open:2},tasks:[{id:'group',type:'task',target:'group',title:'固定人群任务',description:'核实使用阻力',status:'in_progress',due_at:0},{id:'unscheduled',type:'task',target:'unscheduled',title:'未排期任务',status:'open',due_at:null}]})
 const t=setup();t.ctx.openOperationTask=vi.fn();t.open.dataset.workOpen='group';await t.page.draw();expect(t.host.innerHTML).toContain('固定人群任务');expect(t.host.innerHTML).not.toContain('未排期任务');expect(t.host.innerHTML).toContain('处理中');t.open.onclick();expect(t.ctx.openOperationTask).toHaveBeenCalledWith('group')
})
test('a due scheduled start opens the activity instead of treating it as a settlement',async()=>{fetchWorkbench.mockResolvedValue({...data,summary:{...data.summary,activities_scheduled:1},tasks:[{id:'start',type:'activity_start',target:'a',title:'预约待启动',description:'等待基线',status:'open',due_at:50}]});const t=setup();t.ctx.openActivity=vi.fn();t.open.dataset.workOpen='start';await t.page.draw();expect(t.host.innerHTML).toContain('查看预约');expect(t.host.innerHTML).toContain('预约活动');t.open.onclick();expect(t.ctx.openActivity).toHaveBeenCalledWith('a')})

test('manual refresh keeps the current page instead of returning to page one',async()=>{
 const many=Array.from({length:25},(_,i)=>({...data.tasks[0],id:'t'+i,title:'任务'+i}))
 fetchWorkbench.mockResolvedValue({...data,tasks:many})
 const t=setup()
 await t.page.draw()
 t.host.querySelector('[data-work-next]').onclick()
 expect(t.host.innerHTML).toContain('第 2/2 页')
 expect(t.host.innerHTML).toContain('任务24')
 await t.host.querySelector('[data-work-refresh]').onclick()
 expect(t.host.innerHTML).toContain('第 2/2 页')
 expect(t.host.innerHTML).toContain('任务24')
 expect(fetchWorkbench).toHaveBeenCalledTimes(2)
 t.page.dispose()
})

test('manual refresh clamps pagination when the available tasks shrink',async()=>{
 const many=Array.from({length:25},(_,i)=>({...data.tasks[0],id:'t'+i,title:'任务'+i}))
 fetchWorkbench.mockResolvedValueOnce({...data,tasks:many})
   .mockResolvedValueOnce({...data,tasks:[many[0]]})
 const t=setup()
 await t.page.draw()
 t.host.querySelector('[data-work-next]').onclick()
 expect(t.host.innerHTML).toContain('第 2/2 页')
 await t.host.querySelector('[data-work-refresh]').onclick()
 expect(t.host.innerHTML).toContain('第 1/1 页')
 expect(t.host.innerHTML).toContain('任务0')
 t.page.dispose()
})

test('returning from a KOL or activity detail restores the previously selected workbench page',async()=>{
 const many=Array.from({length:45},(_,i)=>({...data.tasks[0],id:'t'+i,title:'任务'+i,due_at:50}))
 fetchWorkbench.mockResolvedValue({...data,tasks:many})
 const t=setup()
 await t.page.draw()
 t.host.querySelector('[data-work-next]').onclick()
 t.host.querySelector('[data-work-next]').onclick()
 expect(t.host.innerHTML).toContain('第 3/3 页')
 expect(t.host.innerHTML).toContain('任务44')
 t.page.dispose()
 // Simulate the workspace router re-entering workbench after visiting CRM.
 await t.page.draw()
 expect(t.host.innerHTML).toContain('第 3/3 页')
 expect(t.host.innerHTML).toContain('任务44')
 t.page.dispose()
})

test('an outdated workbench target is not opened after the task has disappeared',async()=>{
 const t=setup()
 await t.page.draw()
 t.open.dataset.workOpen='unknown-task'
 expect(()=>t.open.onclick()).not.toThrow()
 expect(t.ctx.openUserProfile).not.toHaveBeenCalled()
 expect(t.host.querySelector('[data-work-error]').textContent).toContain('目标不存在')
 t.page.dispose()
})

test('workbench handles unsupported targets without silently opening an unrelated profile',async()=>{
 const t=setup()
 fetchWorkbench.mockResolvedValue({...data,tasks:[{...data.tasks[0],type:'unsupported',id:'other-task'}]})
 t.open.dataset.workOpen='other-task'
 await t.page.draw()
 t.open.onclick()
 expect(t.ctx.openUserProfile).not.toHaveBeenCalled()
 expect(t.host.querySelector('[data-work-error]').textContent).toContain('暂不能打开')
 t.page.dispose()
})
