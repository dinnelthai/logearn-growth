import {test,expect,vi} from 'vitest'
vi.mock('../../api/aiAnalysis.js',()=>({
 getBusinessModules:vi.fn(),getOpportunities:vi.fn(),runBusinessModuleInvestigation:vi.fn(),
 saveOpportunity:vi.fn(),decideOpportunity:vi.fn(),promoteOpportunity:vi.fn(),
 getOpportunityHistory:vi.fn(),getEvidence:vi.fn()
}))
import {getBusinessModules,getOpportunities} from '../../api/aiAnalysis.js'
import {mountAIGrowthModulesPanel} from '../../pages/aiGrowthModulesPanel.js'

test('a failed request after disposal never touches the old panel',async()=>{
 let reject;getBusinessModules.mockImplementation(()=>new Promise((_,r)=>{reject=r}));
 getOpportunities.mockResolvedValue({items:[]});
 const host={isConnected:true,innerHTML:'',querySelector:vi.fn()};
 const dispose=mountAIGrowthModulesPanel(host,{esc:String});
 dispose();host.innerHTML='new page';reject(Error('unavailable'));
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(host.innerHTML).toBe('new page');expect(host.querySelector).not.toHaveBeenCalled();
})
