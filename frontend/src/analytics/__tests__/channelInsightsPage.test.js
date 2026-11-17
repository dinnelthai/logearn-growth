import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchChannelInsights:vi.fn()}))
import {fetchChannelInsights} from '../../api/metrics.js'
import {createChannelInsightsPage} from '../../pages/channelInsights.js'
const result={total:{users:2,new_users:1,analysis:1,succeeded:0,analysis_rate:.5,trade_rate:0},groups:[],days:[],as_of:1791680000000,definition:'真实来源',drill:{cache_id:'test'}}
function setup(){const pool={dataset:{ciPool:'new'}},host={innerHTML:'',querySelectorAll:s=>s==='[data-ci-pool]'?[pool]:[]},ctx={$:s=>s==='#as-output'?host:null,esc:String,fmt:String,table:()=>'',clear:vi.fn()};const page=createChannelInsightsPage(ctx);ctx.clear.mockImplementation(()=>page.dispose());return {page,host,pool}}
beforeEach(()=>vi.resetAllMocks())
test('channel pool uses applied source and changes only by explicit selection',async()=>{fetchChannelInsights.mockResolvedValue(result);const t=setup();await t.page.draw({start:1,end:2,source:'x'});expect(fetchChannelInsights.mock.calls[0][0]).toEqual({start:1,end:2,source:'x',pool:'active'});await t.pool.onclick();expect(fetchChannelInsights.mock.calls.at(-1)[0].pool).toBe('new');expect(t.host.innerHTML).toContain('不是已确认新增获客')})
test('refresh failure preserves only matching configurations',async()=>{fetchChannelInsights.mockResolvedValueOnce(result).mockRejectedValue(Error('offline'));const t=setup();await t.page.draw({source:'all'});await t.page.draw({source:'all'});expect(t.host.innerHTML).toContain('保留上次结果');await t.page.draw({source:'x'});expect(t.host.innerHTML).toContain('渠道加载失败');expect(t.host.innerHTML).not.toContain('真实来源与用户质量')})
test('disposed requests cannot overwrite another page',async()=>{let resolve;fetchChannelInsights.mockImplementation(()=>new Promise(r=>resolve=r));const t=setup(),pending=t.page.draw({source:'all'});t.page.dispose();t.host.innerHTML='another page';resolve(result);await pending;expect(t.host.innerHTML).toBe('another page')})

test('a failed refresh identifies stale channel data and only retries after a click',async()=>{
  const retry={click:null,addEventListener(_event,callback){this.click=callback}}
  fetchChannelInsights
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(Error('temporary outage'))
    .mockResolvedValueOnce(result)
  const t=setup()
  t.host.querySelector=selector=>selector==='[data-ci-retry]'?retry:null
  await t.page.draw({source:'all'})
  await t.page.draw({source:'all'})
  expect(t.host.innerHTML).toContain('ui-view-state-partial')
  expect(t.host.innerHTML).toContain('展示上次结果')
  expect(t.host.innerHTML).toContain('temporary outage')
  expect(fetchChannelInsights).toHaveBeenCalledTimes(2)
  await retry.click()
  expect(fetchChannelInsights).toHaveBeenCalledTimes(3)
  expect(t.host.innerHTML).not.toContain('ui-view-state-partial')
  t.page.dispose()
})
