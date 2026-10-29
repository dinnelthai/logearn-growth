import {describe,it,expect} from 'vitest';
import {renderWeeklyCoverage,MODULES} from '../aiWeeklyCoverageView.js';
const options={safe:s=>String(s??'').replaceAll('<','&lt;'),fmt:n=>String(n),
 links:ids=>(ids||[]).map(id=>'<button data-weekly-evidence="'+id+'">查看</button>').join('')};
describe('AI weekly 12-module coverage',()=>{
 it('never infers historical analysis without a persisted manifest',()=>{
  const html=renderWeeklyCoverage({result:{weeklyReport:{}}},options);
  expect(MODULES.length).toBe(12);
  expect((html.match(/class="ai-weekly-module" data-module=/g)||[]).length).toBe(12);
  expect(html).toContain('已分析 0');
  expect(html).toContain('已取数待分析 0');
  expect(html).toContain('data-module="seo-organic" data-status="not-investigated"');
  expect(html).toContain('data-module="kol-impact" data-status="not-investigated"');
  expect(html).not.toContain('未连接 / 未授权</span><p>历史');
 });
 it('shows verified numbers and evidence links only from the archived manifest',()=>{
  const manifest={version:'weekly-coverage-v1',modules:[{
   id:'seo-organic',label:'SEO',status:'analyzed',
   reason:'GSC matched PT dates',evidenceIds:['ev-1'],
   insight:'GSC 可验证搜索点击上升',nextAction:'复查重点着陆页',
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
  expect(html).toContain('关键判断：');
  expect(html).toContain('GSC 可验证搜索点击上升');
  expect(html).toContain('复查重点着陆页');
  expect(html).toContain('metrics.clicks');
  expect(html).toContain('180');
  expect(html).toContain('data-module="revenue" data-status="not-connected"');
  expect(html).toContain('data-module="channel-growth" data-status="collected"');
  expect(html).toContain('已分析 1');
  expect(html).toContain('已取数待分析 1');
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
