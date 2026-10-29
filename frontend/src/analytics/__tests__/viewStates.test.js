import {test,expect} from 'vitest'
import {viewState} from '../../components/viewStates.js'

test('failure state escapes server messages and exposes an explicit action',()=>{
 const html=viewState({
  kind:'error',title:'加载失败',description:'<script>危害</script>',
  actionLabel:'重新加载',actionAttr:'data-work-refresh'
 })
 expect(html).toContain('role="alert"')
 expect(html).toContain('&lt;script&gt;')
 expect(html).not.toContain('<script>')
 expect(html).toContain('data-work-refresh')
 expect(html).toContain('重新加载')
})
test('empty and partial states do not imply zero values or create unsupported buttons',()=>{
 const html=viewState({kind:'partial',title:'数据尚未完整',description:'采集覆盖未确认'})
 expect(html).toContain('数据尚未完整')
 expect(html).toContain('role="status"')
 expect(html).not.toContain('type="button"')
 expect(viewState({kind:'empty',actionLabel:'危险操作',actionAttr:'onclick="run()"'}))
  .not.toContain('onclick=')
})

test('all aggregated report errors have an explicit user-triggered retry affordance',()=>{
 for(const actionAttr of [
   'data-funnel-retry','data-paths-retry','data-trade-retry',
   'data-segments-retry','data-channels-retry'
 ]){
  const html=viewState({kind:'error',title:'数据请求失败',description:'HTTP 503',actionLabel:'重新运行',actionAttr})
  expect(html).toContain('type="button"')
  expect(html).toContain(actionAttr)
  expect(html).toContain('role="alert"')
 }
})

test('a stale report is marked partial, not completed or empty',()=>{
 const html=viewState({
  kind:'partial',title:'保留上一次相同条件的分析结果',
  description:'新数据加载失败：HTTP 503。以下内容来自上次快照。',
  actionLabel:'重新运行',actionAttr:'data-segments-retry'
 })
 expect(html).toContain('ui-view-state-partial')
 expect(html).toContain('role="status"')
 expect(html).toContain('上次快照')
 expect(html).toContain('data-segments-retry')
})
