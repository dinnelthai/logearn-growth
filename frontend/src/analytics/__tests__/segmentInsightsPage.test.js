import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../pages/segmentUserList.js',()=>({mountSegmentUserList:vi.fn()}))
vi.mock('../../api/userTags.js',()=>({fetchUserTags:vi.fn()}))
vi.mock('../../api/metrics.js',()=>({fetchSegmentsMetrics:vi.fn()}))
import {fetchUserTags} from '../../api/userTags.js'
import {fetchSegmentsMetrics} from '../../api/metrics.js'
import {createSegmentInsightsPage} from '../../pages/segmentInsights.js'
const metric={summary:{new_users:0,login_users:0,analysis_users:0,analysis_rate:null,avg_analysis_days:null,strategy_users:0,strategy_rate:null,trade_users:0,trade_rate:null,new_referred_users:0,new_referred_analysis_users:0},registered_total:0,total:0,unmatched_users:0,segments:[],comparison:[],registration_cohorts:[],start:1791300000000,end:1791400000000,as_of:1791400000000,facts_as_of:'2026-10-10T01:00:00Z',retention_reason:'历史覆盖未确认',drill:{cache_id:'result'}}
function setup(){const nodes={'[data-apply-insights]':{},'[data-reset-insights]':{},'[data-insight-dirty]':{textContent:''}},days={dataset:{insight:'days'},value:'7'},binding={dataset:{filter:'binding'},value:'all'}
const host={innerHTML:'',querySelector:s=>nodes[s],querySelectorAll:s=>s==='[data-insight]'?[days]:s==='[data-filter]'?[binding]:[]}
const ctx={$:()=>host,esc:String,fmt:String,pct:()=>'-',stat:(l,v)=>l+':'+v,table:()=>'',drawer:{},clear:vi.fn(),dataStore:{meta:{asOf:1791400000000}}}
return {page:createSegmentInsightsPage(ctx),host,nodes,days,binding,ctx}}
beforeEach(()=>{vi.resetAllMocks();fetchUserTags.mockResolvedValue([])})
test('unapplied edits survive refresh and leaving/returning still draws the page',async()=>{
fetchSegmentsMetrics.mockResolvedValue(metric);const t=setup();await t.page.draw({source:'all'})
t.binding.value='both';t.binding.onchange();await t.page.draw({source:'all'});expect(fetchSegmentsMetrics).toHaveBeenCalledTimes(1)
t.page.dispose();await t.page.draw({source:'all'});expect(fetchSegmentsMetrics).toHaveBeenCalledTimes(2);expect(t.nodes['[data-insight-dirty]'].textContent).toContain('未应用')
await t.nodes['[data-apply-insights]'].onclick();expect(fetchSegmentsMetrics.mock.calls.at(-1)[0].filters.binding).toBe('both')
})
test('changing the period cannot reuse another period result on failure',async()=>{
fetchSegmentsMetrics.mockResolvedValueOnce(metric).mockRejectedValueOnce(Error('offline'));const t=setup();await t.page.draw({source:'all'})
t.days.value='28';t.days.onchange();await t.nodes['[data-apply-insights]'].onclick()
expect(t.host.innerHTML).toContain('分群加载失败');expect(t.host.innerHTML).not.toContain('显示上次结果')
})
test('disposed requests never replace a newly mounted page',async()=>{
let resolve;fetchSegmentsMetrics.mockImplementation(()=>new Promise(r=>resolve=r));const t=setup(),pending=t.page.draw({source:'all'});await Promise.resolve();t.page.dispose();t.host.innerHTML='different page';resolve(metric);await pending;expect(t.host.innerHTML).toBe('different page')
})

test('business pool is the default and switching pools cannot reuse a failed result',async()=>{
 fetchSegmentsMetrics.mockResolvedValueOnce(metric).mockRejectedValueOnce(Error('offline'));const t=setup();await t.page.draw({source:'all'})
 expect(fetchSegmentsMetrics.mock.calls[0][0].pool).toBe('business')
 t.days.dataset.insight='pool';t.days.value='registered';t.days.onchange();await t.nodes['[data-apply-insights]'].onclick()
 expect(fetchSegmentsMetrics.mock.calls[1][0].pool).toBe('registered');expect(t.host.innerHTML).toContain('分群加载失败');expect(t.host.innerHTML).not.toContain('显示上次结果')
})
test('fixed audiences show their actual period and explicit audience selection includes signal-free users',async()=>{
 fetchSegmentsMetrics.mockResolvedValue(metric);const t=setup();t.page.configureAudience({ids:['user:1']})
 const start=1791300000000,end=1791400000000;await t.page.draw({source:'all',start,end,snapshotId:'fixed',audienceIds:['user:1']})
 expect(fetchSegmentsMetrics.mock.calls[0][0]).toMatchObject({start,end,pool:'registered',audience_ids:['user:1']})
 expect(t.host.innerHTML).toContain('人群统计期');expect(t.host.innerHTML.match(/<select data-insight="days"[^>]*>([\s\S]*?)<\/select>/)[1]).not.toContain('最近7天');expect(t.host.innerHTML).toContain('动态统计期')
})
