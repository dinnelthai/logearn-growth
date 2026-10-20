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

test('first screen panel distinguishes measured zero, unknown and sample coverage',async()=>{
 const {firstScreenMarkup}=await import('../../pages/pageVisits.js')
 const html=firstScreenMarkup(ctx,{first_screen:{sessions:3,duration_sessions:1,unknown_sessions:2,average_duration_ms:0,median_duration_ms:0}})
 expect(html).toContain('0.0 秒');expect(html).toContain('1 / 3');expect(html).toContain('2 个会话时长未知');expect(html).toContain('后续页面不计入')
 expect(firstScreenMarkup(ctx,{first_screen:{sessions:1,duration_sessions:0,unknown_sessions:1,average_duration_ms:null,median_duration_ms:null}})).not.toContain('0.0 秒')
})

test('diagnostic empty states do not invent zero success or click-through rates',async()=>{
 const {requestDiagnosticsMarkup,valueDiagnosticsMarkup,homeBounceMarkup}=await import('../../pages/diagnostics.js')
 const html=requestDiagnosticsMarkup(ctx,{families:{analysis:{available:false},login:{available:false},page_load:{available:false}}})
 expect(html).toContain('待接入');expect(html).not.toContain('0.0%')
 const value=valueDiagnosticsMarkup(ctx,{exposure:{available:false},first_value:{available:false},retention:[]})
 expect(value).toContain('不推测曝光人数或点击率');expect(value).not.toContain('0.0%')
 expect(homeBounceMarkup(ctx,{available:false})).toContain('等待页面事件接入')
})
test('bounce and request diagnostics escape reported dimensions, preserve unknown rates and bind drill keys',async()=>{
 const {homeBounceMarkup,requestDiagnosticsMarkup}=await import('../../pages/diagnostics.js')
 const b={available:true,bounce_rate:null,bounced:0,denominator:0,engaged:0,engaged_users:0,pending:1,unknown:2,dimensions:{source:[{value:'<script>',sessions:3,bounced:0,denominator:0,bounce_rate:null,pending:1,unknown:2,list_key:'bounce:source:0'}]}}
 expect(homeBounceMarkup(ctx,b)).toContain('&lt;script>');expect(homeBounceMarkup(ctx,b)).toContain('bounce:source:0');expect(homeBounceMarkup(ctx,b)).not.toContain('0.0%')
 const family={available:true,requests:1,users:1,success_rate:null,terminal_coverage:null,page_association_rate:null,counts:{unknown:1},latency:[],dimensions:{},errors:[],quality:{missing_id_events:0,orphan_terminals:0,conflicts:0},records:[{id:'<bad>',user_id:'<user>',state:'unknown',duration_ms:null,chain:'3',page_visit_id:null}],records_truncated:false}
 const html=requestDiagnosticsMarkup(ctx,{families:{page_load:family}})
 expect(html).toContain('diagnostic:page_load:unknown');expect(html).toContain('&lt;bad>');expect(html).not.toContain('NaN');expect(html).toContain('结果未知')
})

test('ranking click panel renders page visitor denominator without card exposure dependency',async()=>{
 const {valueDiagnosticsMarkup}=await import('../../pages/diagnostics.js')
 const html=valueDiagnosticsMarkup(ctx,{page_clicks:{available:true,rows:[{list_type:'signals',page_name:'signals',visitor_users:2,clicked_users:1,rate:.5,unmatched_clicks:1,list_key:'page-click:signals'}]},first_value:{available:false},retention:[]})
 expect(html).toContain('50.0%');expect(html).toContain('page_viewed');expect(html).toContain('page-click:signals:visitors');expect(html).not.toContain('卡片曝光待接入')
})
