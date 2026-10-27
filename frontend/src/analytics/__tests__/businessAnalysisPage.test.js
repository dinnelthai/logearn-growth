import {test,expect,vi,beforeEach,afterEach} from 'vitest'
vi.mock('../../api/businessAnalysis.js',()=>({listBusinessReports:vi.fn(),createBusinessReport:vi.fn(),getBusinessReport:vi.fn(),createBusinessAction:vi.fn(),updateBusinessAction:vi.fn(),reviewBusinessAction:vi.fn()}))
vi.mock('../../api/aiAnalysis.js',()=>({createBusinessAnalysis:vi.fn()}))
import * as api from '../../api/businessAnalysis.js'
import {createBusinessAnalysis as createAI} from '../../api/aiAnalysis.js'
import {createBusinessAnalysis,reportMarkup} from '../../pages/businessAnalysis.js'
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const report={id:'r',title:'人工报告',period:{start:1,end:2,previousStart:0,previousEnd:1},business:{scope:{source:'all'},question:'不要调用AI'},focusGoal:'activation',snapshot:{id:'s',asOf:'2026-10-20'},summary:{goal:'激活',definition:'人工确认'},current:{totals:{active_users:100}},previous:{totals:{active_users:80}},growth:{channels:[{source:'twitter',users:20,eligible:10,activated:3,pending:10,activation_rate:.3,d7:{eligible:5,returned:2,rate:.4}}],dimensions:{}},weekly:{available:false,error:'数据不可用'},candidates:[],warnings:['覆盖未确认'],definitions:{active_users:'去重观测用户'},actions:[]}
function setup(){
 const nodes=new Map(),historyButton={dataset:{businessId:'r'}},navigate=vi.fn();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',isConnected:true,querySelector:selector=>node(key+'/'+selector),querySelectorAll:selector=>key==='[data-business-history]'&&selector==='[data-business-id]'?[historyButton]:[]});return nodes.get(key)}
 const host={innerHTML:'',querySelector:node,querySelectorAll:()=>[]};
 return {host,nodes,node,historyButton,navigate,page:createBusinessAnalysis({$:()=>host,esc,navigate})};
}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('crypto',{randomUUID:()=> 'request'});api.listBusinessReports.mockResolvedValue({reports:[{id:'r',title:'人工报告',created_at:1}]});api.getBusinessReport.mockResolvedValue(report)})
afterEach(()=>vi.unstubAllGlobals())
test('business page loads without any optional AI requests',async()=>{
 const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('生成业务报告（不调用 AI）');expect(createAI).not.toHaveBeenCalled();
 await t.historyButton.onclick();expect(t.node('[data-business-report]').innerHTML).toContain('渠道激活与成熟回访');expect(createAI).not.toHaveBeenCalled();t.page.dispose()
})
test('AI outage leaves all business evidence and manual workflow visible',async()=>{
 const t=setup();await t.page.draw();await t.historyButton.onclick();const evidence=t.node('[data-business-report]').innerHTML;
 createAI.mockRejectedValue(Error('quota exhausted'));
 await t.node('[data-business-report]/[data-business-ai]').onclick();
 expect(t.node('[data-business-report]').innerHTML).toBe(evidence);expect(t.node('[data-business-report]/[data-business-ai-message]').textContent).toContain('业务报告和人工操作仍可使用');
 expect(createAI.mock.calls[0][0]).toMatchObject({evidenceReportId:'r',dateRangeStart:1,dateRangeEnd:2});t.page.dispose()
})
test('human report exposes numbers, denominators, caveats and escaped evidence without AI prose',()=>{
 const html=reportMarkup({...report,title:'<script>bad</script>'},esc);
 expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>bad');expect(html).toContain('成熟24小时样本');expect(html).toContain('D7成熟样本');expect(html).toContain('30.0%');expect(html).toContain('25.0%');expect(html).toContain('覆盖未确认');expect(html).toContain('周核心指标不可用')
})
test('leaving while human history loads cannot overwrite the next page',async()=>{
 let finish;api.listBusinessReports.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw();t.page.dispose();t.host.innerHTML='other page';finish({reports:[]});await pending;expect(t.host.innerHTML).toBe('other page');expect(createAI).not.toHaveBeenCalled()
})
