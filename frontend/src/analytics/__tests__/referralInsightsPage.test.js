import {test,expect,vi,beforeEach,afterEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchReferralInsights:vi.fn()}))
import {fetchReferralInsights} from '../../api/metrics.js'
import {createReferralInsightsPage} from '../../pages/referralInsights.js'
const result={summary:{users:2,inviters:1,used:1,trade:0,value:1,contactable:1,nearby:1,stored:1,continued:1,next_generation:1,next_used:0},global:{registered:10,inviters:2,bound:3,reinviters:1,next_generation:1,participation_rate:.2,continuation_rate:1/3,output:1/3,simultaneous:0},window:{days:28,observed_output:.5,next_generation:1,new_nearby:1,pending:2},scope:'all',ranking:[],daily:[],cohorts:[],quality:{selected:1,counts:{'ID=0':1}},facts_as_of:'2026-10-11T01:00:00Z',as_of:1791680000000,drill:{cache_id:'test'}}
function setup(){const nodes={},filter={dataset:{rfFilter:'period'},value:'all'},host={innerHTML:'',prepend:n=>host.notice=n.textContent,querySelector:s=>nodes[s]??(nodes[s]={}),querySelectorAll:s=>s==='[data-rf-filter]'?[filter]:[]};const rank={innerHTML:'',querySelector:s=>nodes[s]??(nodes[s]={}),querySelectorAll:()=>[]};const ctx={$:s=>s==='#as-output'?host:s==='#rf-ranking'?rank:(nodes[s]??(nodes[s]={})),esc:String,fmt:String,table:()=>'',drawer:{},clear:vi.fn(),dataStore:{meta:{asOf:1791680000000,snapshot_cutoff:'2026-10-11T01:00:00Z'}}};return {page:createReferralInsightsPage(ctx),nodes,filter,host}}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('document',{createElement:()=>({})})})
afterEach(()=>vi.unstubAllGlobals())
test('default is cumulative ranking and all-population self growth is labelled independently',async()=>{
 fetchReferralInsights.mockResolvedValue(result);const t=setup();await t.page.draw({source:'all'})
 expect(fetchReferralInsights.mock.calls[0][0]).toMatchObject({scope:'all',quality:'all',window_days:28});expect(t.host.innerHTML).toContain('全体用户的推荐传播');expect(t.host.innerHTML).toContain('不受上方');expect(t.host.innerHTML).toContain('20.0%')
})
test('unapplied period edits remain pending and only explicit application changes the request',async()=>{
 fetchReferralInsights.mockResolvedValue(result);const t=setup();await t.page.draw({source:'all'});t.filter.value='7';t.filter.onchange();expect(t.page.hasPendingChanges()).toBe(true)
 await t.nodes['[data-rf-apply]'].onclick();expect(fetchReferralInsights.mock.calls.at(-1)[0].scope).toBe('period');expect(t.page.hasPendingChanges()).toBe(false)
})
test('refresh errors preserve results only for identical filters',async()=>{
 fetchReferralInsights.mockResolvedValueOnce(result).mockRejectedValueOnce(Error('offline')).mockRejectedValueOnce(Error('offline'));const t=setup();await t.page.draw({source:'all'});await t.page.draw({source:'all'});expect(t.host.notice).toContain('保留上次结果');expect(t.host.innerHTML).toContain('全体用户的推荐传播')
 t.filter.value='7';t.filter.onchange();await t.nodes['[data-rf-apply]'].onclick();expect(t.host.innerHTML).toContain('加载失败');expect(t.host.innerHTML).not.toContain('全体用户的推荐传播')
})
test('a late request after disposal does not overwrite another page',async()=>{
 let resolve;fetchReferralInsights.mockImplementation(()=>new Promise(r=>resolve=r));const t=setup(),pending=t.page.draw({source:'all'});t.page.dispose();t.host.innerHTML='another page';resolve(result);await pending;expect(t.host.innerHTML).toBe('another page')
})
