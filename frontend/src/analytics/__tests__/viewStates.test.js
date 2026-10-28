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
