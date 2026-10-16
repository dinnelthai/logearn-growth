import {test,expect} from 'vitest'
import {loginBreakdownMarkup} from '../../pages/loginBreakdown.js'
import {visitDimensionsMarkup} from '../../pages/pageVisits.js'
const ctx={esc:s=>String(s).replaceAll('<','&lt;'),fmt:String,table:(heads,rows)=>JSON.stringify({heads,rows})}
test('login panel shows independent user and event counts with explicit manual-only conversion',()=>{
 const login_breakdown=[{type:'manual',label:'主动登录',users:2,events:3},{type:'auto_restore',label:'自动恢复登录',users:4,events:9},{type:'unknown',label:'历史/未知类型',users:1,events:1}]
 const html=loginBreakdownMarkup({login_breakdown,days:[{date:'2026-10-15',login_breakdown}]},ctx)
 expect(html).toContain('自动恢复登录');expect(html).toContain('login_type=manual');expect(html).toContain('各行用户数不可相加');expect(html).toContain('4 / 9')
})
test('page dimensions distinguish float, navigation and viewport with unknown duration',()=>{
 const row={value:'float',visits:8,users:4,duration_visits:0,average_duration_ms:null}
 const html=visitDimensionsMarkup(ctx,{visit_dimensions:{view_mode:[row],navigation_source:[{...row,value:'reload'}],viewport:[{...row,value:'narrow'}]}})
 expect(html).toContain('浮窗');expect(html).toContain('刷新');expect(html).toContain('&lt;768px');expect(html).toContain('—');expect(html).toContain('完整查询结果');expect(html).not.toContain('0.0 秒')
})
