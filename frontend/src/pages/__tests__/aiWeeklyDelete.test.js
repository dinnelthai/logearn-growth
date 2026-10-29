import {describe,it,expect} from 'vitest';
import {mountAIWeeklyReport} from '../aiWeeklyReportPanel.js';

const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
const failed={id:'failed',status:'failed',date_range_start:period.start,
 date_range_end:period.end,error_message:'模型预算不足'};
const completed={...failed,id:'completed',status:'completed',error_message:null};
async function render(rows,archivedCurrentWeek=false){
 const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const seen=[];
 const cleanup=mountAIWeeklyReport(root,{safe,api:async(path,method)=>{
  seen.push([path,method]);
  return {period,reports:rows,archivedCurrentWeek};
 }});
 for(let i=0;i<12;i++)await Promise.resolve();
 const html=root.innerHTML;cleanup();
 return {html,seen};
}
describe('AI weekly report delete availability',()=>{
 it('shows a deletion action only for the selected failed report',async()=>{
  const failedView=await render([failed]);
  expect(failedView.html).toContain('data-weekly-delete>');
  expect(failedView.html).toContain('data-weekly-delete-confirmation hidden');
  expect(failedView.html).toContain('data-weekly-delete-submit');
  expect(failedView.html).toContain('模型费用、调用证据与原始任务会保留');
  expect(failedView.html).toContain('生成失败');
  expect(failedView.seen).toEqual([['/ai-weekly-reports',undefined]]);
  const completedView=await render([completed]);
  expect(completedView.html).not.toContain('data-weekly-delete>');
  expect(completedView.html).not.toContain('data-weekly-delete-confirmation');
 });
 it('does not offer a new paid report after the current week has been removed',async()=>{
  const {html}=await render([],true);
  expect(html).toContain('本周记录已移除');
  expect(html).not.toContain('data-weekly-confirm');
  expect(html).not.toContain('data-weekly-delete');
 });
 it('does not offer deletion while a report is still processing',async()=>{
  const {html}=await render([{...failed,status:'processing'}]);
  expect(html).not.toContain('data-weekly-delete>');
 });
});
