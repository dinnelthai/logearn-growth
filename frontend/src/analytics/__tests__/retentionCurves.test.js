import {test,expect,vi,beforeEach,afterEach} from 'vitest'
import {createRequire} from 'node:module'
import {groupDailyRetention,retentionCurveOption,retentionPoint} from '../retentionCurveModel.js'
import {createRetentionAggPage} from '../../pages/retentionAgg.js'
vi.mock('../../api/metrics.js',()=>({fetchRetentionMetrics:vi.fn()}))
vi.mock('../../api/drill.js',()=>({fetchDrillUsers:vi.fn(),fetchUserTimeline:vi.fn()}))
import {fetchRetentionMetrics} from '../../api/metrics.js'
const require=createRequire(import.meta.url),{computeRetentionCurves}=require('../../../../backend/src/analytics/retentionCurves.js')
const DAY=86400000,MON=Date.parse('2026-09-07T00:00:00+07:00'),c={start:MON,end:MON+2*DAY,initial:'chip',returning:'chip',source:'all'}
const result=()=>computeRetentionCurves([{id:'user:1',events:[{type:'chip',t:MON+1000},{type:'chip',t:MON+2*DAY+1000}]},{id:'user:2',events:[{type:'chip',t:MON+DAY+1000},{type:'chip',t:MON+2*DAY+1000}]}],{...c,asOf:MON+3*DAY+3600000}).payload
function setup(){const nodes=new Map(),events={},charts=[],cells=[{dataset:{retCell:'week:2026-09-07',period:'1'}}],subsets=[{dataset:{retSubset:'unobserved'}}];const node=()=>({isConnected:true,innerHTML:'',addEventListener:vi.fn(function(type,fn){this[type]=fn})});const host=node();host.querySelector=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)};host.querySelectorAll=s=>s==='[data-ret-cell]'?cells:s==='[data-ret-subset]'?subsets:[]
 vi.stubGlobal('echarts',{init:vi.fn(()=>{const chart={setOption:vi.fn(),on:vi.fn((k,fn)=>events[k]=fn),dispose:vi.fn()};charts.push(chart);return chart})})
 const ctx={$:s=>s==='#as-output'?host:host.querySelector(s),clear:vi.fn(),esc:String,fmt:String,names:{chip:'有效分析'},table:(_h,rows)=>JSON.stringify(rows),stat:(...parts)=>parts.join(' '),drawer:{openRemote:vi.fn()},dataStore:{meta:{asOf:MON+3*DAY+3600000}},isAgg:true};return {host,nodes,events,charts,ctx,page:createRetentionAggPage(ctx),cells,subsets}
}
beforeEach(()=>{vi.resetAllMocks();fetchRetentionMetrics.mockResolvedValue({...result(),drill:{cache_id:'cached'}})})
afterEach(()=>vi.unstubAllGlobals())
test('weekly chart keeps the full denominator and does not draw partial-day or immature points',()=>{
 const r=result(),g=r.curve_groups.week[0],option=retentionCurveOption([g]);expect(option.yAxis.max).toBe(100);expect(option.series[0].smooth).toBe(false);expect(option.series[0].connectNulls).toBe(false)
 expect(option.series[0].data[1]).toMatchObject({value:50,denominator:2,retained:1});expect(option.series[0].data[2].value).toBeNull();expect(option.series[0].data[7].value).toBeNull();expect(option.tooltip.formatter({data:option.series[0].data[1],seriesName:'周批次'})).toContain('1 / 2 人')
})
test('daily metrics regroup to the same fixed weekly numerators and maturity as the server',()=>{
 const r=result(),rebuilt=groupDailyRetention(r.daily,{...c,asOf:r.as_of});for(const p of r.curve_groups.week[0].periods){const actual=rebuilt.week[0].periods[p.period];expect(actual.complete).toBe(p.complete);expect(actual.eligible_users).toBe(p.eligible_users);expect(actual.retention_rate).toBe(p.retention_rate)}
})
test('known missing intermediate coverage blocks continuous retention without inventing a daily zero',()=>{
 const daily=[{cohort_date:'2026-09-07',cohort_start:MON,cohort_size:2,data_available:true,periods:[{period:2,data_available:true,continuous_data_available:false,retained_users:1,continuous_retained_users:null}]}]
 const g=groupDailyRetention(daily,{start:MON,end:MON+DAY,asOf:MON+10*DAY,maxPeriods:7}).daily[0]
 expect(retentionPoint(g,2).rate).toBe(.5);expect(retentionPoint(g,2,true).complete).toBe(false);expect(retentionPoint(g,2,true).pending_users).toBe(2)
})
test('curve click selects its exact day and list actions keep the cached snapshot',async()=>{
 const t=setup();await t.page.draw(c);t.events.click({data:{value:50,group_id:'week:2026-09-07',period:1}});t.subsets[0].onclick();expect(t.ctx.drawer.openRemote).toHaveBeenLastCalledWith(expect.objectContaining({selection:{cache_id:'cached',list_key:'retention:week:2026-09-07:D1:unobserved'}}));expect(t.host.innerHTML).toContain('完整观察日未观测回访');t.page.dispose();expect(t.charts.every(chart=>chart.dispose.mock.calls.length===1)).toBe(true)
})
test('horizon changes request D30 data instead of padding a D7 response',async()=>{
 const t=setup();await t.page.draw(c);t.host.querySelector('[data-ret-horizon]').onchange({target:{value:'30'}});await vi.waitFor(()=>expect(fetchRetentionMetrics).toHaveBeenLastCalledWith(expect.objectContaining({maxDailyPeriods:30})))
})
test('leaving retention ignores late responses and failed new configurations do not show old curves',async()=>{
 let finish;fetchRetentionMetrics.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw(c);t.page.dispose();t.host.innerHTML='other page';finish({...result(),drill:{cache_id:'cached'}});await pending;expect(t.host.innerHTML).toBe('other page')
 fetchRetentionMetrics.mockRejectedValue(Error('offline'));await t.page.draw({...c,start:MON+DAY});expect(t.host.innerHTML).toContain('留存加载失败');expect(t.host.innerHTML).not.toContain('固定入组批次的用户留存率曲线')
})
test('empty cohorts show an explanation rather than a zero retention line',async()=>{
 fetchRetentionMetrics.mockResolvedValue({curve_groups:{daily:[],week:[],all:[]},as_of:MON+3*DAY});const t=setup();await t.page.draw(c);expect(t.host.innerHTML).toContain('当前入组日期没有首次行为用户');expect(t.charts).toHaveLength(0)
})
