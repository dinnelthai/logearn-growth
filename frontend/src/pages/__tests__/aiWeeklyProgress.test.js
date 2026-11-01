import {describe,it,expect} from 'vitest';
import {weeklyProgressMarkup,weeklyProgressState} from '../aiWeeklyReportPanel.js';

const pending={id:'weekly-1',status:'pending'};
const active={id:'weekly-1',status:'processing'};
const safe=x=>String(x).replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

describe('AI weekly progress from real Worker checkpoints',()=>{
 it('uses an indeterminate indicator when queue progress is unavailable',()=>{
  const view=weeklyProgressState(pending);
  expect(view.title).toContain('等待 Worker');
  expect(view.indeterminate).toBe(true);
  expect(view.percent).toBeNull();
  const html=weeklyProgressMarkup(pending,{safe});
  expect(html).toContain('data-weekly-progress="weekly-1"');
  expect(html).toContain('is-indeterminate');
  expect(html).not.toContain('aria-valuenow=');
  expect(html).toContain('无需重复点击');
 });
 it('maps real 10/40/85 checkpoints to their actual phase, not elapsed time',()=>{
  const rows=[[10,'正在采集'],[40,'AI 正在分析'],[85,'正在校验']];
  for(const [progress,label] of rows){
   const view=weeklyProgressState(active,{state:'active',progress});
   expect(view.percent).toBe(progress);
   expect(view.title).toContain(label);
   const html=weeklyProgressMarkup(active,{safe,job:{state:'active',progress}});
   expect(html).toContain('aria-valuenow="'+progress+'"');
   expect(html).toContain('width:'+progress+'%');
   expect(html).toContain('不是耗时预测');
  }
 });
 it('does not fabricate a percent or a time-to-completion from missing/invalid queue data',()=>{
  for(const progress of [undefined,{},-1,101,NaN]){
   const view=weeklyProgressState(active,{state:'active',progress});
   expect(view.percent).toBeNull();
   expect(view.indeterminate).toBe(true);
  }
  expect(weeklyProgressState({id:'x',status:'failed'})).toBeNull();
  expect(weeklyProgressState({id:'x',status:'completed'})).toBeNull();
  expect(weeklyProgressMarkup({id:'x',status:'completed'},{safe})).toBe('');
 });
});
