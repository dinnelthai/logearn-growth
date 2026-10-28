import {test,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const source=name=>readFileSync(new URL('../../pages/'+name,import.meta.url),'utf8')
test('analysis workflow precedes optional controls and keeps advanced tools collapsed',()=>{
 const s=source('aiAnalysis.js');expect(s.indexOf('<h1>AI 业务增长助手</h1>')).toBeLessThan(s.indexOf('AI Growth Agent · 自主运营驾驶舱'));
 expect(s).toContain('<summary>高级设置与数据来源</summary>');
 expect(s).toContain('自动日报评分目标');
})
test('operations workbench includes AI follow-up with a clear unavailable state',()=>{
 const s=source('workbench.js');expect(s).toContain('getGrowthInbox');expect(s).toContain('AI 待办');expect(s).toContain('AI 待办暂不可用');
})
