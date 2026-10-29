import {test,expect,vi,afterEach} from 'vitest'
vi.mock('../../api/aiAnalysis.js',()=>({createBusinessAnalysis:vi.fn(),getAnalysisList:vi.fn(),getAnalysisDetail:vi.fn(),getJobStatus:vi.fn(),updateSuggestionStatus:vi.fn(),createRetrospective:vi.fn(),getRetrospectives:vi.fn(),getCostStats:vi.fn(),retryAnalysis:vi.fn(),getAgentHealth:vi.fn(),getEvidence:vi.fn(),getJobCheckpoint:vi.fn(),cancelAnalysis:vi.fn(),resumeAnalysis:vi.fn(),getGrowthReviewQueue:vi.fn(),getGrowthInbox:vi.fn(),getGrowthAlerts:vi.fn(),getGrowthMonitorControl:vi.fn(),setGrowthMonitorControl:vi.fn(),scanGrowthAlerts:vi.fn(),changeGrowthAlert:vi.fn(),getGrowthBudget:vi.fn(),getGrowthInvestigations:vi.fn(),decideGrowthInvestigation:vi.fn(),getGrowthNotifications:vi.fn(),markGrowthNotificationRead:vi.fn(),getGrowthInvestigationTimeline:vi.fn(),getSeoImports:vi.fn(),importSeoSnapshot:vi.fn(),previewSeoSnapshot:vi.fn(),previewKolPerformance:vi.fn(),getGscConnection:vi.fn(),saveGscSite:vi.fn(),syncGscPerformance:vi.fn(),getGscPerformance:vi.fn(),getGscSitemaps:vi.fn(),inspectGscUrl:vi.fn(),getAutonomyStatus:vi.fn(),getAutonomyTargets:vi.fn(),saveAutonomyTarget:vi.fn(),getAutonomyBriefs:vi.fn(),getAutonomyLearning:vi.fn(),refreshAutonomyBrief:vi.fn()}))
import * as api from '../../api/aiAnalysis.js'
import {createAIAnalysis} from '../../pages/aiAnalysis.js'
function setup({withTimeline=false,withGsc=false}={}){
 const button={dataset:{analysis:'a'}},cancel={isConnected:true,addEventListener(_event,fn){this.click=fn}},retry={disabled:false,textContent:'',isConnected:true,addEventListener(_event,fn){this.click=fn}},checkpoint={textContent:'',after(el){this.button=el}},message={textContent:''};
 const heading={textContent:''}, summary={textContent:''};
 const timeline={innerHTML:'',textContent:'',querySelector(){return null}};
 const caseButton={dataset:{caseTimeline:'proposal-1'},disabled:false,isConnected:true};
 const panel={isConnected:true,innerHTML:'',querySelector(s){return ({'[data-checkpoint-result]':checkpoint,'[data-cancel-analysis]':cancel,'[data-resume-analysis]':checkpoint.button,'[data-detail-title]':heading,'[data-detail-summary]':summary,'[data-retry-analysis]':retry})[s]||null},querySelectorAll(){return []}};
 const nodes={'[data-detail]':panel,'[data-ai-message]':message,'[data-health]':{},'[data-refresh]':{},'[data-ai-form]':{}};
 const gscButton={disabled:false,isConnected:true};
 const monitorButton={disabled:false,isConnected:true};nodes['[data-monitor-toggle]']=monitorButton;
 if(withGsc){nodes['[data-gsc-save]']=gscButton;
   nodes['[data-gsc-site]']={value:'sc-domain:logearn.com'};}

 if(withTimeline)nodes['[data-growth-timeline]']=timeline;
 const host={innerHTML:'',querySelector:s=>nodes[s]||null,
  querySelectorAll:s=>s==='[data-analysis]'?[button]:
   s==='[data-case-timeline]'&&withTimeline?[caseButton]:[]};
 vi.stubGlobal('document',{createElement:()=>({dataset:{},isConnected:true})});
 api.getAnalysisList.mockResolvedValue({records:[{id:'a',title:'task',status:'processing'}]});api.getRetrospectives.mockResolvedValue({retrospectives:[]});api.getCostStats.mockResolvedValue({total_calls:0});api.getGrowthReviewQueue.mockResolvedValue({entries:[]});api.getGrowthInbox.mockResolvedValue({tasks:[],counts:{total:0},warnings:[]});api.getGrowthAlerts.mockResolvedValue({alerts:[]});api.getGrowthMonitorControl.mockResolvedValue({allowed:true,enabled:false,version:0,workerOnline:false});api.getGrowthBudget.mockResolvedValue({limit:0,reservedCalls:0,remainingCalls:0});api.getGrowthInvestigations.mockResolvedValue({proposals:[]});api.getGrowthNotifications.mockResolvedValue({notifications:[]});api.getSeoImports.mockResolvedValue({imports:[]});
 api.getGscConnection.mockResolvedValue({configured:false,sites:[],reason:'No API credential'});
 api.getGscPerformance.mockResolvedValue({available:false}); 
 api.getAutonomyStatus.mockResolvedValue({schedulerConfigured:false,paidDailyDispatchConfigured:false});
 api.getAutonomyTargets.mockResolvedValue({targets:[],supportedMetrics:['active_users']});
 api.getAutonomyBriefs.mockResolvedValue({briefs:[]});
 api.getAutonomyLearning.mockResolvedValue({assessment:{reviewed:0,observedSupported:0,observedContradicted:0,insufficient:0,observableAgreementRate:null},strategies:{}});


 api.getAnalysisDetail.mockResolvedValue({id:'a',title:'task',status:'processing',suggestions:[]});
 api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:true,requiresHumanReview:true,state:'recorded',reason:'requires-validation-before-resume',modelCalls:1,completedRounds:1,completedTools:0,pendingTools:0});
 const page=createAIAnalysis({$:()=>host,esc:s=>String(s??'')});return {page,button,cancel,retry,checkpoint,message,panel,caseButton,timeline,host,gscButton,monitorButton,heading,summary};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
