import {describe,it,expect} from 'vitest';
import {renderWeeklyCoverage,MODULES} from '../aiWeeklyCoverageView.js';
const options={safe:s=>String(s??'').replaceAll('<','&lt;'),fmt:n=>String(n),
 links:ids=>(ids||[]).map(id=>'<button data-weekly-evidence="'+id+'">查看</button>').join('')};
describe('AI weekly 12-module coverage',()=>{
 it('never infers historical analysis without a persisted manifest',()=>{
  const html=renderWeeklyCoverage({result:{weeklyReport:{}}},options);
  expect(MODULES.length).toBe(12);
  expect((html.match(/class="ai-weekly-module" data-module=/g)||[]).length).toBe(12);
  expect(html).toContain('有数值结论 0');
  expect(html).toContain('已取数待分析 0');
  expect(html).toContain('data-module="seo-organic" data-status="not-investigated"');
  expect(html).toContain('data-module="kol-impact" data-status="not-investigated"');
  expect(html).toContain('<details class="ai-weekly-coverage-gaps">');
  expect(html).toContain('未调查模块 · 12 项（点击展开）');
  expect(html).not.toContain('未连接 / 未授权</span><p>历史');
 });
 it('shows verified numbers and evidence links only from the archived manifest',()=>{
  const manifest={version:'weekly-coverage-v1',modules:[{
   id:'seo-organic',label:'SEO',status:'analyzed',
   reason:'GSC matched PT dates',evidenceIds:['ev-1'],
   insight:'GSC 搜索点击14次，已核对',nextAction:'复查重点着陆页',
   facts:[{metric:'metrics.clicks',value:14},{metric:'metrics.impressions',value:180}]
  },{
   id:'revenue',status:'not-connected',reason:'账本尚未连接'
  },{
   id:'channel-growth',status:'collected',reason:'AI 尚未引用渠道证据',
   evidenceIds:['ev-2'],facts:[{metric:'summary.users',value:71}]
  }]};
  const html=renderWeeklyCoverage({result:{weeklyCoverage:manifest}},options);
  expect(html).toContain('data-module="seo-organic" data-status="analyzed"');
  expect(html).toContain('data-weekly-evidence="ev-1"');
  expect(html).toContain('证据结论：');
  expect(html).toContain('GSC 搜索点击14次，已核对');
  expect(html).toContain('复查重点着陆页');
  expect(html).toContain('metrics.clicks');
  expect(html).toContain('180');
  expect(html).toContain('data-module="revenue" data-status="not-connected"');
  expect(html).toContain('data-module="channel-growth" data-status="collected"');
  expect(html.indexOf('data-module="seo-organic"')).toBeLessThan(
   html.indexOf('data-module="revenue"'));
  expect(html).toContain('数据不足、未连接及未调查模块 · 10 项');
  expect(html).toContain('有数值结论 1');
  expect(html).toContain('已取数待分析 1');
 });
 it('read-only downgrades old covered modules that only claimed data was missing',()=>{
  const manifest={version:'weekly-coverage-v1',modules:[{
   id:'growth-overview',status:'analyzed',
   reason:'AI 引用了证据',evidenceIds:['users-18'],
   insight:'本周首次分析用户18人',facts:[]
  },{
   id:'channel-growth',status:'analyzed',reason:'AI 引用了证据',
   insight:'渠道模块已采集，但没有提供可核对的分渠道指标',
   evidenceIds:['channel-1'],facts:[]
  },{
   id:'activation-funnel',status:'analyzed',reason:'AI 引用了证据',
   insight:'激活漏斗已经采集，但是缺少步骤级统计',
   evidenceIds:['funnel-1'],facts:[{metric:'users',value:12}]
  }]};
  const data={context_payload:{evidence:[{
   id:'users-18',metricId:'new_users',value:18
  }]},result:{weeklyCoverage:manifest}};
  const html=renderWeeklyCoverage(data,options);
  expect(html).toContain('有数值结论 1 · 已取数待分析 1 · 数据缺口 10');
  expect(html).toContain('data-module="growth-overview" data-status="analyzed"');
  expect(html).toContain('data-module="channel-growth" data-status="insufficient"');
  expect(html).toContain('data-module="activation-funnel" data-status="collected"');
  expect(html).not.toContain('证据结论：</strong>渠道模块已采集');
  expect(html).toContain('<details class="ai-weekly-coverage-gaps">');
 });
 it('escapes source text and never sends original data to model',()=>{
  const html=renderWeeklyCoverage({result:{weeklyCoverage:{
   version:'weekly-coverage-v1',modules:[{
    id:'seo-organic',status:'insufficient',
    reason:'<script>alert(1)</script>',evidenceIds:[],facts:[]
   }]
  }}},options);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script>');
 });
});
