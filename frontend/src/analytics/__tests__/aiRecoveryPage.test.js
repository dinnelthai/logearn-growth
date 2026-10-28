import {test,expect,vi,afterEach} from 'vitest'
vi.mock('../../api/aiAnalysis.js',()=>({createBusinessAnalysis:vi.fn(),getAnalysisList:vi.fn(),getAnalysisDetail:vi.fn(),getJobStatus:vi.fn(),updateSuggestionStatus:vi.fn(),createRetrospective:vi.fn(),getRetrospectives:vi.fn(),getCostStats:vi.fn(),retryAnalysis:vi.fn(),getAgentHealth:vi.fn(),getEvidence:vi.fn(),getJobCheckpoint:vi.fn(),cancelAnalysis:vi.fn(),resumeAnalysis:vi.fn(),getGrowthReviewQueue:vi.fn(),getGrowthInbox:vi.fn(),getGrowthAlerts:vi.fn(),scanGrowthAlerts:vi.fn(),changeGrowthAlert:vi.fn(),getGrowthBudget:vi.fn(),getGrowthInvestigations:vi.fn(),decideGrowthInvestigation:vi.fn(),getGrowthNotifications:vi.fn(),markGrowthNotificationRead:vi.fn(),getGrowthInvestigationTimeline:vi.fn(),getSeoImports:vi.fn(),importSeoSnapshot:vi.fn(),previewSeoSnapshot:vi.fn(),previewKolPerformance:vi.fn(),getGscConnection:vi.fn(),saveGscSite:vi.fn(),syncGscPerformance:vi.fn(),getGscPerformance:vi.fn(),getGscSitemaps:vi.fn(),inspectGscUrl:vi.fn(),getAutonomyStatus:vi.fn(),getAutonomyTargets:vi.fn(),saveAutonomyTarget:vi.fn(),getAutonomyBriefs:vi.fn(),getAutonomyLearning:vi.fn(),refreshAutonomyBrief:vi.fn()}))
import * as api from '../../api/aiAnalysis.js'
import {createAIAnalysis} from '../../pages/aiAnalysis.js'
function setup({withTimeline=false,withGsc=false}={}){
 const button={dataset:{analysis:'a'}},cancel={isConnected:true,addEventListener(_event,fn){this.click=fn}},checkpoint={textContent:'',after(el){this.button=el}},message={textContent:''};
 const timeline={innerHTML:'',textContent:'',querySelector(){return null}};
 const caseButton={dataset:{caseTimeline:'proposal-1'},disabled:false,isConnected:true};
 const panel={isConnected:true,innerHTML:'',querySelector(s){return ({'[data-checkpoint-result]':checkpoint,'[data-cancel-analysis]':cancel,'[data-resume-analysis]':checkpoint.button})[s]||null},querySelectorAll(){return []}};
 const nodes={'[data-detail]':panel,'[data-ai-message]':message,'[data-health]':{},'[data-refresh]':{},'[data-ai-form]':{}};
 const gscButton={disabled:false,isConnected:true};
 if(withGsc){nodes['[data-gsc-save]']=gscButton;
   nodes['[data-gsc-site]']={value:'sc-domain:logearn.com'};}

 if(withTimeline)nodes['[data-growth-timeline]']=timeline;
 const host={innerHTML:'',querySelector:s=>nodes[s]||null,
  querySelectorAll:s=>s==='[data-analysis]'?[button]:
   s==='[data-case-timeline]'&&withTimeline?[caseButton]:[]};
 vi.stubGlobal('document',{createElement:()=>({dataset:{},isConnected:true})});
 api.getAnalysisList.mockResolvedValue({records:[{id:'a',title:'task',status:'processing'}]});api.getRetrospectives.mockResolvedValue({retrospectives:[]});api.getCostStats.mockResolvedValue({total_calls:0});api.getGrowthReviewQueue.mockResolvedValue({entries:[]});api.getGrowthInbox.mockResolvedValue({tasks:[],counts:{total:0},warnings:[]});api.getGrowthAlerts.mockResolvedValue({alerts:[]});api.getGrowthBudget.mockResolvedValue({limit:0,reservedCalls:0,remainingCalls:0});api.getGrowthInvestigations.mockResolvedValue({proposals:[]});api.getGrowthNotifications.mockResolvedValue({notifications:[]});api.getSeoImports.mockResolvedValue({imports:[]});
 api.getGscConnection.mockResolvedValue({configured:false,sites:[],reason:'No API credential'});
 api.getGscPerformance.mockResolvedValue({available:false}); 
 api.getAutonomyStatus.mockResolvedValue({schedulerConfigured:false,paidDailyDispatchConfigured:false});
 api.getAutonomyTargets.mockResolvedValue({targets:[],supportedMetrics:['active_users']});
 api.getAutonomyBriefs.mockResolvedValue({briefs:[]});
 api.getAutonomyLearning.mockResolvedValue({assessment:{reviewed:0,observedSupported:0,observedContradicted:0,insufficient:0,observableAgreementRate:null},strategies:{}});


 api.getAnalysisDetail.mockResolvedValue({id:'a',title:'task',status:'processing',suggestions:[]});
 api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:true,completedRounds:1,completedTools:0,pendingTools:0});
 const page=createAIAnalysis({$:()=>host,esc:s=>String(s??'')});return {page,button,cancel,checkpoint,message,panel,caseButton,timeline,host,gscButton};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