test('expired task can request recovery and displays the cost notice',async()=>{
 const t=setup();vi.stubGlobal('confirm',vi.fn(()=>true));api.resumeAnalysis.mockResolvedValue({notice:'可能产生费用'});await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.button).toBeTruthy());await t.checkpoint.button.onclick();expect(api.resumeAnalysis).toHaveBeenCalledWith('a');expect(t.message.textContent).toBe('可能产生费用');t.page.dispose();
});
test('cancel sends the selected task and refreshes its status',async()=>{
 const t=setup();api.cancelAnalysis.mockResolvedValue({});await t.page.draw();await t.button.onclick();await t.cancel.click({currentTarget:t.cancel});expect(api.cancelAnalysis).toHaveBeenCalledWith('a');expect(api.getAnalysisDetail).toHaveBeenCalledTimes(3);t.page.dispose();
});
test('active lease does not offer recovery',async()=>{
 const t=setup();api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:false,completedRounds:0,completedTools:0,pendingTools:0});await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.textContent).toContain('已保存模型轮次'));expect(t.checkpoint.button).toBeUndefined();t.page.dispose();
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

test('proposal cards bind the real case ID and distinguish traceable evidence from missing coverage',async()=>{
 const t=setup();
 api.getGrowthInvestigations.mockResolvedValue({proposals:[{
  id:'proposal-1',metric:'new_users',source:'seo',status:'proposed',version:1,
  period_end:Date.parse('2026-10-27T17:00:00Z'),evidence:{baseline:100,observed:60},
  diagnosis:{dataQuality:{status:'traceable-observation'},
   observation:{baseline:100,current:60}}
 }]});
 await t.page.draw();
 expect(t.host.innerHTML).toContain('data-case-timeline="proposal-1"');
 expect(t.host.innerHTML).toContain('证据期间与源端快照可追溯');
 expect(t.host.innerHTML).toContain('已观察：100 → 60');
 expect(t.host.innerHTML).toContain('原因未知');
 expect(api.createBusinessAnalysis).not.toHaveBeenCalled();
 t.page.dispose();
});

test('operator switch calls server with version and never pretends worker is online',async()=>{
 const t=setup();
 api.setGrowthMonitorControl.mockResolvedValue({allowed:true,enabled:true,version:1,workerOnline:false});
 await t.page.draw();
 expect(t.host.innerHTML).toContain('开启自动监控');
 expect(t.host.innerHTML).toContain('未就绪');
 await t.monitorButton.onclick();
 expect(api.setGrowthMonitorControl).toHaveBeenCalledWith(true,0);
 expect(api.createBusinessAnalysis).not.toHaveBeenCalled();
 t.page.dispose();
});
test('monitor request failure disables the control with a message',async()=>{
 const t=setup();api.getGrowthMonitorControl.mockRejectedValue(Error('AI database unavailable'));
 await t.page.draw();
 expect(t.host.innerHTML).toContain('监控开关不可用');
 expect(t.host.innerHTML).toContain('data-monitor-toggle');
 expect(t.host.innerHTML).toContain('disabled');
 t.page.dispose();
});

