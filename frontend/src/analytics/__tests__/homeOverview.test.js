import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchNorthStarMetrics:vi.fn(),fetchOnlineTradeMetrics:vi.fn(),fetchTradeVolumeMetrics:vi.fn(),fetchSegmentsMetrics:vi.fn(),fetchMyMonitorMetrics:vi.fn()}))
vi.mock('../../pages/platformAssets.js',()=>({mountPlatformAssets:()=>({dispose(){}})}))
vi.mock('../../api/backendAnalytics.js',()=>({fetchBackendMeta:vi.fn()}))
vi.mock('../../api/systemReliability.js',()=>({fetchSystemReliabilityOverview:vi.fn()}))
import * as api from '../../api/metrics.js'
import {fetchBackendMeta} from '../../api/backendAnalytics.js'
import {fetchSystemReliabilityOverview} from '../../api/systemReliability.js'
import {createHomeMonitor} from '../../pages/homeMonitor.js'
import {growthPanel} from '../../pages/homeGrowth.js'
const meta={snapshot_id:'shared',as_of:'2026-10-15T02:00:00Z',start_at:'2026-10-09T00:00:00Z'}
const metric=key=>({key,label:key,rate:null,numerator:0,denominator:0,pending:0,available:true,formula:'specific denominator'})
const weeklyCore={available:true,source:'all',users:10,goal:{users:200,progress:.05,due_date:'2026-11-30'},retained:5,entered:2,lost:1,near_users:4,previous_users:8,delta:2,start:Date.parse('2026-10-08T17:00:00Z'),end:Date.parse('2026-10-15T17:00:00Z'),distribution:[{days:4,users:10}],definition:'每周至少4天分析',events_complete_through:'2026-10-15T02:00:00Z'}
const growth={metrics:Object.fromEntries(['activation','visit_login','d1','d7'].map(k=>[k,metric(k)])),days:[]}
function setup(){const nodes=new Map(),go={dataset:{homeGo:'north'}},host={innerHTML:'',querySelector:s=>nodes.get(s)||(nodes.set(s,{}),nodes.get(s)),querySelectorAll:s=>s==='[data-home-go]'?[go]:[]},ctx={$:()=>host,isAgg:true,clear:vi.fn(),esc:String,fmt:String,table:()=>'',navigatePlatform:vi.fn()};return {host,ctx,page:createHomeMonitor(ctx),go}}
beforeEach(()=>{vi.resetAllMocks();vi.spyOn(Date,'now').mockReturnValue(Date.parse(meta.as_of));fetchBackendMeta.mockResolvedValue(meta);api.fetchNorthStarMetrics.mockResolvedValue({days:[{date:'2026-10-15',active_users:12,new_users:3,returning_users:9}],totals:{active_users:20},weekly_core:weeklyCore});api.fetchOnlineTradeMetrics.mockResolvedValue({total:{traders:2,failed:0,pending:1},days:[],chains:[]});api.fetchTradeVolumeMetrics.mockResolvedValue({total:{volume_usd:100,missing_values:0,negative_values:0},days:[]});api.fetchSegmentsMetrics.mockResolvedValue({focus:{value_users:10},drill:{cache_id:'s'}});api.fetchMyMonitorMetrics.mockResolvedValue(growth);fetchSystemReliabilityOverview.mockResolvedValue({configured:false,state:'not_configured',summary:{total:0,up:0,down:0,pending:0,maintenance:0,unknown:0,avgLatencyMs:null},runtime:{uptimeSeconds:1}})})
test('overview puts north star first, shares one platform period and does not combine visit and analysis retention',async()=>{
 const t=setup();await t.page.draw();const html=t.host.innerHTML
 expect(html.indexOf('home-attention')).toBeLessThan(html.indexOf('weekly-core'));expect(html.indexOf('weekly-core')).toBeLessThan(html.indexOf('增长驱动'));expect(html.indexOf('增长驱动')).toBeLessThan(html.indexOf('home-daily-pulse'));expect(html.indexOf('home-daily-pulse')).toBeLessThan(html.indexOf('商业表现'));expect(html).toContain('北极星 · 周核心分析用户数');expect(html).toContain('今日有效分析用户');expect(html).toContain('<strong>12</strong>');expect(html).toContain('两者分别保留');expect(html).toContain('200')
 const calls=Object.values(api).map(fn=>fn.mock.calls[0][0]);expect(new Set(calls.map(c=>c.snapshot_id))).toEqual(new Set(['shared']));expect(new Set(calls.map(c=>c.start)).size).toBe(1);expect(new Set(calls.map(c=>c.end)).size).toBe(1);expect(calls.every(c=>c.audience_ids==null)).toBe(true)
 t.go.onclick();expect(t.ctx.navigatePlatform).toHaveBeenCalledWith('north',{days:7,asOf:Date.parse(meta.as_of)})
})
test('growth failure leaves north and commercial results visible without inventing zero rates',async()=>{
 api.fetchMyMonitorMetrics.mockRejectedValue(Error('offline'));const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('今日有效分析用户');expect(t.host.innerHTML).toContain('<strong>12</strong>');expect(t.host.innerHTML).toContain('增长转化暂不可用');expect(t.host.innerHTML).toContain('商业表现')
 const html=growthPanel(growth,{esc:String,fmt:String,table:()=>''});expect(html).toContain('无分母为—');expect(html).not.toContain('0.0%')
})
test('leaving the overview prevents late responses from replacing the next page',async()=>{let finish;api.fetchMyMonitorMetrics.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw();await Promise.resolve();await Promise.resolve();t.page.dispose();t.host.innerHTML='other page';finish(growth);await pending;expect(t.host.innerHTML).toBe('other page')})

test('a stale data date is labelled as the cutoff day instead of today',async()=>{Date.now.mockReturnValue(Date.parse(meta.as_of)+2*86400000);const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('截至日有效分析用户');expect(t.host.innerHTML).toContain('<strong>12</strong>');expect(t.host.innerHTML).toContain('采集待核对');expect(t.host.innerHTML).not.toContain('今日进行中')})

test('hides the attention strip when all measured operational signals are healthy',async()=>{
 api.fetchOnlineTradeMetrics.mockResolvedValue({total:{traders:2,failed:0,pending:0,correlation_rate:1},days:[],chains:[]})
 const t=setup();await t.page.draw()
 expect(t.host.innerHTML).not.toContain('home-attention')
 expect(t.host.innerHTML).toContain('weekly-core')
})
test('shows evidence-backed failed orders as an actionable attention item',async()=>{
 api.fetchOnlineTradeMetrics.mockResolvedValue({total:{traders:2,failed:3,pending:0,correlation_rate:.9},days:[],chains:[]})
 const t=setup();await t.page.draw()
 expect(t.host.innerHTML).toContain('3 笔失败订单')
 expect(t.host.innerHTML).toContain('data-home-go="trade-monitor"')
 expect(t.host.innerHTML).toContain('已关联终态失败订单')
})

test('overview surfaces Uptime Kuma service failures in the actionable strip',async()=>{
 fetchSystemReliabilityOverview.mockResolvedValue({configured:true,state:'degraded',summary:{total:3,up:2,down:1,pending:0,maintenance:0,unknown:0,avgLatencyMs:142},groups:[],runtime:{uptimeSeconds:100}})
 const t=setup();await t.page.draw()
 expect(t.host.innerHTML).toContain('1 个服务监控异常')
 expect(t.host.innerHTML).toContain('data-home-go="system-reliability"')
 expect(t.host.innerHTML).toContain('2/3 正常')
})
