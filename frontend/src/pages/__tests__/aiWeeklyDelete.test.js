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
async function render(rows,archivedCurrentWeek=false,canRegenerateArchivedFailed=false){
 const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const seen=[];
 const cleanup=mountAIWeeklyReport(root,{safe,api:async(path,method)=>{
  seen.push([path,method]);
  return {period,reports:rows,archivedCurrentWeek,canRegenerateArchivedFailed};
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
 it('restores the generate button after a failed weekly report was deleted',async()=>{
  const {html}=await render([],true,true);
  expect(html).toContain('data-weekly-confirm>重新生成 AI 周报');
  expect(html).toContain('创建独立的付费模型任务');
  expect(html).toContain('可能产生重复费用');
  expect(html).not.toContain('data-weekly-delete');
 });
 it('makes paid weekly regeneration available on a completed report',async()=>{
  const {html}=await render([completed]);
  expect(html).toContain('data-weekly-regenerate');
  expect(html).toContain('重新生成 AI 运营周报');
  expect(html).toContain('data-weekly-regenerate-confirm hidden');
  expect(html).toContain('确认重新生成（可能收费）');
  expect(html).toContain('旧报告、证据与历史费用全部保留');
 });
 it('offers a guarded new report on failed history without resetting it',async()=>{
  const {html}=await render([failed]);
  expect(html).toContain('data-weekly-regenerate-confirm hidden');
  expect(html).toContain('重新生成 AI 运营周报');
  expect(html).toContain('删除失败周报');
 });
 it('disables regeneration while a report is pending or processing',async()=>{
  for(const status of ['pending','processing']){
   const {html}=await render([{...failed,status}]);
   expect(html).toContain('data-weekly-regenerate disabled');
   expect(html).not.toContain('data-weekly-regenerate-confirm hidden');
  }
 });
 it('does not offer deletion while a report is still processing',async()=>{
  const {html}=await render([{...failed,status:'processing'}]);
  expect(html).not.toContain('data-weekly-delete>');
 });
});