test('incomplete investigation is presented as needing human attention rather than running',async()=>{
 const t=setup();api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:false,state:'partial-tools',reason:'tool-execution-incomplete',requiresHumanReview:true,completedRounds:2,completedTools:6,pendingTools:4});
 await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.heading.textContent).toContain('需要人工处理'));
 expect(t.summary.textContent).not.toContain('分析正在进行');expect(t.checkpoint.button).toBeUndefined();t.page.dispose();
});

test('expired task with incomplete tools does not offer automatic recovery',async()=>{
 const t=setup();api.getJobCheckpoint.mockResolvedValue({recordStatus:'processing',leaseExpired:true,state:'partial-tools',reason:'tool-execution-incomplete',requiresHumanReview:true,completedRounds:2,completedTools:6,pendingTools:4});
 await t.page.draw();await t.button.onclick();await vi.waitFor(()=>expect(t.checkpoint.textContent).toContain('调查工具执行不完整'));
 expect(t.checkpoint.button).toBeUndefined();expect(api.resumeAnalysis).not.toHaveBeenCalled();t.page.dispose();
});

test('failed AI task keeps retry disabled until a safe checkpoint is verified',async()=>{
 const t=setup()
 api.getAnalysisList.mockResolvedValue({records:[{id:'a',title:'failed task',status:'failed'}]})
 api.getAnalysisDetail.mockResolvedValue({id:'a',title:'failed task',status:'failed',suggestions:[]})
 api.getJobCheckpoint.mockResolvedValue({recordStatus:'failed',state:'blocked',reason:'unresolved-paid-call',pendingTools:0,requiresHumanReview:true})
 await t.page.draw()
 await vi.waitFor(()=>expect(t.retry.textContent).toBe('暂不可安全重试'))
 expect(t.retry.disabled).toBe(true)
 expect(api.retryAnalysis).not.toHaveBeenCalled()
 t.page.dispose()
})
test('verified failed task explicitly offers retry without starting it on read',async()=>{
 const t=setup()
 api.getAnalysisList.mockResolvedValue({records:[{id:'a',title:'failed task',status:'failed'}]})
 api.getAnalysisDetail.mockResolvedValue({id:'a',title:'failed task',status:'failed',suggestions:[]})
 api.getJobCheckpoint.mockResolvedValue({recordStatus:'failed',state:'not-started',reason:null,modelCalls:0,completedRounds:0,pendingTools:0,requiresHumanReview:false})
 await t.page.draw()
 await vi.waitFor(()=>expect(t.retry.textContent).toContain('可能产生费用'))
 expect(t.retry.disabled).toBe(false)
 expect(api.retryAnalysis).not.toHaveBeenCalled()
 t.page.dispose()
})

test('declining manual resume confirmation never sends a paid job request',async()=>{
 const t=setup()
 vi.stubGlobal('confirm',vi.fn(()=>false))
 await t.page.draw()
 await vi.waitFor(()=>expect(t.checkpoint.button).toBeTruthy())
 await t.checkpoint.button.onclick()
 expect(api.getJobCheckpoint).toHaveBeenCalled()
 expect(api.resumeAnalysis).not.toHaveBeenCalled()
 t.page.dispose()
})

test('server checkpoint changing before paid retry blocks it without dispatch',async()=>{
 const t=setup()
 vi.stubGlobal('confirm',vi.fn(()=>true))
 api.getAnalysisList.mockResolvedValue({records:[{id:'a',title:'failed task',status:'failed'}]})
 api.getAnalysisDetail.mockResolvedValue({id:'a',title:'failed task',status:'failed',suggestions:[]})
 const empty={recordStatus:'failed',state:'not-started',reason:null,modelCalls:0,completedRounds:0,pendingTools:0,requiresHumanReview:false}
 api.getJobCheckpoint.mockResolvedValueOnce(empty)
   .mockResolvedValueOnce({...empty,state:'recorded',reason:'requires-validation-before-resume',modelCalls:1,completedRounds:1})
 await t.page.draw()
 await vi.waitFor(()=>expect(t.retry.disabled).toBe(false))
 await t.retry.click()
 expect(api.retryAnalysis).not.toHaveBeenCalled()
 expect(t.message.textContent).toContain('禁止直接重试')
 t.page.dispose()
})

