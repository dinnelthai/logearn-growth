import {describe,it,expect} from 'vitest';
import {renderWeeklyDecisionReport} from '../aiWeeklyDecisionView.js';
import {weeklyCoverageSummary} from '../aiWeeklyCoverageView.js';

const period={
 start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00'),
 previousStart:Date.parse('2026-10-12T00:00:00+07:00'),
 previousEnd:Date.parse('2026-10-19T00:00:00+07:00')
};
const metric=(id,value,isPrevious=false)=>({
 id:id+(isPrevious?'-previous':'-current'),metricId:id,value,
 period:isPrevious?{start:period.previousStart,end:period.previousEnd}:
  {start:period.start,end:period.end}
});
const result={
 context_payload:{
  period,current:{totals:{new_users:18}},previous:{totals:{new_users:40}},
  evidence:[metric('new_users',18),metric('new_users',40,true)]
 },
 result:{
  weeklyCoverage:{version:'weekly-coverage-v1',modules:[{
   id:'growth-overview',status:'analyzed',reason:'有同口径指标',
   evidenceIds:['new_users-current'],insight:'首次分析用户18人',
   facts:[{metric:'new_users',value:18}]
  }]},
  weeklyReport:{partial:false,executiveSummary:'首次分析用户下降',
   metrics:[],issues:[],highlights:[],nextWeek:[],channelFindings:[],dataGaps:[]},
  evidenceIds:[],calls:[]
 }
};
const options={
 safe:s=>String(s??'').replaceAll('<','&lt;'),
 fmt:n=>String(n),
 date:()=> '2026-10-19',
 links:ids=>ids.map(id=>'<button data-weekly-evidence="'+id+'">证据</button>').join(''),
 record:{date_range_start:period.start,date_range_end:period.end,model_name:'test',cost_usd:0}
};
describe('weekly UX actionability and transparent coverage',()=>{
 it('uses the same validated module classifications in report and top summary',()=>{
  expect(weeklyCoverageSummary(result)).toEqual({
   total:12,analyzed:1,collected:0,missing:11
  });
  const html=renderWeeklyDecisionReport({...options,data:result});
  expect(html).toContain('业务分析覆盖：1 / 12 个模块有数值结论');
  expect(html).toContain('数据不足、未连接或未调查 11 项');
  expect(html).toContain('id="weekly-coverage"');
  expect(html).toContain('data-weekly-section="weekly-coverage"');
  expect(html).toContain('data-weekly-section="weekly-actions"');
 });
 it('keeps evidence collapsed and only exposes issue creation when connected',()=>{
  const html=renderWeeklyDecisionReport({...options,data:result,canCreateProblem:true});
  expect(html).toContain('data-weekly-create-problem');
  expect(html).toContain('<details class="ai-weekly-ref ai-weekly-evidence-toggle">');
  expect(html).toContain('data-weekly-action-note');
  const readOnly=renderWeeklyDecisionReport({...options,data:result});
  expect(readOnly).not.toContain('data-weekly-create-problem');
 });
 it('does not invent analyzed modules for a report without an archived manifest',()=>{
  const historical={...result,result:{...result.result,weeklyCoverage:undefined}};
  const html=renderWeeklyDecisionReport({...options,data:historical});
  expect(weeklyCoverageSummary(historical).analyzed).toBe(0);
  expect(html).toContain('业务分析覆盖：0 / 12');
  expect(html).toContain('生成成功不等于所有业务模块已完成分析');
 });
});
