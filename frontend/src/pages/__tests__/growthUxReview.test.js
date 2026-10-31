import {describe,it,expect,vi} from 'vitest';
import {mountGrowthDecisionWorkspace} from '../growthDecisionWorkspace.js';
import {renderSeoReport} from '../seoReportView.js';
import {queueAnalysisLaunch,consumeAnalysisLaunch} from '../../analysisLaunchContext.js';

const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sample={
 siteUrl:'https://example.com/',startDate:'2026-10-01',endDate:'2026-10-14',
 metrics:{clicks:6,impressions:1500,ctr:0.004,position:12.5},
 daily:[{date:'2026-10-01',clicks:1,impressions:1000},{date:'2026-10-02',clicks:5,impressions:500}],
 queries:[],pages:[],opportunities:[{query:'holder chart',reason:'曝光高但点击有限',impressions:1000,clicks:5,position:11}]
};
describe('Growth UI review regressions',()=>{
 it('renders SEO clicks and impressions on independent trend scales',()=>{
  const html=renderSeoReport(sample,escape);
  expect((html.match(/class="seo-trend"/g)||[]).length).toBe(2);
  expect(html).toContain('点击趋势');
  expect(html).toContain('曝光趋势');
  expect(html).toContain('最高日 5');
  expect(html).toContain('最高日 1,000');
 });
 it('shows actionable SEO opportunity evidence without claiming conversion',()=>{
  const html=renderSeoReport(sample,escape);
  expect(html).toContain('值得核查的搜索机会');
  expect(html).toContain('holder chart');
  expect(html).toContain('曝光 1,000');
 });
 it('consumes cross-page AI analysis navigation context only once',()=>{
  queueAnalysisLaunch({kind:'analysis',analysisId:'analysis-123'});
  expect(consumeAnalysisLaunch()).toEqual({kind:'analysis',analysisId:'analysis-123'});
  expect(consumeAnalysisLaunch()).toBeNull();
 });
 it('keeps the weekly report prominent and collapses secondary workspace tasks',async()=>{
  const problems=[
   {id:'p1',type:'data-quality',subject:'数据质量',status:'open',priority:5,description:'采集待核查',next_step:'补查'},
   {id:'p2',type:'business',subject:'激活下降',status:'open',priority:4,description:'流失变化',next_step:'分析'},
   {id:'p3',type:'business',subject:'转化变化',status:'monitoring',priority:3,description:'来源变化',next_step:'核对'},
   {id:'p4',type:'business',subject:'已解决的问题',status:'resolved',priority:2,description:'历史记录',next_step:'观察'}
  ];
  const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
  vi.stubGlobal('localStorage',{getItem:()=>null});
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({
   month:{start:1790802000000},goals:[],problems,actions:[],reports:[]
  })})));
  try{
   const dispose=mountGrowthDecisionWorkspace(root);
   for(let i=0;i<8;i++)await Promise.resolve();
   expect(root.innerHTML).toContain('ga-ws-weekly');
   expect(root.innerHTML.indexOf('ga-ws-executive')).toBeLessThan(root.innerHTML.indexOf('ga-ws-weekly'));
   expect(root.innerHTML.indexOf('ga-ws-weekly')).toBeLessThan(root.innerHTML.indexOf('ga-ws-overview'));
   expect(root.innerHTML).toContain('增长大脑 · 今日判断');
   expect(root.innerHTML).toContain('ga-ws-executive" style="grid-column:1/-1;grid-row:auto;min-width:0"');
   expect(root.innerHTML).toContain('关键数据尚未通过完整性核验');
   expect(root.innerHTML).toContain('未解决问题</strong><p>3');
   expect(root.innerHTML).toContain('数据质量问题</strong><p>1');
   expect(root.innerHTML).toContain('其他问题（1）');
   expect(root.innerHTML).toContain('<details class="ga-ws-accordion"><summary>查看目标与设置');
   expect(root.innerHTML).toContain('<details class="ga-ws-accordion"><summary>手工新增问题');
   expect(root.innerHTML).toContain('data-investigate="p1"');
   expect(root.innerHTML).toContain('data-history="p1"');
   expect((root.innerHTML.match(/<section\b/g)||[]).length)
    .toBe((root.innerHTML.match(/<\/section>/g)||[]).length);
   dispose();
  }finally{
   vi.unstubAllGlobals();
  }
 });
});
