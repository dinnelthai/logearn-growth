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
 const nodes={'[data-detail]':panel,'[data-ai-message]':message,'[data-health]':{},'[data-refresh]':{},'[data-ai-form]':{},'[data-delete-cancel]':{focus:vi.fn()},'[data-delete-confirm]':{disabled:false,isConnected:true},'.ai-delete-dialog':{showModal:vi.fn(),close:vi.fn()}};
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
 expect(t.host.innerHTML).toContain('ai-history');
 expect(t.host.innerHTML.indexOf('ai-history')).toBeLessThan(t.host.innerHTML.indexOf('ai-result'));
 expect(t.host.innerHTML).not.toContain('ai-gsc-settings');
 await t.button.onclick();
 expect(t.panel.innerHTML).toContain('ai-evidence-index');
 expect(t.panel.innerHTML.indexOf('ai-action-list')).toBeLessThan(t.panel.innerHTML.indexOf('ai-evidence-index'));
 expect(t.panel.innerHTML).toContain('原始业务证据');
 t.page.dispose();
});

test('new analysis action opens the focused creation dialog',async()=>{
 const t=setup();
 const showModal=vi.fn(),close=vi.fn();
 const dialog={showModal,close};
 const action={addEventListener:(_type,callback)=>{action.click=callback}};
 const original=t.host.querySelector;
 t.host.querySelector=selector=>selector==='[data-open-analysis]'?action:
   selector==='#ai-new-analysis'?dialog:original(selector);
 await t.page.draw();
 action.click();
 expect(showModal).toHaveBeenCalledOnce();
 t.page.dispose();
});

test('history is paginated above the report, five items per page with filter reset',async()=>{
 const t=setup();
 const rows=Array.from({length:12},(_,i)=>({
   dataset:{aiHistoryStatus:i===0?'processing':'completed',analysisId:i===0?'a':String(i)},
   hidden:false,
   querySelector:()=>null
 }));
 const prev={disabled:false},next={disabled:false},info={textContent:''},pager={hidden:false};
 const selector={value:'all',addEventListener(_type,cb){this.change=cb}};
 const oldQuery=t.host.querySelector.bind(t.host);
 const oldAll=t.host.querySelectorAll.bind(t.host);
 t.host.querySelector=s=>({
   '[data-ai-history-filter]':selector,
   '[data-ai-history-prev]':prev,
   '[data-ai-history-next]':next,
   '[data-ai-history-page-info]':info,
   '[data-ai-history-pagination]':pager
 })[s]||oldQuery(s);
 t.host.querySelectorAll=s=>s==='[data-ai-history-row]'?rows:oldAll(s);
 api.getAnalysisList.mockResolvedValue({records:rows.map((row,i)=>({
   id:row.dataset.analysisId,title:'分析 '+i,status:i===0?'processing':'completed',
   suggestion_count:0
 }))});
 await t.page.draw();
 expect(t.host.innerHTML).toContain('data-ai-history-pagination');
 expect(t.host.innerHTML).not.toContain('ai-decision-workspace');
 expect(info.textContent).toContain('第 1 / 3 页');
 expect(rows.filter(r=>!r.hidden)).toHaveLength(5);
 expect(prev.disabled).toBe(true);
 next.onclick();
 expect(info.textContent).toContain('第 2 / 3 页');
 expect(rows.slice(5,10).every(r=>!r.hidden)).toBe(true);
 next.onclick();
 expect(info.textContent).toContain('第 3 / 3 页');
 expect(rows.filter(r=>!r.hidden)).toHaveLength(2);
 expect(next.disabled).toBe(true);
 selector.value='failed';
 selector.change();
 expect(pager.hidden).toBe(true);
 expect(rows.every(r=>r.hidden)).toBe(true);
 selector.value='all';
 selector.change();
 expect(info.textContent).toContain('第 1 / 3 页');
 expect(rows.slice(0,5).every(r=>!r.hidden)).toBe(true);
 t.page.dispose();
});

test('AI page excludes Search Console and monitor requests until their own views open',async()=>{
 const t=setup();
 await t.page.draw();
 expect(t.host.innerHTML).not.toContain('ai-gsc-settings');
 expect(t.host.innerHTML).not.toContain('增长异常自动监控');
 expect(api.getSeoImports).not.toHaveBeenCalled();
 expect(api.getGscConnection).not.toHaveBeenCalled();
 expect(api.getGrowthAlerts).not.toHaveBeenCalled();
 t.page.dispose();
});
