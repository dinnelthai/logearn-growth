import {test,expect} from 'vitest'
import {loginSceneMarkup,inviteSceneMarkup} from '../../pages/conversionScenes.js'
import {navigationMode} from '../../navigation.js'
const ctx={esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),fmt:String,table:(heads,rows)=>JSON.stringify({heads,rows})}
test('conversion scenes share conversion navigation while referral stays in acquisition',()=>{
 expect(navigationMode('login-conversion')).toBe('funnel');expect(navigationMode('invite-conversion')).toBe('funnel');expect(navigationMode('referral')).toBe('channels')
})
test('login scene keeps existing evidence while attempt/stage rates are unavailable',()=>{
 const html=loginSceneMarkup(ctx,{click_users:3,login_breakdown:[{type:'manual',users:2,events:4,list_key:'manual'},{type:'auto_restore',users:5,events:6,list_key:'auto'}],login:{available:false,quality:{missing_id_events:0,orphan_terminals:0,conflicts:0}},stages:{available:false,quality:{missing_stage_id:0,orphan_stage_finishes:0}},records:[],record_total:0})
 expect(html).toContain('自动恢复');expect(html).toContain('不补造尝试成功率');expect(html).toContain('阶段事件待接入');expect(html).not.toContain('0.0%');expect(html).toContain('login:clicks')
})
test('invite scene marks missing funnel events and presents independent facts without claiming link attribution',()=>{
 const m={available:false,steps:[{label:'邀请访问',available:false,flows:0,users:0,list_key:'visit'}],binding_rate:null,mature_flows:0,pending:0,window_hours:24,independent_facts:{available:true,relations:12,users:10,list_key:'facts'},states:[],errors:[],dimensions:{},quality:{missing_flow_events:0,orphan_flows:0,conflicting_flows:0,unverified_binding_events:0},retention:[],records:[],record_total:0}
 const html=inviteSceneMarkup(ctx,m);expect(html).toContain('待接入');expect(html).toContain('有效关系 12');expect(html).toContain('不受链接/活动筛选影响');expect(html).not.toContain('0.0%');expect(html).toContain('data-op-key="facts"')
})
test('invitation record and failure dimensions are escaped',()=>{
 const m={available:true,steps:[],binding_rate:null,mature_flows:0,pending:0,window_hours:24,flow_count:1,users:1,independent_facts:{available:false,error:'<script>'},states:[],errors:[{state:'invalid',reason:'<bad>',flows:1,users:1,list_key:'reason'}],dimensions:{},quality:{},retention:[],records:[{id:'<flow>',user_id:'user:1',visited_at:1000,inviter:'2',link:'<link>',state:'invalid',relation_id:null}],record_total:1}
 const html=inviteSceneMarkup(ctx,m);expect(html).toContain('&lt;script>');expect(html).toContain('&lt;flow>');expect(html).toContain('&lt;bad>');expect(html).not.toContain('<script>')
})
test('historical invitation associations display evidence and all timestamps independently of missing flow events',()=>{
 const m={available:false,steps:[],binding_rate:null,mature_flows:0,pending:0,window_hours:24,independent_facts:{available:true,relations:2,users:2,list_key:'facts'},states:[],errors:[],dimensions:{},quality:{},retention:[],records:[],record_total:0,association:{available:true,steps:[{label:'身份确认',entries:1,users:1,list_key:'invite:association:account'}],states:[{state:'ambiguous',entries:1,users:1,list_key:'ambiguous'}],records:[{id:'<entry>',user_id:'user:1',visited_at:1000,login_at:2000,relation_observed_at:1500,state:'ambiguous',relation_id:null,analysis_at:null}],record_total:1}}
 const html=inviteSceneMarkup(ctx,m);expect(html).toContain('邀请入口与数据库关系关联');expect(html).toContain('多个候选入口');expect(html).toContain('登录时间');expect(html).toContain('关系时间');expect(html).toContain('仅时间接近不关联用户');expect(html).toContain('&lt;entry>');expect(html).toContain('invite:association:account');expect(html).not.toContain('0.0%')
})

test('conversion timeline shows only selected workflow facts and escapes reported values',async()=>{
 const {conversionTimelineDetails}=await import('../../pages/observedDrill.js')
 const html=conversionTimelineDetails({event_name:'invite_binding_finished',properties:{invite_flow_id:'<flow>',outcome:'bound',reason_code:'<reason>',password:'DO_NOT_SHOW'}},ctx.esc)
 expect(html).toContain('绑定成立');expect(html).toContain('&lt;flow>');expect(html).toContain('&lt;reason>');expect(html).not.toContain('DO_NOT_SHOW')
})
test('new registration validation is independent from legacy matching and shows database outcomes',()=>{
 const m={available:false,steps:[],binding_rate:null,mature_flows:0,pending:0,window_hours:24,independent_facts:{available:true,relations:0,users:0,list_key:'facts'},states:[],errors:[],dimensions:{},quality:{},retention:[],records:[],record_total:0,registration:{available:true,facts_available:true,steps:[{key:'registered',label:'注册邀请成功',entries:1,users:1,list_key:'invite:registration:registered'}],states:[{state:'existing_account',entries:1,users:1,list_key:'existing'}],records:[{id:'<flow>',user_id:'user:1',visited_at:2000,login_at:4000,account_created_at:3000,inviter:'2',actual_inviter:'3',state:'inviter_mismatch'}],record_total:1}}
 const html=inviteSceneMarkup(ctx,m);expect(html).toContain('新增注册邀请校验');expect(html).toContain('历史数据不回算');expect(html).toContain('已有账号，不计新增');expect(html).toContain('实际邀请人与入口码对应账号不一致');expect(html).toContain('注册时间');expect(html).toContain('invite:registration:registered');expect(html).toContain('&lt;flow>')
 m.registration.facts_available=false;expect(inviteSceneMarkup(ctx,m)).toContain('成功数尚无法确认')
})
test('registration is the default view and the effective start comes from the backend',()=>{
 const m={available:false,steps:[],binding_rate:null,mature_flows:0,pending:0,window_hours:24,independent_facts:{available:true,relations:0,users:0,list_key:'facts'},states:[],errors:[],dimensions:{},quality:{},retention:[],records:[],record_total:0,registration:{effective_from:Date.parse('2026-10-18T00:00:00Z'),available:false,facts_available:true,steps:[],states:[],records:[],record_total:0}}
 const html=inviteSceneMarkup(ctx,m)
 expect(html).toContain('2026-10-18 07:00:00')
 expect(html).toContain('历史关联与显式流程（辅助核对）')
 expect(html).toMatch(/<details class="a-card si-panel" ><summary>历史关联/)
})
