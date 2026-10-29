import {describe,it,expect} from 'vitest';
import {renderSeoReport,safeSeoUrl,queryGroup} from '../../pages/seoReportView.js';
const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const report={
 siteUrl:'sc-domain:logearn.com',startDate:'2026-10-01',endDate:'2026-10-14',
 syncedAt:1793242664000,metrics:{clicks:46,impressions:130,ctr:46/130,position:4.2},
 coverage:{reportedDays:14,expectedDays:14,queryRowsReturned:2,pageRowsReturned:2},
 daily:Array.from({length:14},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),clicks:i%3,impressions:i+1,ctr:.1,position:4.2})),
 queries:[{query:'logearn',clicks:27,impressions:32,ctr:27/32,position:1},{query:'token bsc',clicks:0,impressions:1,ctr:0,position:55}],
 pages:[{page:'https://logearn.com/?accessToken=SECRET-ABC&referral=TEST',clicks:0,impressions:25,ctr:0},
  {page:'https://dev.logearn.com/en/trending',clicks:0,impressions:7,ctr:0}],
 warnings:['查询行不代表整站']
};
describe('SEO report readability',()=>{
 it('protects query parameter values in every visible URL',()=>{
  const value=safeSeoUrl(report.pages[0].page);
  expect(value.sensitive).toBe(true);
  expect(value.label).toContain('accessToken=[已隐藏]');
  expect(value.label).not.toContain('SECRET-ABC');
 });
 it('renders trends, query labels and useful page issues without leaking values',()=>{
  const html=renderSeoReport(report,esc);
  expect(html).toContain('搜索趋势');
  expect(html).toContain('data-seo-filter="brand"');
  expect(html).toContain('开发环境页面');
  expect(html).toContain('敏感参数 URL');
  expect(html).toContain('27 / 46');
  expect(html).not.toContain('SECRET-ABC');
  expect(html).not.toContain('referral=TEST');
  expect(html).toContain('查看完整逐日明细');
 });
 it('labels keyword groups as provisional, avoiding traffic inference',()=>{
  expect(queryGroup('logearn')).toBe('brand');
  expect(queryGroup('token bsc')).toBe('candidate');
  expect(queryGroup('还有哪些')).toBe('review');
  expect(renderSeoReport({...report,queries:[]},esc)).toContain('Google 未返回可显示的搜索查询行');
 });
});
