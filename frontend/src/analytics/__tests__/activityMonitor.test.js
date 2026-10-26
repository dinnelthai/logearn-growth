import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/activities.js',()=>({listActivities:vi.fn(),activityMetrics:vi.fn(),validateActivityIds:vi.fn(),createActivity:vi.fn(),activityTimeline:vi.fn(),settleActivity:vi.fn()}))
vi.mock('../../pages/activityEvidence.js',()=>({mountActivityEvidence:vi.fn(()=>({dispose(){}}))}))
vi.mock('../../pages/scheduledActivity.js',()=>({mountScheduledActivity:vi.fn()}))
import {mountScheduledActivity} from '../../pages/scheduledActivity.js'
import {listActivities,activityMetrics} from '../../api/activities.js'
import {createActivityMonitor} from '../../pages/activityMonitor.js'
const a={id:'a',name:'activity',start_at:Date.now()-1000,cutoff_at:Date.now()+3600000},m={activity:a,summary:{total:3,eligible:2,completed:1,conversion_rate:.5,prior:1,active:1,inactive:0,review:0},as_of:new Date().toISOString(),daily:[],rows:[],total:0}
function setup(){const nodes=new Map(),host={innerHTML:'',setAttribute:vi.fn(),removeAttribute:vi.fn(),querySelector:s=>s==='[data-activity-settle]'?null:(nodes.has(s)?nodes.get(s):(nodes.set(s,{}),nodes.get(s))),querySelectorAll:()=>[]};return {host,page:createActivityMonitor({$:()=>host,clear:vi.fn(),esc:String,fmt:String,table:()=>''})}}
beforeEach(()=>{vi.resetAllMocks();listActivities.mockResolvedValue({activities:[a]})})
test('defaults to the full fixed roster with server pagination',async()=>{activityMetrics.mockResolvedValue(m);const t=setup();await t.page.draw();expect(activityMetrics).toHaveBeenCalledWith('a',{status:'all',q:'',offset:0,limit:20});expect(t.host.innerHTML).toContain('50.0%');expect(t.host.innerHTML).toContain('开始前已分析')})
test('disposed activity metrics cannot replace another page',async()=>{let resolve;activityMetrics.mockImplementation(()=>new Promise(r=>resolve=r));const t=setup(),pending=t.page.draw();await Promise.resolve();t.page.dispose();t.host.innerHTML='other page';resolve(m);await pending;expect(t.host.innerHTML).toBe('other page')})
test('a planned activity renders the scheduling panel without fabricated denominators or zero conversion',async()=>{activityMetrics.mockResolvedValue({pending:true,activity:{...a,schedule_state:'scheduled',start_at:Date.now()+3600000,goal:'activation'},planned_user_ids:['1','2'],performance:null,target_progress:null,rows:[]});const t=setup();await t.page.draw();expect(mountScheduledActivity).toHaveBeenCalled();expect(t.host.innerHTML).toContain('预约待开始');expect(t.host.innerHTML).not.toContain('首次分析转化率');expect(t.host.innerHTML).not.toContain('0.0%')})

test('started activity shows management actions prominently and explains fixed fields',async()=>{
 activityMetrics.mockResolvedValue(m);const t=setup();await t.page.draw()
 for(const label of ['管理名单与标签','复制为新活动','归档活动','本活动目标固定，可在名单管理中追加成员'])expect(t.host.innerHTML).toContain(label)
 expect(t.host.innerHTML.indexOf('data-activity-archive-top')).toBeLessThan(t.host.innerHTML.indexOf('data-activity-refresh'))
 expect(t.host.innerHTML).not.toContain('data-activity-edit>');expect(t.host.innerHTML).toContain('修改开始时间');expect(t.host.innerHTML).toContain('保存并重新计算')
})
test('scheduled activity exposes editing and restore is explicit for archived activity',async()=>{
 activityMetrics.mockResolvedValue({pending:true,activity:{...a,schedule_state:'scheduled',start_at:Date.now()+3600000,goal:'activation'}})
 const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('修改活动与预约')
 activityMetrics.mockResolvedValue({...m,activity:{...a,archived_at:Date.now()}});await t.page.draw();expect(t.host.innerHTML).toContain('恢复活动')
})
