import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/activities.js',()=>({listActivities:vi.fn(),activityMetrics:vi.fn(),validateActivityIds:vi.fn(),createActivity:vi.fn(),activityTimeline:vi.fn(),settleActivity:vi.fn()}))
import {listActivities,activityMetrics} from '../../api/activities.js'
import {createActivityMonitor} from '../../pages/activityMonitor.js'
const a={id:'a',name:'activity',start_at:Date.now()-1000,cutoff_at:Date.now()+3600000},m={activity:a,summary:{total:3,eligible:2,completed:1,conversion_rate:.5,prior:1,active:1,inactive:0,review:0},as_of:new Date().toISOString(),daily:[],rows:[],total:0}
function setup(){const nodes=new Map(),host={innerHTML:'',setAttribute:vi.fn(),removeAttribute:vi.fn(),querySelector:s=>s==='[data-activity-settle]'?null:(nodes.has(s)?nodes.get(s):(nodes.set(s,{}),nodes.get(s))),querySelectorAll:()=>[]};return {host,page:createActivityMonitor({$:()=>host,clear:vi.fn(),esc:String,fmt:String,table:()=>''})}}
beforeEach(()=>{vi.resetAllMocks();listActivities.mockResolvedValue({activities:[a]})})
test('defaults to active but unanalysed users with server pagination',async()=>{activityMetrics.mockResolvedValue(m);const t=setup();await t.page.draw();expect(activityMetrics).toHaveBeenCalledWith('a',{status:'active',q:'',offset:0,limit:20});expect(t.host.innerHTML).toContain('50.0%');expect(t.host.innerHTML).toContain('开始前已分析')})
test('disposed activity metrics cannot replace another page',async()=>{let resolve;activityMetrics.mockImplementation(()=>new Promise(r=>resolve=r));const t=setup(),pending=t.page.draw();await Promise.resolve();t.page.dispose();t.host.innerHTML='other page';resolve(m);await pending;expect(t.host.innerHTML).toBe('other page')})