test('expired or blocked task displays human-review state without offering unsafe resume',async()=>{
 const t=setup();await t.page.draw();await t.button.onclick();
 expect(t.panel.innerHTML).toContain('需要人工处理');
 expect(t.panel.innerHTML).not.toContain('data-resume-analysis');
 expect(api.resumeAnalysis).not.toHaveBeenCalled();
 t.page.dispose();
});
test('cancel sends an active task and refreshes its persisted status',async()=>{
 const t=setup();api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:false,completedRounds:0,completedTools:0,pendingTools:0});api.cancelAnalysis.mockResolvedValue({});await t.page.draw();await t.button.onclick();await t.cancel.click({currentTarget:t.cancel});expect(api.cancelAnalysis).toHaveBeenCalledWith('a');expect(api.getAnalysisDetail).toHaveBeenCalledTimes(2);t.page.dispose();
});
test('active lease does not offer recovery',async()=>{
 const t=setup();api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:false,completedRounds:0,completedTools:0,pendingTools:0});await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.textContent).toContain('已记录轮次'));expect(t.checkpoint.button).toBeUndefined();t.page.dispose();
});
test('unauthorized checkpoint errors remain visible without a recovery button',async()=>{
 const t=setup();api.getJobCheckpoint.mockRejectedValue(Error('HTTP 403'));await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.textContent).toContain('HTTP 403'));expect(t.checkpoint.button).toBeUndefined();t.page.dispose();
});

test('operator can inspect frozen anomaly-to-retrospective chain without a model request',async()=>{
 const t=setup({withTimeline:true});
 api.getGrowthInvestigationTimeline.mockResolvedValue({
  version:'growth-investigation-timeline-v1',stage:'retrospective-recorded',
  proposal:{id:'proposal-1'},alert:{metric:'active_users',direction:'decline',source:'all',priority:'P0'},
  originalObservation:{baseline:100,observed:55,absolute:-45,
   evidence:{baselineAnalysisId:'baseline-1',currentAnalysisId:'current-1'}},
  analysis:{id:'analysis-1',status:'completed',summary:'Checked evidence',evidenceIds:['ev-1']},
  actions:[{id:'suggestion-1',priority:'P0',problem:'Activation gap',status:'executed',
   action:'Review funnel',actualAction:'Checked cohort'}],
  retrospectives:[{id:'review-1',conclusion:'Observed change',confidence:'low',hasCausality:false}],
  counts:{suggestions:1,retrospectives:1}
 });
 await t.page.draw();
 await t.caseButton.onclick();
 expect(api.getGrowthInvestigationTimeline).toHaveBeenCalledWith('proposal-1');
 expect(t.timeline.innerHTML).toContain('baseline-1');
 expect(t.timeline.innerHTML).toContain('Checked evidence');
 expect(t.timeline.innerHTML).toContain('Observed change');
 expect(t.timeline.innerHTML).toContain('未证明因果');
 expect(api.createBusinessAnalysis).not.toHaveBeenCalled();
 expect(api.createRetrospective).not.toHaveBeenCalled();
 t.page.dispose();
});

test('Search Console dashboard clearly distinguishes an actual connected site and finalized query evidence',async()=>{
 const t=setup({withGsc:true});
 api.getGscConnection.mockResolvedValue({
  configured:true,mode:'service-account',sites:[{
   siteUrl:'sc-domain:logearn.com',permissionLevel:'siteOwner'}],
  selectedSite:'sc-domain:logearn.com'
 });
 api.getGscPerformance.mockResolvedValue({available:true,report:{
  siteUrl:'sc-domain:logearn.com',startDate:'2026-10-18',endDate:'2026-10-20',
  source:'gsc-api',dataState:'final',syncedAt:Date.parse('2026-10-25T00:00:00Z'),
  metrics:{clicks:19,impressions:190,ctr:.1,position:4.5},
  daily:[{date:'2026-10-18',clicks:9,impressions:90,ctr:.1,position:5}],
  queries:[{query:'holder analytics',clicks:3,impressions:100,ctr:.03,position:6}],
  pages:[{page:'https://logearn.com/holders',clicks:5,impressions:120,ctr:.04,position:3}],
  opportunities:[],coverage:{expectedDays:3,reportedDays:2,queryRowsReturned:1,
   pageRowsReturned:1},
  warnings:['Partial queries']
 }});
 await t.page.draw();
 expect(t.host.innerHTML).toContain('已连接 · 站点已选定');
 expect(t.host.innerHTML).toContain('holder analytics');
 expect(t.host.innerHTML).toContain('按日走势');
 expect(t.host.innerHTML).toContain('10.00%');
 expect(t.host.innerHTML).toContain('Partial queries');
 expect(t.host.innerHTML).not.toContain('PRIVATE_TOKEN');
 api.saveGscSite.mockResolvedValue({selectedSite:'sc-domain:logearn.com'});
 await t.gscButton.onclick();
 expect(api.saveGscSite).toHaveBeenCalledWith('sc-domain:logearn.com');
 expect(api.createBusinessAnalysis).not.toHaveBeenCalled();
 t.page.dispose();
});

test('autonomous Growth panel distinguishes an unscored daily report from invented performance',async()=>{
 const t=setup();
 api.getAutonomyBriefs.mockResolvedValue({briefs:[{
  day:'2026-10-26',status:'partial',strategy_version:null,
  score:{value:null,qualityWarnings:['history incomplete']},
  quality:{completedGoals:1,requiredGoals:4},
  report:{overview:'Observed activation change only',priorityActions:[]}
 }]});
 await t.page.draw();
 expect(t.host.innerHTML).toContain('AI Growth Agent · 自主运营驾驶舱');
 expect(t.host.innerHTML).toContain('证据不足日报');
 expect(t.host.innerHTML).toContain('综合评分 未知');
 expect(t.host.innerHTML).toContain('history incomplete');
 expect(api.createBusinessAnalysis).not.toHaveBeenCalled();
 t.page.dispose();
});
