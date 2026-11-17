import {describe,it,expect,vi,afterEach} from 'vitest';
import {mountAIWeeklyReport} from '../aiWeeklyReportPanel.js';

vi.mock('../../api/aiAnalysis.js',()=>({
 getAnalysisDetail:vi.fn(async()=>({result:{weeklyReport:{}}})),
 getEvidence:vi.fn(),getJobCheckpoint:vi.fn(),retryAnalysis:vi.fn(),
 continueWeeklyOverflow:vi.fn(),deleteAnalysis:vi.fn(),
 getGscPerformance:vi.fn()
}));
vi.mock('../aiTaskStatus.js',()=>({canOfferTaskRetry:vi.fn(()=>false)}));
vi.mock('../../analysisLaunchContext.js',()=>({queueAnalysisLaunch:vi.fn()}));
vi.mock('../aiWeeklyDecisionView.js',()=>({
 renderWeeklyDecisionReport:()=>'<article>保存的周报</article>',
 readOnlyGscMarkup:()=>''
}));
const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
const prior={id:'prior',status:'completed',
 date_range_start:period.start,date_range_end:period.end,title:'周报'};
const safe=x=>String(x??'');
async function settle(){for(let i=0;i<20;i++)await Promise.resolve()}
function fixture(){
 let html='';
 const sent=[];
 const reports=[prior];
 const btn=(name)=>({name,disabled:false,onclick:null,
  addEventListener(event,fn){this['on'+event]=fn},
  focus(){this.focused=true},
  isConnected:true,textContent:''});
 const trigger=btn('trigger'),cancel=btn('cancel'),confirm=btn('confirm');
 const confirmation={hidden:true,querySelector:selector=>
  selector==='[data-weekly-regenerate-cancel]'?cancel:
  selector==='[data-weekly-regenerate-submit]'?confirm:null};
 const body={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const note={textContent:''};
 const root={
  style:{minHeight:''},getBoundingClientRect:()=>({height:520}),
  set innerHTML(value){html=value},get innerHTML(){return html},
  querySelector(selector){
   if(selector==='[data-weekly-regenerate]')return trigger;
   if(selector==='[data-weekly-regenerate-confirm]')return confirmation;
   if(selector==='[data-weekly-regenerate-cancel]')return cancel;
   if(selector==='[data-weekly-regenerate-submit]')return confirm;
   if(selector==='[data-weekly-body]')return body;
   if(selector==='[data-weekly-note]')return note;
   return null;
  },querySelectorAll:()=>[]
 };
 const api=vi.fn(async(path,method,payload)=>{
  sent.push({path,method,payload});
  if(method==='POST'){
   reports.unshift({id:'replacement',status:'pending',title:'新报告',
    date_range_start:period.start,date_range_end:period.end});
   return {analysisId:'replacement',notice:'新任务已创建'};
  }
  return {period,reports};
 });
 const dispose=mountAIWeeklyReport(root,{api,safe,navigate:vi.fn()});
 return {root,trigger,cancel,confirm,confirmation,api,sent,reports,dispose};
}
afterEach(()=>vi.restoreAllMocks());
describe('AI weekly explicit regeneration',()=>{
 it('requires user confirmation and submits an independent task only once',async()=>{
  const view=fixture();
  await settle();
  expect(view.root.innerHTML).toContain('重新生成 AI 运营周报');
  expect(view.root.innerHTML).toContain('data-weekly-regenerate-confirm hidden');
  view.trigger.onclick();
  expect(view.confirmation.hidden).toBe(false);
  view.cancel.onclick();
  expect(view.confirmation.hidden).toBe(true);
  expect(view.sent.filter(x=>x.method==='POST')).toHaveLength(0);
  view.trigger.onclick();
  await view.confirm.onclick({currentTarget:view.confirm});
  await settle();
  const posts=view.sent.filter(x=>x.method==='POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]).toEqual({
   path:'/ai-weekly-reports/prior/regenerate',method:'POST',
   payload:{acceptPotentialDuplicateCharge:true}
  });
  expect(view.root.innerHTML).toContain('replacement');
  expect(view.root.innerHTML).toContain('data-weekly-regenerate disabled');
  expect(view.reports.some(x=>x.id==='prior'&&x.status==='completed')).toBe(true);
  view.dispose();
 });
});
