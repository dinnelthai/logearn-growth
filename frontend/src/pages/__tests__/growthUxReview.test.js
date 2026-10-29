import {describe,it,expect} from 'vitest';
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
});