test('a slow prior detail response cannot overwrite a more recent selection request',async()=>{
  const t=setup()
  await t.page.draw()
  let resolveOlder
  api.getAnalysisDetail.mockImplementationOnce(()=>new Promise(resolve=>{resolveOlder=resolve}))
    .mockResolvedValueOnce({id:'a',title:'NEW RESULT',status:'completed',
      result:{summary:'Newest metrics'},suggestions:[]})
  const old=t.button.onclick()
  await Promise.resolve()
  const newer=t.button.onclick()
  await newer
  resolveOlder({id:'a',title:'STALE RESULT',status:'processing',suggestions:[]})
  await old
  expect(t.panel.innerHTML).toContain('NEW RESULT')
  expect(t.panel.innerHTML).toContain('Newest metrics')
  expect(t.panel.innerHTML).not.toContain('STALE RESULT')
  t.page.dispose()
})

test('a missing detail shows an explicit read-only retry rather than the prior task actions',async()=>{
  const t=setup()
  await t.page.draw()
  api.getAnalysisDetail.mockRejectedValueOnce(Error('detail temporarily unavailable'))
  await t.button.onclick()
  expect(t.panel.innerHTML).toContain('分析详情加载失败')
  expect(t.panel.innerHTML).toContain('detail temporarily unavailable')
  expect(t.panel.innerHTML).toContain('data-ai-detail-retry')
  expect(t.panel.innerHTML).not.toContain('data-suggestion=')
  expect(api.retryAnalysis).not.toHaveBeenCalled()
  t.page.dispose()
})

test('AI action cannot be marked complete without recording the actual work',async()=>{
  const t=setup()
  const noteField={focus:vi.fn()}
  const form={dataset:{suggestion:'suggestion-1'},isConnected:true,
    elements:{namedItem:()=>noteField},querySelectorAll:()=>[]}
  t.panel.querySelectorAll=selector=>selector==='[data-suggestion]'?[form]:[]
  api.getAnalysisDetail.mockResolvedValue({id:'a',title:'task',status:'completed',
    suggestions:[{id:'suggestion-1',user_status:'executing',business_problem:'Drop in analysis'}]})
  vi.stubGlobal('FormData',class{
    get(name){return name==='note'?'   ':null}
  })
  await t.page.draw()
  await form.onsubmit({preventDefault:()=>{},submitter:{value:'executed'}})
  expect(api.updateSuggestionStatus).not.toHaveBeenCalled()
  expect(t.message.textContent).toContain('实际执行')
  expect(noteField.focus).toHaveBeenCalledOnce()
  t.page.dispose()
})

test('rejecting an AI action requires a recorded reason instead of a silent state change',async()=>{
  const t=setup(),noteField={focus:vi.fn()}
  const form={dataset:{suggestion:'suggestion-2'},isConnected:true,
    elements:{namedItem:()=>noteField},querySelectorAll:()=>[]}
  t.panel.querySelectorAll=selector=>selector==='[data-suggestion]'?[form]:[]
  api.getAnalysisDetail.mockResolvedValue({id:'a',title:'task',status:'completed',
    suggestions:[{id:'suggestion-2',user_status:'pending',business_problem:'Retention gap'}]})
  vi.stubGlobal('FormData',class{get(){return ''}})
  await t.page.draw()
  await form.onsubmit({preventDefault:()=>{},submitter:{value:'rejected'}})
  expect(api.updateSuggestionStatus).not.toHaveBeenCalled()
  expect(t.message.textContent).toContain('拒绝原因')
  expect(noteField.focus).toHaveBeenCalledOnce()
  t.page.dispose()
})

