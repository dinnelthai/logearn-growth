import {describe,it,expect} from 'vitest';
import {renderWeeklyDecisionReport,trustedMetrics,readOnlyGscMarkup} from '../aiWeeklyDecisionView.js';

const period={
 start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00'),
 previousStart:Date.parse('2026-10-12T00:00:00+07:00'),
 previousEnd:Date.parse('2026-10-19T00:00:00+07:00')
};
const metric=(id,value,old=false)=>({id:id+(old?'-old':'-current'),metricId:id,
 value,period:old?{start:period.previousStart,end:period.previousEnd}:
  {start:period.start,end:period.end}});
const base={
 context_payload:{period,current:{totals:{active_users:71,new_users:18,returning_users:53}},
  previous:{totals:{active_users:82,new_users:40,returning_users:42}},
  evidence:[
   metric('active_users',71),metric('active_users',82,true),
   metric('new_users',18),metric('new_users',40,true),
   metric('returning_users',53),metric('returning_users',42,true)
  ]},
 result:{weeklyReport:{partial:true,executiveSummary:'业务变化需要核对',
  metrics:[],highlights:[],issues:[],nextWeek:[],channelFindings:[],dataGaps:[]},
  calls:[],evidenceIds:[]}
};
const record={title:'AI 运营周报',date_range_start:period.start,
 date_range_end:period.end,model_name:'test',cost_usd:0};
const options={safe:x=>String(x??'').replaceAll('<','&lt;'),fmt:x=>
 typeof x==='number'?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(x):'未知',
 date:x=>new Date(x+7*3600000).toISOString().slice(0,10),
 links:ids=>(ids||[]).map(id=>'<button data-weekly-evidence="'+id+'">查看证据</button>').join('')};
describe('decision-first weekly view',()=>{
 it('puts genuine negative business changes ahead of technical logs',()=>{
  const html=renderWeeklyDecisionReport({...options,data:base,record});
  expect(html.indexOf('最需要处理的问题')).toBeLessThan(html.indexOf('关键指标 · 环比'));
  expect(html).toContain('首次分析用户下降 55%');
  expect(html).toContain('分析活跃用户下降 13.41%');
  expect(html).toContain('18');
  expect(html).toContain('40');
  expect(html).toContain('data-weekly-evidence="new_users-current"');
  expect(html.indexOf('审计与原始证据')).toBeGreaterThan(html.indexOf('下周行动清单'));
 });
 it('makes P0 risk, trend arrows and next-week action visually distinct',()=>{
  const report={...base,result:{...base.result,weeklyReport:{
   ...base.result.weeklyReport,
   nextWeek:[{priority:'P0',action:'核查首次分析漏斗',
    metric:'activation_rate',reviewCondition:'下个完整周',
    evidenceIds:[]}]} }};
  const html=renderWeeklyDecisionReport({...options,data:report,record});
  expect(html).toContain('class="ai-weekly-panel ai-weekly-priority-panel"');
  expect(html).toContain('data-priority="p0"');
  expect(html).toContain('class="ai-weekly-problem-change"');
  expect(html).toContain('↓ 55%');
  expect(html).not.toContain('↓ -55%');
  expect(html).toContain('class="ai-weekly-kpi" data-trend="down"');
  expect(html).toContain('class="ai-weekly-action" data-priority="p0"');
  expect(html).toContain('data-coverage="unknown"');
 });
 it('does not invent historical SEO results without saved GSC evidence',()=>{
  const html=renderWeeklyDecisionReport({...options,data:base,record});
  expect(html).toContain('本次历史周报未采集 SEO 数据');
  expect(html).toContain('data-weekly-navigate="seo"');
  expect(html).not.toContain('搜索点击</span><strong>0');
 });
 it('shows GSC numbers only with an explicit saved source status',()=>{
  const data={...base,context_payload:{...base.context_payload,evidence:[
   ...base.context_payload.evidence,{id:'gsc',metricId:'seo_search',
    value:{metrics:{clicks:14,impressions:180}},period}
  ]},result:{...base.result,weeklySources:{seo:{status:'period-matched',
   periodMatched:true,evidenceIds:['gsc']}}}};
  const html=renderWeeklyDecisionReport({...options,data,record});
  expect(html).toContain('已获取匹配期间的 GSC 证据');
  expect(html).toContain('搜索点击');
  expect(html).toContain('搜索曝光');
  expect(html).toContain('180');
 });
 it('adds a saved exact-date GSC snapshot without claiming historic AI attribution',()=>{
  const report={available:true,report:{startDate:'2026-10-19',endDate:'2026-10-25',
   metrics:{clicks:14,impressions:180,ctr:0.077777,position:9.2}}};
  const html=readOnlyGscMarkup(report,{safe:options.safe,fmt:options.fmt,
   startDate:'2026-10-19',endDate:'2026-10-25'});
  expect(html).toContain('14');
  expect(html).toContain('180');
  expect(html).toContain('未参与这份历史 AI 周报');
  const mismatch=readOnlyGscMarkup(report,{safe:options.safe,fmt:options.fmt,
   startDate:'2026-10-12',endDate:'2026-10-18'});
  expect(mismatch).not.toContain('180');
  expect(mismatch).toContain('没有已同步');
 });
 it('validates values against the archived business weeks',()=>{
  const rows=trustedMetrics(base);
  expect(rows.find(x=>x.metricId==='new_users').changePct).toBeCloseTo(-55,8);
  expect(rows.find(x=>x.metricId==='active_users').changePct).toBeCloseTo(-13.4146,3);
  const wrong={...base,context_payload:{...base.context_payload,
   evidence:base.context_payload.evidence.filter(x=>x.id!=='new_users-current')}};
  expect(trustedMetrics(wrong).find(x=>x.metricId==='new_users').evidenceIds.length).toBe(1);
 });
});
