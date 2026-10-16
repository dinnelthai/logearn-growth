import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchNorthStarMetrics:vi.fn(),fetchOnlineTradeMetrics:vi.fn(),fetchTradeVolumeMetrics:vi.fn(),fetchSegmentsMetrics:vi.fn(),fetchMyMonitorMetrics:vi.fn()}))
vi.mock('../../pages/platformAssets.js',()=>({mountPlatformAssets:()=>({dispose(){}})}))
vi.mock('../../api/backendAnalytics.js',()=>({fetchBackendMeta:vi.fn()}))
import * as api from '../../api/metrics.js'
import {fetchBackendMeta} from '../../api/backendAnalytics.js'
import {createHomeMonitor} from '../../pages/homeMonitor.js'
import {growthPanel} from '../../pages/homeGrowth.js'
const meta={snapshot_id:'shared',as_of:'2026-10-15T02:00:00Z',start_at:'2026-10-09T00:00:00Z'}
const metric=key=>({key,label:key,rate:null,numerator:0,denominator:0,pending:0,available:true,formula:'specific denominator'})
const growth={metrics:Object.fromEntries(['activation','visit_login','d1','d7'].map(k=>[k,metric(k)])),days:[]}
function setup(){const nodes=new Map(),go={dataset:{homeGo:'north'}},host={innerHTML:'',querySelector:s=>nodes.get(s)||(nodes.set(s,{}),nodes.get(s)),querySelectorAll:s=>s==='[data-home-go]'?[go]:[]},ctx={$:()=>host,isAgg:true,clear:vi.fn(),esc:String,fmt:String,table:()=>'',navigatePlatform:vi.fn()};return {host,ctx,page:createHomeMonitor(ctx),go}}
beforeEach(()=>{vi.resetAllMocks();vi.spyOn(Date,'now').mockReturnValue(Date.parse(meta.as_of));fetchBackendMeta.mockResolvedValue(meta);api.fetchNorthStarMetrics.mockResolvedValue({days:[{date:'2026-10-15',active_users:12,new_users:3,returning_users:9}],totals:{active_users:20}});api.fetchOnlineTradeMetrics.mockResolvedValue({total:{traders:2,failed:0,pending:1},days:[],chains:[]});api.fetchTradeVolumeMetrics.mockResolvedValue({total:{volume_usd:100,missing_values:0,negative_values:0},days:[]});api.fetchSegmentsMetrics.mockResolvedValue({focus:{value_users:10},drill:{cache_id:'s'}});api.fetchMyMonitorMetrics.mockResolvedValue(growth)})
test('overview puts north star first, shares one platform period and does not combine visit and analysis retention',async()=>{
 const t=setup();await t.page.draw();const html=t.host.innerHTML
 expect(html.indexOf('北极星 · 每日')).toBeLessThan(html.indexOf('增长驱动'));expect(html.indexOf('增长驱动')).toBeLessThan(html.indexOf('商业表现'));expect(html).toContain('今日 12');expect(html).toContain('两者分别保留')
 const calls=Object.values(api).map(fn=>fn.mock.calls[0][0]);expect(new Set(calls.map(c=>c.snapshot_id))).toEqual(new Set(['shared']));expect(new Set(calls.map(c=>c.start)).size).toBe(1);expect(new Set(calls.map(c=>c.end)).size).toBe(1);expect(calls.every(c=>c.audience_ids==null)).toBe(true)
 t.go.onclick();expect(t.ctx.navigatePlatform).toHaveBeenCalledWith('north',{days:7,asOf:Date.parse(meta.as_of)})
})
test('growth failure leaves north and commercial results visible without inventing zero rates',async()=>{
 api.fetchMyMonitorMetrics.mockRejectedValue(Error('offline'));const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('今日 12');expect(t.host.innerHTML).toContain('增长转化暂不可用');expect(t.host.innerHTML).toContain('商业表现')
 const html=growthPanel(growth,{esc:String,fmt:String,table:()=>''});expect(html).toContain('无分母为—');expect(html).not.toContain('0.0%')
})
test('leaving the overview prevents late responses from replacing the next page',async()=>{let finish;api.fetchMyMonitorMetrics.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw();await Promise.resolve();await Promise.resolve();t.page.dispose();t.host.innerHTML='other page';finish(growth);await pending;expect(t.host.innerHTML).toBe('other page')})

test('a stale data date is labelled as the cutoff day instead of today',async()=>{Date.now.mockReturnValue(Date.parse(meta.as_of)+2*86400000);const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('截至日 12');expect(t.host.innerHTML).toContain('采集待核对');expect(t.host.innerHTML).not.toContain('今日进行中')})
