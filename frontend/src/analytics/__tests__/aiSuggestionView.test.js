import {test,expect} from 'vitest'
import {renderAISuggestion} from '../../pages/aiSuggestionView.js'
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const render=(s)=>renderAISuggestion(s,{esc,json:obj=>esc(JSON.stringify(obj,null,2)),label:String})

const pending={
  id:'s1',user_status:'pending',priority:'P0',
  business_problem:'Activation gap',action:'Review funnel in this cohort',
  priority_reason:'Analysis coverage declined',hypothesis:'New visitors are not discovering chips',
  uncertainties:['Historical coverage incomplete'],
  data_evidence:[{id:'business-aggregate-1',metric:'analysis_users',value:12}],
  validation_metrics:['analysis_users'],
}

test('AI suggestion shows the business decision before technical evidence and does not invent impact',()=>{
 const html=render(pending)
 expect(html).toContain('Activation gap')
 expect(html).toContain('Review funnel in this cohort')
 expect(html).toContain('Analysis coverage declined')
 expect(html).toContain('Historical coverage incomplete')
 expect(html).toContain('data-suggestion="s1"')
 expect(html).toContain('value="adopted"')
 expect(html).toContain('value="rejected"')
 expect(html).not.toContain('value="executed"')
 expect(html.indexOf('建议行动')).toBeLessThan(html.indexOf('查看数据证据'))
 expect(html).toContain('business-aggregate-1')
 expect(html).toContain('不代表结论已被验证')
 expect(html).not.toContain('已验证成功')
})

test('unknown status or missing suggestion ID cannot expose write controls',()=>{
 for(const obj of [{...pending,id:null},{...pending,user_status:undefined},{...pending,user_status:'weird'}]){
  const html=render(obj)
  expect(html).not.toContain('<form')
  expect(html).not.toContain('value="adopted"')
 }
})

test('saved execution and rejection remain read-only; completed execution has review action',()=>{
 const completed=render({...pending,user_status:'executed',actual_action:'Checked affected cohort',executed_at:1793322000000})
 expect(completed).toContain('Checked affected cohort')
 expect(completed).toContain('data-review="s1"')
 expect(completed).not.toContain('<form')
 const rejected=render({...pending,user_status:'rejected',rejection_reason:'Evidence incomplete'})
 expect(rejected).toContain('Evidence incomplete')
 expect(rejected).not.toContain('data-review')
 expect(rejected).not.toContain('<form')
})

test('model-provided text is escaped even inside evidence and action annotations',()=>{
 const html=render({...pending,action:'<img src=x onerror=alert(1)>',business_problem:'<script>x</script>',
  uncertainties:['<unsafe>'],data_evidence:{raw:'<script>'}})
 expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
 expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
 expect(html).not.toContain('<script>')
 expect(html).not.toContain('<img')
})
