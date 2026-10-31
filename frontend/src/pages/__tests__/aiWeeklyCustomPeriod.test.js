import {describe,it,expect,vi,afterEach} from 'vitest';
import {mountAIWeeklyReport} from '../aiWeeklyReportPanel.js';
vi.mock('../../api/aiAnalysis.js',()=>({
 getAnalysisDetail:vi.fn(),getEvidence:vi.fn(),getJobCheckpoint:vi.fn(),
 retryAnalysis:vi.fn(),continueWeeklyOverflow:vi.fn(),deleteAnalysis:vi.fn(),
 getGscPerformance:vi.fn()
}));
vi.mock('../aiTaskStatus.js',()=>({canOfferTaskRetry:vi.fn(()=>false)}));
vi.mock('../../analysisLaunchContext.js',()=>({queueAnalysisLaunch:vi.fn()}));
vi.mock('../aiWeeklyDecisionView.js',()=>({
 renderWeeklyDecisionReport:()=>'<article>report</article>',readOnlyGscMarkup:()=>''
}));
const DAY=86400000,OFFSET=7*3600000;
const local=ms=>new Date(ms+OFFSET).toISOString().slice(0,16);
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
function fixture(){
 const start=Math.floor((Date.now()-7*DAY)/60000)*60000;
 const end=start+6*DAY;
 const defaultPeriod={kind:'weekly',start:start-7*DAY,end:start,
  previousStart:start-14*DAY,previousEnd:start-7*DAY,timezone:'Asia/Bangkok'};
 const customPeriod={kind:'custom',start,end,previousStart:start-6*DAY,
  previousEnd:start,timezone:'Asia/Bangkok'};
 const sent=[];
 const startInput={value:local(defaultPeriod.start)};
 const endInput={value:local(defaultPeriod.end)};
 const apply={addEventListener(type,fn){this['on'+type]=fn}};
 const reset={addEventListener(type,fn){this['on'+type]=fn}};
 const confirm={disabled:false,textContent:'',addEventListener(type,fn){this['on'+type]=fn}};
 const note={textContent:''},body={querySelector:()=>null,querySelectorAll:()=>[]};
 let html='';
 const root={
  style:{minHeight:''},getBoundingClientRect:()=>({height:500}),
  set innerHTML(value){html=value},get innerHTML(){return html},
  querySelector(selector){
   return ({
    '[data-weekly-start]':startInput,'[data-weekly-end]':endInput,
    '[data-weekly-apply-range]':apply,'[data-weekly-reset-range]':reset,
    '[data-weekly-confirm]':confirm,'[data-weekly-note]':note,
    '[data-weekly-body]':body
   })[selector]||null;
  },
  querySelectorAll:()=>[]
 };
 const api=vi.fn(async(path,method,payload)=>{
  sent.push({path,method,payload});
  if(method==='POST')return {analysisId:'custom-report-1'};
  if(path.includes('?start='))return {period:customPeriod,reports:[]};
  return {period:defaultPeriod,reports:[]};
 });
 const dispose=mountAIWeeklyReport(root,{api,safe:x=>String(x??''),navigate:vi.fn()});
 return {root,start,end,startInput,endInput,apply,reset,confirm,api,sent,dispose};
}
afterEach(()=>vi.restoreAllMocks());
describe('AI operating report custom collection period',()=>{
 it('loads an exact custom Bangkok range and submits the same timestamps',async()=>{
  const v=fixture();await settle();
  v.startInput.value=local(v.start);
  v.endInput.value=local(v.end);
  v.apply.onclick();
  await settle();
  const customGet=v.sent.find(x=>x.method===undefined&&x.path.includes('?start='));
  expect(customGet).toBeTruthy();
  expect(customGet.path).toContain('start='+v.start);
  expect(customGet.path).toContain('end='+v.end);
  expect(v.root.innerHTML).toContain('AI 运营报告');
  expect(v.root.innerHTML).toContain('结束不含');
  await v.confirm.onclick({currentTarget:v.confirm});
  const post=v.sent.find(x=>x.method==='POST');
  expect(post).toEqual({path:'/ai-weekly-reports',method:'POST',
   payload:{start:v.start,end:v.end}});
  v.dispose();
 });
 it('can return to the latest completed week preset',async()=>{
  const v=fixture();await settle();
  v.startInput.value=local(v.start);v.endInput.value=local(v.end);
  v.apply.onclick();await settle();
  v.reset.onclick();await settle();
  const last=v.sent.at(-1);
  expect(last.path).toBe('/ai-weekly-reports');
  expect(v.root.innerHTML).toContain('最近完整周');
  v.dispose();
 });
});
