import {test,expect} from 'vitest'
import {readFileSync} from 'node:fs'
const source=name=>readFileSync(new URL('../../pages/'+name,import.meta.url),'utf8')
test('AI reports only analysis and retrospectives, while operations and SEO live in their own pages',()=>{
 const agent=source('aiAnalysis.js');
 expect(agent).toContain('ai-history');
 expect(agent).toContain('ai-action-list');
 expect(agent).not.toContain('ai-gsc-settings');
 expect(agent).not.toContain('data-monitor-toggle');
 expect(agent).not.toContain('data-autonomy-target');
 expect(source('seoPage.js')).toContain('data-gsc-sync-form');
 expect(source('growthMonitorPage.js')).toContain('data-monitor-toggle');
 expect(source('growthAgentControl.js')).toContain('data-auto-target');
})
test('operations workbench includes AI follow-up with a clear unavailable state',()=>{
 const s=source('workbench.js');expect(s).toContain('getGrowthInbox');expect(s).toContain('AI 待办');expect(s).toContain('AI 待办暂不可用');
})
