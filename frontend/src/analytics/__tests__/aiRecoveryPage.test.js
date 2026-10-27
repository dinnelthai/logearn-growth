import {test,expect,vi,afterEach} from 'vitest'
vi.mock('../../api/aiAnalysis.js',()=>({createBusinessAnalysis:vi.fn(),getAnalysisList:vi.fn(),getAnalysisDetail:vi.fn(),getJobStatus:vi.fn(),updateSuggestionStatus:vi.fn(),createRetrospective:vi.fn(),getRetrospectives:vi.fn(),getCostStats:vi.fn(),retryAnalysis:vi.fn(),getAgentHealth:vi.fn(),getEvidence:vi.fn(),getJobCheckpoint:vi.fn(),cancelAnalysis:vi.fn(),resumeAnalysis:vi.fn(),getGrowthReviewQueue:vi.fn(),getGrowthInbox:vi.fn(),getGrowthAlerts:vi.fn(),scanGrowthAlerts:vi.fn(),changeGrowthAlert:vi.fn(),getGrowthBudget:vi.fn(),getGrowthInvestigations:vi.fn(),decideGrowthInvestigation:vi.fn(),getGrowthNotifications:vi.fn(),markGrowthNotificationRead:vi.fn()}))
import * as api from '../../api/aiAnalysis.js'
import {createAIAnalysis} from '../../pages/aiAnalysis.js'
function setup(){
 const button={dataset:{analysis:'a'}},cancel={isConnected:true,addEventListener(_event,fn){this.click=fn}},checkpoint={textContent:'',after(el){this.button=el}},message={textContent:''};
 const panel={isConnected:true,innerHTML:'',querySelector(s){return ({'[data-checkpoint-result]':checkpoint,'[data-cancel-analysis]':cancel,'[data-resume-analysis]':checkpoint.button})[s]||null},querySelectorAll(){return []}};
 const nodes={'[data-detail]':panel,'[data-ai-message]':message,'[data-health]':{},'[data-refresh]':{},'[data-ai-form]':{}};
 const host={innerHTML:'',querySelector:s=>nodes[s]||null,querySelectorAll:s=>s==='[data-analysis]'?[button]:[]};
 vi.stubGlobal('document',{createElement:()=>({dataset:{},isConnected:true})});
 api.getAnalysisList.mockResolvedValue({records:[{id:'a',title:'task',status:'processing'}]});api.getRetrospectives.mockResolvedValue({retrospectives:[]});api.getCostStats.mockResolvedValue({total_calls:0});api.getGrowthReviewQueue.mockResolvedValue({entries:[]});api.getGrowthInbox.mockResolvedValue({tasks:[],counts:{total:0},warnings:[]});api.getGrowthAlerts.mockResolvedValue({alerts:[]});api.getGrowthBudget.mockResolvedValue({limit:0,reservedCalls:0,remainingCalls:0});api.getGrowthInvestigations.mockResolvedValue({proposals:[]});api.getGrowthNotifications.mockResolvedValue({notifications:[]});
 api.getAnalysisDetail.mockResolvedValue({id:'a',title:'task',status:'processing',suggestions:[]});
 api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:true,completedRounds:1,completedTools:0,pendingTools:0});
 const page=createAIAnalysis({$:()=>host,esc:s=>String(s??'')});return {page,button,cancel,checkpoint,message,panel};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
test('expired task can request recovery and displays the cost notice',async()=>{
 const t=setup();api.resumeAnalysis.mockResolvedValue({notice:'可能产生费用'});await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.button).toBeTruthy());await t.checkpoint.button.onclick();expect(api.resumeAnalysis).toHaveBeenCalledWith('a');expect(t.message.textContent).toBe('可能产生费用');t.page.dispose();
});
test('cancel sends the selected task and refreshes its status',async()=>{
 const t=setup();api.cancelAnalysis.mockResolvedValue({});await t.page.draw();await t.button.onclick();await t.cancel.click({currentTarget:t.cancel});expect(api.cancelAnalysis).toHaveBeenCalledWith('a');expect(api.getAnalysisDetail).toHaveBeenCalledTimes(2);t.page.dispose();
});
test('active lease does not offer recovery',async()=>{
 const t=setup();api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:false,completedRounds:0,completedTools:0,pendingTools:0});await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.textContent).toContain('已保存模型轮次'));expect(t.checkpoint.button).toBeUndefined();t.page.dispose();
});
test('unauthorized checkpoint errors remain visible without a recovery button',async()=>{
 const t=setup();api.getJobCheckpoint.mockRejectedValue(Error('HTTP 403'));await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.textContent).toContain('HTTP 403'));expect(t.checkpoint.button).toBeUndefined();t.page.dispose();
});