test('review queue requires cost confirmation before creating an AI retrospective',async()=>{
  const t=setup()
  const reviewButton={dataset:{readyReview:'s-ready'},isConnected:true,disabled:false}
  const originalQuery=t.host.querySelectorAll
  t.host.querySelectorAll=selector=>selector==='[data-ready-review]'?[reviewButton]:originalQuery(selector)
  api.getGrowthReviewQueue.mockResolvedValue({entries:[{
    suggestionId:'s-ready',analysisId:'a',title:'Follow-up activation',
    status:'ready'
  }]})
  await t.page.draw()
  expect(t.host.innerHTML).toContain('data-ready-review="s-ready"')
  expect(t.host.innerHTML).toContain('可能产生费用')
  vi.stubGlobal('confirm',vi.fn(()=>false))
  await reviewButton.onclick()
  expect(api.createRetrospective).not.toHaveBeenCalled()
  vi.stubGlobal('confirm',vi.fn(()=>true))
  api.createRetrospective.mockResolvedValue({status:'pending',jobId:'review-1'})
  api.getJobStatus.mockResolvedValue({state:'active',progress:25})
  await reviewButton.onclick()
  await vi.waitFor(()=>expect(api.getJobStatus).toHaveBeenCalledWith('review-1'))
  expect(api.createRetrospective).toHaveBeenCalledTimes(1)
  expect(api.createRetrospective.mock.calls[0][0]).toBe('s-ready')
  expect(t.message.textContent).toContain('复盘状态')
  t.page.dispose()
})

test('review failure remains visible and is not automatically re-dispatched',async()=>{
  const t=setup()
  const button={dataset:{readyReview:'s-ready'},isConnected:true,disabled:false}
  const originalQuery=t.host.querySelectorAll
  t.host.querySelectorAll=selector=>selector==='[data-ready-review]'?[button]:originalQuery(selector)
  api.getGrowthReviewQueue.mockResolvedValue({entries:[{
    suggestionId:'s-ready',title:'Follow-up',status:'ready'
  }]})
  vi.stubGlobal('confirm',vi.fn(()=>true))
  api.createRetrospective.mockResolvedValue({status:'pending',jobId:'review-failed'})
  api.getJobStatus.mockResolvedValue({state:'failed',error:'Review worker unavailable'})
  await t.page.draw()
  await button.onclick()
  await vi.waitFor(()=>expect(t.message.textContent).toContain('Review worker unavailable'))
  expect(api.createRetrospective).toHaveBeenCalledTimes(1)
  t.page.dispose()
})

test('a completed existing review shows stored results rather than dispatching another job',async()=>{
  const t=setup()
  const button={dataset:{readyReview:'s-complete'},isConnected:true,disabled:false}
  const originalQuery=t.host.querySelectorAll
  t.host.querySelectorAll=selector=>selector==='[data-ready-review]'?[button]:originalQuery(selector)
  api.getGrowthReviewQueue.mockResolvedValue({entries:[{
    suggestionId:'s-complete',title:'Execution record',status:'ready'
  }]})
  vi.stubGlobal('confirm',vi.fn(()=>true))
  api.createRetrospective.mockResolvedValue({status:'completed',jobId:'persisted-review',result:{}})
  await t.page.draw()
  await button.onclick()
  expect(api.createRetrospective).toHaveBeenCalledTimes(1)
  expect(api.getJobStatus).not.toHaveBeenCalled()
  expect(api.getRetrospectives).toHaveBeenCalledTimes(2)
  t.page.dispose()
})

test('AI workspace prioritizes selected insights and actions before configuration and raw evidence',async()=>{
 const t=setup();
 await t.page.draw();
 expect(t.host.innerHTML).toContain('ai-status-grid');
 expect(t.host.innerHTML).toContain('ai-decision-workspace');
 expect(t.host.innerHTML.indexOf('ai-decision-workspace')).toBeLessThan(t.host.innerHTML.indexOf('id="ai-new-analysis"'));
 await t.button.onclick();
 expect(t.panel.innerHTML).toContain('ai-evidence-index');
 expect(t.panel.innerHTML.indexOf('ai-action-list')).toBeLessThan(t.panel.innerHTML.indexOf('ai-evidence-index'));
 expect(t.panel.innerHTML).toContain('原始业务证据');
 t.page.dispose();
});

test('top new-analysis action expands the real form instead of only moving to a closed anchor',async()=>{
 const t=setup();
 const focus=vi.fn(),scrollIntoView=vi.fn();
 const form={open:false,scrollIntoView,querySelector:s=>s==='input[name="title"]'?{focus}:null};
 const action={addEventListener:(_type,callback)=>{action.click=callback}};
 const original=t.host.querySelector;
 t.host.querySelector=selector=>selector==='[href="#ai-new-analysis"]'?action:
   selector==='#ai-new-analysis'?form:original(selector);
 await t.page.draw();
 const preventDefault=vi.fn();
 action.click({preventDefault});
 expect(preventDefault).toHaveBeenCalledOnce();
 expect(form.open).toBe(true);
 expect(scrollIntoView).toHaveBeenCalled();
 expect(focus).toHaveBeenCalled();
 t.page.dispose();
});
