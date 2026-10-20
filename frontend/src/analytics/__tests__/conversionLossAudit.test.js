import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchTrackingAudit:vi.fn()}))
import {fetchTrackingAudit} from '../../api/metrics.js'
import {parseTrackingSamples} from '../trackingSamples.js'
import {conversionLossMarkup} from '../../pages/conversionLoss.js'
import {trackingAuditMarkup,createTrackingAuditPanel} from '../../pages/trackingAudit.js'
const ctx={esc:s=>String(s??'').replaceAll('<','&lt;'),fmt:String,table:(heads,rows)=>heads.join('|')+rows.map(r=>r.join('|')).join('\n')}
const period={start:1000,end:2000,list_key:'loss:current',visitors:10,logged:5,sequenced:2,outside:3,analyzed:5,login_rate:.5,analysis_rate:.4}
const audit={start:0,end:1000,snapshot_cutoff:'2026-10-19T00:00:00Z',summary:{received:10,included:7,same_id_others:2,excluded:1,reconciled:true,duplicate_rows:1,missing_event_ids:0,invalid_client_times:1,missing_identities:0,dirty_user_ids:0},counts:{requested:0,found:0,included:0,sample_consistent:0},rows:[]}
beforeEach(()=>vi.resetAllMocks())
test('browser event parsing strips credentials and identity fields before transmission and keeps exact expected diagnostic fields',()=>{
 const parsed=parseTrackingSamples(JSON.stringify([{event_id:'one',event_name:'analysis_requested',client_ts:10,user_id:'private',anonymous_id:'private',headers:{token:'secret'},properties:{analysis_request_id:'r',trigger:'user_action',password:'secret',signature:'secret'}}]))
 expect(parsed.event_ids).toEqual(['one']);expect(JSON.stringify(parsed)).not.toContain('secret');expect(JSON.stringify(parsed)).not.toContain('private');expect(parsed.samples[0].properties).toEqual({analysis_request_id:'r',trigger:'user_action'})
 expect(parseTrackingSamples('one\ntwo,one').event_ids).toEqual(['one','two'])
 expect(()=>parseTrackingSamples('[bad')).toThrow();expect(()=>parseTrackingSamples(Array(101).fill('id').join('\n'))).toThrow('100')
 expect(()=>parseTrackingSamples('[{"event_id":"one","client_ts":1},{"event_id":"one","client_ts":2}]')).toThrow('不一致')
})
test('loss view keeps evidence-outside users and refuses to invent rates when earlier visits were not collected',()=>{
 const m={start:1000,end:2000,previous_start:0,previous_end:1000,current:period,previous:{...period,list_key:'loss:previous',start:0,end:1000},attribution:{available:false,reason:'分母不足',delta:0,sequenced_delta:0,outside_delta:0},lost_users:3,reasons:[{label:'未知<script>',users:3,list_key:'unknown'}],diagnostic_availability:{analysis:false,login:false}}
 const html=conversionLossMarkup(ctx,m)
 expect(html).toContain('顺序证据外');expect(html).toContain('分母不足');expect(html).toContain('不能判为登录失败');expect(html).toContain('不是确认流失原因');expect(html).toContain('&lt;script>');expect(html).not.toContain('<script>')
})
test('arrival audit explains record reconciliation and does not equate fact inclusion or HTTP200 with complete collection',()=>{
 const html=trackingAuditMarkup(ctx,audit)
 expect(html).toContain('首次纳入代表事件');expect(html).toContain('这不是漏报率');expect(html).toContain('不保证计入某项业务指标');expect(html).toContain('仅完成库侧核验');expect(html).not.toContain('验收通过')
})
function panel(){
 const nodes={samples:{value:''},browser:{checked:false},http:{value:''},business:{checked:false},status:{textContent:''},result:{innerHTML:''},submit:{},latest:{},export:{disabled:true}}
 const selectors={'[data-tracking-samples]':'samples','[data-tracking-browser]':'browser','[data-tracking-http]':'http','[data-tracking-business]':'business','[data-tracking-status]':'status','[data-tracking-result]':'result','[data-tracking-latest]':'latest','[data-tracking-export]':'export'}
 const form={querySelector:s=>nodes[selectors[s]],querySelectorAll:()=>[nodes.submit,nodes.latest,nodes.export]}
 const host={isConnected:true,innerHTML:'',querySelector:s=>s==='[data-tracking-form]'?form:nodes[selectors[s]]}
 return {nodes,form,host,page:createTrackingAuditPanel(ctx)}
}
test('editing browser evidence invalidates pending responses and prevents exporting an old conclusion',async()=>{
 let finish;fetchTrackingAudit.mockImplementation(()=>new Promise(r=>finish=r))
 const p=panel(),pending=p.page.draw(p.host,{start:0,end:1000,snapshot_id:'old'})
 p.nodes.samples.value='changed-id';p.form.oninput();finish(audit);await pending
 expect(p.nodes.result.innerHTML).toBe('');expect(p.nodes.export.disabled).toBe(true);expect(p.nodes.status.textContent).toContain('重新核验')
})
test('leaving audit prevents late response writes; fresh submissions send sanitized samples with explicit declarations',async()=>{
 fetchTrackingAudit.mockResolvedValue(audit);const p=panel();await p.page.draw(p.host,{start:0,end:1000,snapshot_id:'snap'})
 p.nodes.samples.value=JSON.stringify({event_id:'one',event_name:'analysis_requested',client_ts:1,user_id:'private',properties:{token:'secret',analysis_request_id:'r'}})
 p.nodes.browser.checked=true;p.nodes.http.value='200';p.nodes.business.checked=true;p.form.oninput();await p.form.onsubmit({preventDefault(){}})
 const request=fetchTrackingAudit.mock.calls.at(-1)[0];expect(request.snapshot_id).toBe('snap');expect(request.browser_confirmed).toBe(true);expect(request.collector_business_success).toBe(true);expect(request.collector_status).toBe(200);expect(JSON.stringify(request)).not.toContain('secret');expect(JSON.stringify(request)).not.toContain('private')
 let finish;fetchTrackingAudit.mockImplementation(()=>new Promise(r=>finish=r));const pending=p.form.onsubmit({preventDefault(){}});p.page.dispose();p.nodes.status.textContent='other page';finish(audit);await pending;expect(p.nodes.status.textContent).toBe('other page')
})
