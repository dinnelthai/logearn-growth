import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/metrics.js',()=>({fetchComparisonFunnelMetrics:vi.fn()}))
vi.mock('../../api/drill.js',()=>({fetchDrillUsers:vi.fn(),fetchUserTimeline:vi.fn()}))
import {fetchComparisonFunnelMetrics} from '../../api/metrics.js'
import {fetchDrillUsers,fetchUserTimeline} from '../../api/drill.js'
import {mountSegmentFunnelComparison} from '../../pages/segmentFunnelComparison.js'
const metrics={drill:{cache_id:'fixed-segments'},comparison:[{label:'A',list_key:'g0',users:2},{label:'B',list_key:'g1',users:2}]}
const cell=(count,list_key)=>({count,list_key}),result={preset:'analysis',hours:24,pool_users:3,start:10,end:100,definition:'固定名单',drill:{cache_id:'funnel-result'},groups:[{label:'A',pool_users:2,entered:2,missing_start:cell(0,'missing'),incomplete:cell(0,'incomplete'),stages:[{step:'logged_in_visit',reached:cell(2,'reached'),unobserved:cell(1,'unobserved'),pending:cell(0,'pending')}]}]}
function setup(){
 const button={disabled:false},selection=[{value:'g0'},{value:'g1'}],form={elements:{preset:{value:'analysis'},hours:{value:'24'}},querySelector:()=>button,querySelectorAll:()=>selection}
 const status={textContent:''},link={dataset:{crowdList:'reached',title:'A'}},output={innerHTML:'',querySelectorAll:()=>[link]}
 const host={isConnected:true,innerHTML:'',querySelector:s=>s==='[data-crowd-funnel]'?form:s==='[data-crowd-status]'?status:output}
 const ctx={esc:String,fmt:String,table:(heads,rows)=>JSON.stringify({heads,rows}),drawer:{openRemote:vi.fn()}}
 const dispose=mountSegmentFunnelComparison(host,metrics,ctx)
 return {host,form,status,output,button,ctx,selection,link,dispose,submit:()=>form.onsubmit({preventDefault(){}})}
}
beforeEach(()=>vi.resetAllMocks())
test('runs against the saved groups and ties both drill and timeline to the resulting job',async()=>{
 fetchComparisonFunnelMetrics.mockResolvedValue(result);fetchDrillUsers.mockResolvedValue({rows:[]});fetchUserTimeline.mockResolvedValue({events:[]})
 const t=setup();await t.submit()
 expect(fetchComparisonFunnelMetrics).toHaveBeenCalledWith({base_cache_id:'fixed-segments',group_keys:['g0','g1'],preset:'analysis',hours:24})
 expect(t.output.innerHTML).toContain('后续未观测');expect(t.status.textContent).toContain('去重名单3人')
 t.link.onclick();const options=t.ctx.drawer.openRemote.mock.calls[0][0]
 expect(options.selection).toEqual({cache_id:'funnel-result',list_key:'reached'})
 await options.fetchPage({offset:0,limit:20,q:'x'});expect(fetchDrillUsers.mock.calls[0][0].params.cache_id).toBe('funnel-result')
 await options.fetchTimeline('user:1',{isConnected:true});expect(fetchUserTimeline.mock.calls[0][0]).toMatchObject({cacheId:'funnel-result',start:10,end:100+24*3600000})
})
test('changed conditions and disposed pages reject late responses',async()=>{
 let resolve;fetchComparisonFunnelMetrics.mockImplementation(()=>new Promise(r=>resolve=r))
 const t=setup(),pending=t.submit();t.form.onchange();resolve(result);await pending
 expect(t.output.innerHTML).toBe('');expect(t.status.textContent).toContain('条件已更改')
 const other=setup(),request=other.submit();other.dispose();other.output.innerHTML='new page';resolve(result);await request
 expect(other.output.innerHTML).toBe('new page')
})
test('expired source gives recovery guidance and group validation avoids an unnecessary request',async()=>{
 fetchComparisonFunnelMetrics.mockRejectedValue(Object.assign(Error('expired'),{status:409}));const t=setup();await t.submit()
 expect(t.status.textContent).toContain('重新运行上方分群');expect(t.button.disabled).toBe(false)
 t.selection.pop();await t.submit();expect(fetchComparisonFunnelMetrics).toHaveBeenCalledTimes(1);expect(t.status.textContent).toContain('2至8')
})
