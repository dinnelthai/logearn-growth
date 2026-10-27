import {test,expect,vi,beforeEach} from 'vitest'
vi.mock('../../api/aiAnalysis.js',()=>({createBusinessAnalysis:vi.fn(),getAnalysisList:vi.fn(),getAnalysisDetail:vi.fn(),getJobStatus:vi.fn(),updateSuggestionStatus:vi.fn(),createRetrospective:vi.fn(),getRetrospectives:vi.fn(),getCostStats:vi.fn(),retryAnalysis:vi.fn(),getAgentHealth:vi.fn(),getEvidence:vi.fn()}))
import * as api from '../../api/aiAnalysis.js'
import {createAIAnalysis} from '../../pages/aiAnalysis.js'
function setup(){
 const nodes=new Map(),host={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',addEventListener:vi.fn(),querySelector:()=>({}),querySelectorAll:()=>[]});return nodes.get(selector)},querySelectorAll:()=>[]}
 return {host,nodes,page:createAIAnalysis({$:()=>host,esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;')})}
}
beforeEach(()=>{vi.resetAllMocks();api.getAnalysisList.mockResolvedValue({records:[]});api.getRetrospectives.mockResolvedValue({retrospectives:[]});api.getCostStats.mockResolvedValue({total_calls:2,total_tokens:120,unknown_cost_calls:2})})
test('manual business workflow renders model roles and unknown costs without starting analysis',async()=>{
 const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('同一 DeRouter 模型');expect(t.host.innerHTML).toContain('深度调查（同一模型）');expect(t.host.innerHTML).toContain('2 次调用费率未配置');expect(api.createBusinessAnalysis).not.toHaveBeenCalled();t.page.dispose()
})
test('leaving while loading never overwrites another page',async()=>{
 let finish;api.getAnalysisList.mockImplementation(()=>new Promise(r=>finish=r));const t=setup(),pending=t.page.draw();t.page.dispose();t.host.innerHTML='another page';finish({records:[]});await pending;expect(t.host.innerHTML).toBe('another page')
})
test('loading errors stay visible rather than rendering fake empty history',async()=>{
 api.getAnalysisList.mockRejectedValue(Error('<database unavailable>'));const t=setup();await t.page.draw();expect(t.host.innerHTML).toContain('&lt;database unavailable&gt;');expect(t.host.innerHTML).not.toContain('尚无分析');t.page.dispose()
})

test('health checks are explicit, display infrastructure state and never start a paid analysis',async()=>{
 api.getAgentHealth.mockResolvedValue({ready:false,components:{redis:{status:'unavailable'}},paidProbe:false});
 const t=setup();await t.page.draw();expect(api.getAgentHealth).not.toHaveBeenCalled();await t.nodes.get('[data-health]').onclick();
 expect(t.nodes.get('[data-health-result]').textContent).toContain('unavailable');expect(api.createBusinessAnalysis).not.toHaveBeenCalled();t.page.dispose();
});
