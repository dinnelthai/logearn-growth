import {test,expect} from 'vitest'
import {reportPeriod,rememberReportPeriod,inheritedReportPeriod,localReportTime,bindPeriod} from '../reportPeriod.js'
test('reporting periods include the source day in UTC+7 and end at observed time plus one',()=>{
 const asOf=Date.parse('2026-10-14T18:00:00Z'),p=reportPeriod({days:7,asOf});expect(localReportTime(p.start)).toBe('2026-10-09T00:00');expect(p.end).toBe(asOf+1)
 expect(()=>reportPeriod({days:'custom',start:'2026-10-16T00:00',end:'2026-10-15T00:00'})).toThrow()
 const c=reportPeriod({days:'custom',start:'2026-10-01T00:00',end:'2026-10-15T00:00'});expect(c.end-c.start).toBe(14*86400000)
})
test('inherited periods are copies and switching to custom supplies editable valid dates',()=>{
 rememberReportPeriod({days:14});const state=inheritedReportPeriod();state.days=90;expect(inheritedReportPeriod().days).toBe(14)
 const el={},host={querySelector:s=>s.endsWith('-days]')?el:null},draft={days:14};let called=0;bindPeriod(host,draft,()=>called++);el.onchange({target:{value:'custom'}});expect(called).toBe(1);expect(draft.days).toBe('custom');expect(reportPeriod(draft).end).toBeGreaterThan(reportPeriod(draft).start)
})
test('invalid custom edits keep the last valid shared window and leave the form editable',()=>{
 const valid={days:'custom',start:'2026-10-01T00:00',end:'2026-10-15T00:00'};rememberReportPeriod(valid)
 const nodes={start:{},end:{},error:{}},state={...valid};let changed=0;bindPeriod({querySelector:s=>s.endsWith('-start]')?nodes.start:s.endsWith('-end]')?nodes.end:s.endsWith('-error]')?nodes.error:null},state,()=>changed++)
 nodes.end.onchange({target:{value:'2026-09-01T00:00'}});expect(changed).toBe(0);expect(nodes.error.textContent).toContain('统计期');expect(inheritedReportPeriod()).toEqual(valid);expect(state.end).toBe('2026-09-01T00:00')
})
