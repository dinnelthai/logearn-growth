import {describe,it,expect,vi,afterEach} from 'vitest';
import {mountAIWeeklyReport} from '../aiWeeklyReportPanel.js';

afterEach(()=>vi.useRealTimers());
const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00')};
function setup(){
 const state={status:'pending',fail:false,reads:0,writes:[],bodyWrites:[],lastNote:''};
 const body={set innerHTML(value){state.bodyWrites.push(value)}};
 const note={set textContent(value){state.lastNote=value}};
 const root={
  style:{minHeight:''},
  getBoundingClientRect:()=>({height:600}),
  set innerHTML(value){state.writes.push(value)},
  get innerHTML(){return state.writes.at(-1)||''},
  querySelector(selector){
   if(selector==='[data-weekly-body]')return body;
   if(selector==='[data-weekly-note]')return note;
   return null;
  },
  querySelectorAll:()=>[]
 };
 const api=async()=>{
  state.reads++;
  if(state.fail)throw Error('temporary network issue');
  return {period,reports:[{id:'weekly-1',title:'AI 运营周报',
   status:state.status,date_range_start:period.start,date_range_end:period.end}],
   archivedCurrentWeek:false,canRegenerateArchivedFailed:false};
 };
 const cleanup=mountAIWeeklyReport(root,{safe:x=>String(x??''),api,
  navigate:()=>{}});
 return {state,root,cleanup};
}
describe('AI weekly live status does not jump scroll',()=>{
 it('does not replace the page during unchanged six-second polls',async()=>{
  vi.useFakeTimers();
  const {state,root,cleanup}=setup();
  for(let i=0;i<12;i++)await Promise.resolve();
  const baseline=state.writes.length;
  const content=root.innerHTML;
  expect(content).toContain('AI 运营周报');
  expect(state.reads).toBe(1);
  await vi.advanceTimersByTimeAsync(6000);
  expect(state.reads).toBe(2);
  expect(state.writes.length).toBe(baseline);
  expect(root.innerHTML).toBe(content);
  await vi.advanceTimersByTimeAsync(6000);
  expect(state.reads).toBe(3);
  expect(state.writes.length).toBe(baseline);
  cleanup();
 });
 it('refreshes once when task status really changes without a loading flash',async()=>{
  vi.useFakeTimers();
  const {state,root,cleanup}=setup();
  for(let i=0;i<12;i++)await Promise.resolve();
  const initialCount=state.writes.length;
  state.status='processing';
  await vi.advanceTimersByTimeAsync(6000);
  expect(state.reads).toBe(2);
  expect(state.writes.length).toBe(initialCount+1);
  expect(state.writes.at(-1)).toContain('AI 正在分析');
  expect(state.writes.at(-1)).not.toContain('正在读取 AI 周报任务与历史');
  expect(root.style.minHeight).toBe('');
  cleanup();
 });
 it('keeps the existing page on a transient background API failure',async()=>{
  vi.useFakeTimers();
  const {state,root,cleanup}=setup();
  for(let i=0;i<12;i++)await Promise.resolve();
  const original=root.innerHTML;
  state.fail=true;
  await vi.advanceTimersByTimeAsync(6000);
  expect(root.innerHTML).toBe(original);
  expect(state.lastNote).toContain('状态刷新暂时失败');
  state.fail=false;
  await vi.advanceTimersByTimeAsync(6000);
  expect(state.reads).toBe(3);
  expect(root.innerHTML).toBe(original);
  cleanup();
 });
});
