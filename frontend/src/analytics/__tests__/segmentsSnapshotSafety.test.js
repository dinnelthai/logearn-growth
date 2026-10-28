import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',async(importOriginal)=>({
 ...(await importOriginal()),fetchSegmentsMetrics:vi.fn()
}))
vi.mock('../../comparison/panelAgg.js',()=>({mountComparisonAgg:vi.fn(()=>()=>{})}))
import {fetchSegmentsMetrics} from '../../api/metrics.js'
import {createSegmentsAggPage} from '../../pages/segmentsAgg.js'

function setup(){
 const outputs=new Map()
 const $=id=>{
  if(!outputs.has(id))outputs.set(id,{
    innerHTML:'',textContent:'',querySelector:()=>null,querySelectorAll:()=>[]
  })
  return outputs.get(id)
 }
 const ctx={
  $,esc:String,fmt:String,pct:()=>'',table:()=>'',stat:()=>'',drawer:{},
  asof:1000,clock:String,date:String,names:{},clear:vi.fn(),
  dataStore:{meta:{storage:'rollup',asOf:1000}}
 }
 return {page:createSegmentsAggPage(ctx),ctx,host:$('#as-output')}
}

beforeEach(()=>vi.resetAllMocks())

test('segments may reuse failed refresh only for the identical server data cutoff',async()=>{
 const m={total:12,segments:[],tags:{},drill:{cache_id:'old'}}
 fetchSegmentsMetrics.mockResolvedValueOnce(m).mockRejectedValueOnce(Error('temporary failure'))
 const t=setup(),filters={source:'all'}
 await t.page.draw(filters)
 await t.page.draw(filters)
 expect(t.host.innerHTML).toContain('ui-view-state-partial')
 expect(t.host.innerHTML).toContain('上次快照')
 t.page.dispose()
})

test('new remote asOf is a distinct snapshot even with unchanged filter settings',async()=>{
 const m={total:12,segments:[],tags:{},drill:{cache_id:'old'}}
 fetchSegmentsMetrics.mockResolvedValueOnce(m).mockRejectedValueOnce(Error('new snapshot not ready'))
 const t=setup()
 await t.page.draw({source:'all'})
 t.ctx.dataStore.meta.asOf=2000
 await t.page.draw({source:'all'})
 expect(fetchSegmentsMetrics.mock.calls[1][0].as_of).toBe(2000)
 expect(t.host.innerHTML).toContain('分群加载失败')
 expect(t.host.innerHTML).not.toContain('ui-view-state-partial')
 expect(t.host.innerHTML).not.toContain('上一次相同条件的分析结果')
 t.page.dispose()
})
